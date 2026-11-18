import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {createHash,createECDH,randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import webpush from 'web-push';
import ece from 'http_ece';

test('background push isolates accounts, queues atomically, retries safely and proves device display separately',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const execute=(sql,args)=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};};
 const prepare=(sql,args=[])=>({bind:(...next)=>prepare(sql,next),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({success:true,results:db.prepare(sql).all(...args)}),run:async()=>execute(sql,args),execute:()=>execute(sql,args)});
 const pair=webpush.generateVAPIDKeys();
 globalThis.__pushEnv={DB:{prepare,batch:async statements=>{db.exec('BEGIN');try{const out=statements.map(s=>s.execute());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}},WEB_PUSH_VAPID_PUBLIC_KEY:pair.publicKey,WEB_PUSH_VAPID_PRIVATE_KEY:pair.privateKey};
 await mkdir('outputs/push-tests',{recursive:true});
 await build({stdin:{contents:`export * from './lib/push.ts';export {ensureDatabase} from './lib/db.ts';export {GET,POST} from './app/api/push/route.ts';`,resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},outfile:'outputs/push-tests/routes.mjs',bundle:true,format:'esm',platform:'node',external:['web-push'],plugins:[{name:'push-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__pushEnv;'}));}}]});
 const api=await import('../outputs/push-tests/routes.mjs');await api.ensureDatabase();
 const version='00000000-0000-4000-8000-000000000000',token=name=>version+'.'+name.padEnd(43,'x'),digest=name=>createHash('sha256').update(token(name)).digest('hex');
 for(const a of ['operator','student'])db.prepare('INSERT INTO app_settings(key,value) VALUES (?,?)').run('auth_security_'+a,JSON.stringify({version,digest:'0'.repeat(64)}));
 for(const [id,name,role] of [[1,'private-admin','admin'],[2,'private-teacher','instructor'],[3,'private-other','instructor'],[4,'private-employee','employee']]){
  db.prepare("INSERT INTO staff(id,name,phone_hash,phone_last4,role) VALUES (?,?,?,'0000',?)").run(id,name,name,role);
  db.prepare("INSERT INTO sessions(token_hash,staff_id,expires_at) VALUES (?,?,'2100-01-01')").run(digest(name),id);
 }
 for(const id of [1,2]){db.prepare("INSERT INTO booking_members(id,name,phone_hash,phone_last4,approval_status,approved_by) VALUES (?, ?, ?, '0000','APPROVED',1)").run(id,'private-student-'+id,'student-'+id);db.prepare("INSERT INTO member_sessions(token_hash,member_id,expires_at) VALUES (?,?,'2100-01-01')").run(digest('student'+id),id);}
 const request=(who='',body,options={})=>new Request('https://push.test/api/push'+(!body?'?audience='+options.audience:''),{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(who?{cookie:`${who.startsWith('student')?'thecup_member_session':'thecup_session'}=${token(who)}`} : {}),...(options.origin?{origin:options.origin}: {})},body:body?JSON.stringify(body):undefined});
 const act=(who,body,options)=>api.POST(request(who,{audience:who.startsWith('student')?'MEMBER':'STAFF',...body},options));
 const sub=label=>{const ec=createECDH('prime256v1');ec.generateKeys();const auth=randomBytes(16);return {endpoint:'https://fcm.googleapis.com/fcm/send/'+label,keys:{p256dh:ec.getPublicKey().toString('base64url'),auth:auth.toString('base64url')},ec,auth};};
 const devices={admin:sub('admin'),teacher:sub('teacher'),other:sub('other'),employee:sub('employee'),student:sub('student'),student2:sub('student2')};
 const register=(who,s)=>act(who,{action:'subscribe',subscription:{endpoint:s.endpoint,keys:s.keys}});
 const consult=()=>{const r=db.prepare("INSERT INTO learning_consultations(member_id,name,phone_encrypted,age_range,discovery,interests,contact_channel,consent_version,message) VALUES (1,'DO NOT PUSH THIS NAME','encrypted-private-contact','30대','SNS','[]','전화','test','PRIVATE MEMO')").run();return Number(r.lastInsertRowid);};
 const old=consult();
 const nativeFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=nativeFetch;delete globalThis.__pushEnv;db.close();});
 const calls=[];const sender=async(row,payload)=>{calls.push({audience:row.audience,id:row.actor_id,kind:row.kind,payload});return 201;};
 await t.test('login, CSRF, provider allowlist and curve keys are enforced; only public VAPID key returns',async()=>{
  assert.equal((await api.GET(request('',null,{audience:'STAFF'}))).status,401);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM edu_push_events').get().n,0);
  const r=await api.GET(request('private-admin',null,{audience:'STAFF'}));assert.equal(r.status,200);const data=await r.json();assert.equal(data.publicKey,pair.publicKey);assert.equal(data.configured,true);assert.doesNotMatch(JSON.stringify(data),new RegExp(pair.privateKey));
  assert.equal((await act('private-admin',{action:'subscribe',subscription:devices.admin},{origin:'https://evil.test'})).status,403);
  for(const endpoint of ['http://fcm.googleapis.com/send/x','https://localhost/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://fcm.googleapis.com:444/x','https://name:pass@web.push.apple.com/x'])assert.equal(api.validPushEndpoint(endpoint),false);
  assert.equal(api.validPushKeys({p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url'),auth:randomBytes(16).toString('base64url')}),false);
  assert.equal((await act('private-admin',{action:'subscribe',subscription:{...devices.admin,endpoint:'https://evil.test/x'}})).status,400);
  for(const [who,s] of [['private-admin',devices.admin],['private-teacher',devices.teacher],['private-other',devices.other],['private-employee',devices.employee],['student1',devices.student],['student2',devices.student2]])assert.equal((await register(who,s)).status,200);
  assert.equal((await act('private-other',{action:'unsubscribe',endpoint:devices.admin.endpoint})).status,404);
 });
 await t.test('existing records never replay; new consultations target admins, assignment targets only current instructor',async()=>{
  assert.deepEqual(await api.dispatchPush({send:sender}),{configured:true,accepted:0,failed:0});
  const id=consult();db.prepare('UPDATE learning_consultations SET instructor_id=2 WHERE id=?').run(id);
  await api.dispatchPush({send:sender});assert.deepEqual(calls.map(c=>[c.id,c.kind]).sort((a,b)=>a[0]-b[0]),[[1,'CONSULTATION_NEW'],[2,'CONSULTATION_ASSIGNED']]);assert.ok(!calls.some(c=>c.id===3||c.id===4));
  assert.doesNotMatch(JSON.stringify(calls),/DO NOT PUSH|PRIVATE MEMO|encrypted-private|private-admin|phone/);
  const count=calls.length;await api.dispatchPush({send:sender});assert.equal(calls.length,count);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM edu_push_events WHERE entity_id=? AND kind=?').get(old,'CONSULTATION_NEW').n,0);
 });
 const reserve=day=>{
  const start=`2099-01-${day}T09:00:00+09:00`,end=`2099-01-${day}T11:30:00+09:00`;
  const slot=Number(db.prepare("INSERT INTO booking_slots(station_id,start_at,end_at,created_by) VALUES (1,?,?,1)").run(start,end).lastInsertRowid);
  return Number(db.prepare("INSERT INTO reservations(member_id,slot_id,pass_id,slot_start_at,status,purpose,material_plan,enrollment_id) VALUES (1,?,1,?,'REQUESTED','private course','CENTER',1)").run(slot,start).lastInsertRowid);
 };
 db.exec("INSERT INTO member_passes(id,member_id,type,valid_month,price,created_by) VALUES (1,1,'MONTHLY','2099-01',0,1);INSERT INTO course_enrollments(id,request_key,member_id,course_key,course_name,station_type,instructor_id,total_sessions,session_minutes,paid_amount,price_type,created_by) VALUES (1,'push-fixture',1,'barista:foundation','private course','ESPRESSO',2,20,150,0,'REGULAR',1)");
 await t.test('reservation requests reach admins/assigned teacher; outcomes reach only the right student',async()=>{
  calls.length=0;const id=reserve('05');await api.dispatchPush({send:sender});assert.deepEqual(calls.map(c=>[c.audience,c.id]).sort((a,b)=>a[1]-b[1]),[['STAFF',1],['STAFF',2]]);
  calls.length=0;db.prepare("UPDATE reservations SET status='CONFIRMED' WHERE id=?").run(id);await api.dispatchPush({send:sender});assert.deepEqual(calls.map(c=>[c.audience,c.id,c.kind]),[['MEMBER',1,'RESERVATION_CONFIRMED']]);
  calls.length=0;db.prepare("UPDATE reservations SET status='CANCELLED' WHERE id=?").run(id);await api.dispatchPush({send:sender});assert.equal(calls.length,3);assert.ok(calls.some(c=>c.audience==='MEMBER'&&c.id===1));assert.ok(!calls.some(c=>c.audience==='MEMBER'&&c.id===2));
 });
 await t.test('obsolete decisions, source deletion and changed instructor access suppress old alerts',async()=>{
  calls.length=0;const id=reserve('06');db.prepare("UPDATE reservations SET status='CONFIRMED' WHERE id=?").run(id);db.prepare("UPDATE reservations SET status='CANCELLED' WHERE id=?").run(id);
  const c=consult();db.prepare('UPDATE learning_consultations SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(c);
  await api.dispatchPush({send:sender});assert.ok(calls.every(c=>c.kind==='RESERVATION_CANCELLED'));
  calls.length=0;reserve('07');db.prepare('UPDATE course_enrollments SET instructor_id=3 WHERE id=1').run();await api.dispatchPush({send:sender});assert.ok(calls.some(c=>c.id===3));assert.ok(!calls.some(c=>c.id===2));db.prepare('UPDATE course_enrollments SET instructor_id=2 WHERE id=1').run();
 });
 await t.test('source writes and push outbox roll back together',async()=>{
  const before=db.prepare('SELECT COUNT(*) n FROM edu_push_events').get().n;
  db.exec('BEGIN');consult();db.exec('ROLLBACK');assert.equal(db.prepare('SELECT COUNT(*) n FROM edu_push_events').get().n,before);
 });
 await t.test('two dispatches cannot both claim the same delivery',async()=>{
  calls.length=0;const id=consult();await Promise.all([api.dispatchPush({send:sender}),api.dispatchPush({send:sender})]);assert.equal(calls.filter(c=>c.kind==='CONSULTATION_NEW').length,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM edu_push_deliveries d JOIN edu_push_events e ON e.id=d.event_id WHERE e.entity_id=? AND e.kind='CONSULTATION_NEW'").get(id).n,1);
 });
 await t.test('preference changes and unsubscribing are scoped to the current account/device',async()=>{
  assert.equal((await act('private-admin',{action:'preferences',endpoint:devices.admin.endpoint,consultations:false,bookings:true})).status,200);calls.length=0;consult();await api.dispatchPush({send:sender});assert.equal(calls.length,0);
  assert.equal((await act('private-admin',{action:'preferences',endpoint:devices.admin.endpoint,consultations:true,bookings:true})).status,200);
  await api.dispatchPush({send:sender});assert.equal(calls.length,0); // Do not replay the period when this category was off.
  assert.equal((await act('student2',{action:'unsubscribe',endpoint:devices.student2.endpoint})).status,200);assert.equal(db.prepare('SELECT enabled FROM edu_push_subscriptions WHERE endpoint=?').get(devices.student.endpoint).enabled,1);
 });
 await t.test('test requests are rate limited; provider acceptance never masquerades as on-device display',async()=>{
  const response=await act('private-admin',{action:'test',endpoint:devices.admin.endpoint});assert.equal(response.status,202);const {testId}=await response.json();
  assert.equal((await act('private-admin',{action:'test',endpoint:devices.admin.endpoint})).status,429);
  await api.dispatchPush({send:sender});let status=await(await act('private-admin',{action:'status',endpoint:devices.admin.endpoint,testId})).json();assert.equal(status.test.state,'ACCEPTED');assert.equal(status.test.displayedAt,null);
  assert.equal((await act('student1',{action:'ack',endpoint:devices.admin.endpoint,eventId:testId,displayed:true})).status,404);
  assert.equal((await act('private-admin',{action:'ack',endpoint:devices.admin.endpoint,eventId:testId,displayed:true})).status,200);
  status=await(await act('private-admin',{action:'status',endpoint:devices.admin.endpoint,testId})).json();assert.equal(status.test.state,'DISPLAYED');assert.ok(status.test.displayedAt);
 });
 await t.test('a device acknowledgement winning the race with the provider response stays displayed',async()=>{
  db.exec('UPDATE edu_push_subscriptions SET last_test_at=NULL');const r=await act('private-admin',{action:'test',endpoint:devices.admin.endpoint}),{testId}=await r.json();
  await api.dispatchPush({send:async(row)=>{if(row.kind==='TEST')assert.equal((await act('private-admin',{action:'ack',endpoint:devices.admin.endpoint,eventId:testId,displayed:true})).status,200);return 201;}});
  assert.equal(db.prepare('SELECT state FROM edu_push_deliveries WHERE event_id=?').get(testId).state,'DISPLAYED');
 });
 await t.test('encrypted aes128gcm Web Push is sent only to the allowed provider without following redirects',async()=>{
  const device=db.prepare('SELECT * FROM edu_push_subscriptions WHERE endpoint=?').get(devices.admin.endpoint);let captured;
  globalThis.fetch=async(url,options)=>{captured={url,options};return new Response(null,{status:201});};
  const payload=api.notificationPayload({...device,kind:'TEST',eventId:'a'.repeat(32)});assert.equal(await api.sendWebPush(device,payload),201);assert.equal(captured.options.redirect,'manual');assert.equal(captured.url,devices.admin.endpoint);assert.equal(captured.options.headers['Content-Encoding'],'aes128gcm');
  const decrypted=ece.decrypt(Buffer.from(captured.options.body),{version:'aes128gcm',privateKey:devices.admin.ec,authSecret:devices.admin.auth}).toString();assert.deepEqual(JSON.parse(decrypted),payload);assert.doesNotMatch(Buffer.from(captured.options.body).toString(),/더컵에듀 테스트/);globalThis.fetch=nativeFetch;
 });
 await t.test('retry failures are bounded and expired provider endpoints are disabled',async()=>{
  db.exec('UPDATE edu_push_subscriptions SET last_test_at=NULL');let r=await act('private-admin',{action:'test',endpoint:devices.admin.endpoint});let {testId}=await r.json();
  for(let i=0;i<3;i++){db.exec('UPDATE edu_push_deliveries SET retry_at=0,lease_until=0');await api.dispatchPush({send:async()=>{throw Error('offline');}});}
  assert.equal(db.prepare('SELECT state,attempts FROM edu_push_deliveries WHERE event_id=?').get(testId).state,'FAILED');
  db.exec('UPDATE edu_push_subscriptions SET last_test_at=NULL');r=await act('private-admin',{action:'test',endpoint:devices.admin.endpoint});({testId}=await r.json());await api.dispatchPush({send:async()=>410});assert.equal(db.prepare('SELECT enabled FROM edu_push_subscriptions WHERE endpoint=?').get(devices.admin.endpoint).enabled,0);
  assert.equal((await register('private-admin',devices.admin)).status,200);
 });
 await t.test('device limit is atomic, permits idempotent reconnect and rejects an eleventh device',async()=>{
  for(let i=0;i<9;i++)assert.equal((await register('private-employee',sub('limit-'+i))).status,200);
  assert.equal((await register('private-employee',sub('limit-extra'))).status,409);
  assert.equal((await register('private-employee',devices.employee)).status,200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM edu_push_subscriptions WHERE audience='STAFF' AND actor_id=4 AND enabled=1").get().n,10);
 });
 await t.test('logout, student revocation and security-code rotation stop background deliveries',async()=>{
  calls.length=0;db.prepare("DELETE FROM sessions WHERE staff_id=1").run();db.prepare("UPDATE booking_members SET approval_status='REVOKED' WHERE id=1").run();consult();await api.dispatchPush({send:sender});assert.equal(calls.length,0);
  assert.equal((await act('student1',{action:'status',endpoint:devices.student.endpoint})).status,401);
  db.prepare("UPDATE app_settings SET value=? WHERE key='auth_security_operator'").run(JSON.stringify({version:crypto.randomUUID(),digest:'0'.repeat(64)}));await api.dispatchPush({send:sender});assert.equal(db.prepare("SELECT COUNT(*) n FROM edu_push_subscriptions WHERE audience='STAFF' AND enabled=1").get().n,0);
 });
});
