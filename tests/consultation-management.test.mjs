import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {build} from 'esbuild';

test('consultation inbox, notifications, edits and recoverable deletion protect existing accounts', async t=>{
 process.env.SESSION_SECRET='consultation-test-secret-never-production';
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const prepare=(sql,args=[])=>({bind:(...next)=>prepare(sql,next),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args),success:true}),run:async()=>{const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}});
 let queue=Promise.resolve();
 const database={prepare,batch:statements=>{const work=queue.then(async()=>{db.exec('BEGIN');try{const results=[];for(const item of statements)results.push(await item.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}});queue=work.catch(()=>{});return work;}};
 globalThis.__consultEnv={DB:database};t.after(()=>{db.close();delete globalThis.__consultEnv});
 const bundle=await build({stdin:{contents:`
 export {GET as list,PATCH as edit,DELETE as remove} from './app/api/learning/consultation-management/route.ts';
 export {GET as notifications} from './app/api/learning/notifications/route.ts';
 export {GET as members,POST as act} from './app/api/learning/admin/route.ts';
 export {POST as submit} from './app/api/learning/consultations/route.ts';
 export {ensureLearningSchema} from './lib/learning-schema.ts';
 export {encryptContact,decryptContact} from './lib/consultation-contact.ts';
 `,resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'inbox-test',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'inbox'}));b.onLoad({filter:/.*/,namespace:'inbox'},()=>({contents:'export const env=globalThis.__consultEnv'}));}}]});
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const version='00000000-0000-4000-8000-000000000000',token=s=>version+'.'+s.padEnd(43,'x');
 const req=(path,who='admin',body,method='GET',origin)=>new Request('https://consult.invalid'+path,{method,headers:{...(who?{cookie:'thecup_session='+token(who)}:{}),'Content-Type':'application/json',...(origin?{origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await api.list(req('/api/learning/consultation-management',''))).status,401);
 for(const audience of ['operator','student'])db.prepare('INSERT INTO app_settings(key,value) VALUES (?,?)').run('auth_security_'+audience,JSON.stringify({version,digest:'0'.repeat(64)}));
 for(const [id,name,role] of [[1,'admin','admin'],[2,'teacher','instructor'],[3,'other','instructor'],[4,'employee','employee']]){
  db.prepare("INSERT INTO staff(id,name,phone_hash,phone_last4,role) VALUES (?,?,?,'0000',?)").run(id,name,name,role);
  db.prepare("INSERT INTO sessions(token_hash,staff_id,expires_at) VALUES (?,?,'2100-01-01')").run(createHash('sha256').update(token(name)).digest('hex'),id);
 }
 for(const [id,status] of [[1,'PENDING'],[2,'APPROVED'],[3,'REVOKED']])db.prepare("INSERT INTO booking_members(id,name,phone_hash,phone_last4,approval_status) VALUES (?,? ,?,'1111',?)").run(id,'회원'+id,'hash'+id,status);
 const encrypted=await api.encryptContact('01000001111');
 db.prepare("INSERT INTO learning_consultations(member_id,name,phone_encrypted,age_range,discovery,interests,contact_channel,consent_version,instructor_id) VALUES (1,'기존 상담',?,'30대','SNS',?,'전화','test',2)").run(encrypted, JSON.stringify(['barista:foundation']));
 const list=async(suffix='',who='admin')=>{const r=await api.list(req('/api/learning/consultation-management'+suffix,who));assert.equal(r.status,200,await r.clone().text());return r.json()};
 const detail=async(id=1,who='admin')=>(await list('?id='+id,who)).detail;
 const change=async(body,who='admin',method='PATCH')=>api[method==='DELETE'?'remove':'edit'](req('/api/learning/consultation-management',who,body,method));
 const snapshot=()=>({members:db.prepare('SELECT * FROM booking_members ORDER BY id').all(),staff:db.prepare('SELECT * FROM staff ORDER BY id').all(),reservations:db.prepare('SELECT * FROM reservations').all(),finance:db.prepare('SELECT * FROM finance_transactions').all(),enrollments:db.prepare('SELECT * FROM course_enrollments').all()});
 await t.test('existing schema upgrades idempotently without changing saved consultation content',async()=>{
  const saved=db.prepare('SELECT name,phone_encrypted,status FROM learning_consultations WHERE id=1').get();
  db.exec('DROP INDEX learning_consultations_inbox; ALTER TABLE learning_consultations DROP COLUMN deleted_at; ALTER TABLE learning_consultations DROP COLUMN revision; ALTER TABLE learning_consultations DROP COLUMN phone_last4;');
  await api.ensureLearningSchema(database);await api.ensureLearningSchema(database);
  assert.deepEqual(db.prepare('SELECT name,phone_encrypted,status FROM learning_consultations WHERE id=1').get(),saved);
  assert.equal((await detail()).revision,1);assert.equal((await list()).rows[0].phoneLast4,'1111');
 });
 await t.test('private notifications and detail require staff permission; no plaintext contact in lists',async()=>{
  for(const handler of [api.list,api.notifications]){assert.equal((await handler(req('/api/learning/notifications',''))).status,401);assert.equal((await handler(req('/api/learning/notifications','employee'))).status,403);}
  assert.equal((await api.list(req('/api/learning/consultation-management?id=1','other'))).status,403);
  assert.equal((await detail(1,'teacher')).phone,'01000001111');
  const r=await api.notifications(req('/api/learning/notifications'));assert.match(r.headers.get('cache-control'),/private, no-store/);
  assert.deepEqual(await r.json(),{newConsultations:1,latestId:1});
  assert.deepEqual(await(await api.notifications(req('/api/learning/notifications','other'))).json(),{newConsultations:0,latestId:0});
  assert.doesNotMatch(JSON.stringify(await list()),/01000001111|encrypted|staffNote|phone_hash/);
  assert.equal((await api.edit(req('/api/learning/consultation-management','admin',{id:1,revision:1},'PATCH','https://other.invalid'))).status,403);
 });
 await t.test('approved students and nonstudents are separate; sort and search stay server-side',async()=>{
  const approved=await(await api.members(req('/api/learning/admin?audience=students'))).json();
  const prospective=await(await api.members(req('/api/learning/admin?audience=prospects'))).json();
  assert.deepEqual(approved.members.map(row=>row.id),[2]);assert.deepEqual(prospective.members.map(row=>row.id),[3,1]);
  for(let i=0;i<29;i++)db.prepare("INSERT INTO learning_consultations(member_id,name,phone_encrypted,age_range,discovery,interests,contact_channel,consent_version,status) VALUES (1,?,?,'30대','SNS','[]','전화','test','CONTACTED')").run('정렬'+String(i).padStart(2,'0'),encrypted);
  assert.equal((await list()).total,30);assert.equal((await list()).rows.length,25);assert.equal((await list('?page=2')).rows.length,5);
  assert.equal((await list('?page=999')).page,2);
  assert.equal((await list('?sort=oldest')).rows[0].id,1);assert.equal((await list('?status=NEW')).total,1);
  assert.equal((await list('?q=정렬01')).total,1);assert.equal((await list('?q=%25')).total,0);
  assert.equal((await api.list(req('/api/learning/consultation-management?sort=bad'))).status,400);
 });
 const baseline=snapshot();
 await t.test('editing full consultation preserves login/account and encrypts changed contact',async()=>{
  const before=await detail();const body={...before,name:'상담 수정',phone:'01099998888',staffNote:'내부 메모',interests:['brewing:foundation'],status:'CONTACTED'};
  const result=await change(body);assert.equal(result.status,200,await result.clone().text());
  const after=await detail();assert.equal(after.name,'상담 수정');assert.equal(after.phone,'01099998888');assert.equal(after.revision,2);
  assert.equal((await list('?q=8888')).total,1);assert.deepEqual(snapshot(),baseline);
  assert.doesNotMatch(JSON.stringify(db.prepare('SELECT * FROM learning_consultations WHERE id=1').get()),/01099998888/);
  assert.doesNotMatch(JSON.stringify(db.prepare('SELECT * FROM audit_logs').all()),/01099998888|내부 메모/);
  assert.equal((await change(body)).status,409);assert.equal((await change({...after,interests:[]})).status,400);
 });
 await t.test('assigned instructor can edit, but unrelated staff cannot; concurrent revision cannot be overwritten',async()=>{
  const before=await detail();assert.equal((await change(before,'other')).status,403);
  assert.equal((await change({...before,instructorId:3,interests:['barista:foundation']},'teacher')).status,200);
  assert.equal((await detail()).instructorId,2);
  const current=await detail();const result=await Promise.all([change({...current,message:'A',interests:['barista:foundation']}),change({...current,message:'B',interests:['barista:foundation']})]);
  assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
 });
 await t.test('delete removes only the consultation from active lists and notifications, restore recovers it',async()=>{
  let row=await detail();assert.equal((await change({...row,status:'NEW',interests:['barista:foundation']})).status,200);row=await detail();
  assert.equal((await change(row,'teacher','DELETE')).status,403);
  assert.equal((await change(row,'admin','DELETE')).status,200);
  assert.equal((await list('?status=NEW')).total,0);assert.equal((await list('?deleted=1')).total,1);
  assert.equal((await(await api.notifications(req('/api/learning/notifications'))).json()).newConsultations,0);
  assert.equal((await api.list(req('/api/learning/consultation-management?id=1','teacher'))).status,403);
  assert.equal((await change({...row,status:'NEW',interests:['barista:foundation']})).status,409);
  assert.equal((await api.act(req('/api/learning/admin','admin',{action:'consultation',id:1,status:'NEW'},'POST'))).status,403);
  assert.deepEqual(snapshot(),baseline);
  row=await detail();assert.equal((await change({id:1,revision:row.revision,action:'restore'})).status,200);
  assert.equal((await list('?deleted=1')).total,0);assert.equal((await(await api.notifications(req('/api/learning/notifications'))).json()).newConsultations,1);
 });
 await t.test('audit failure rolls back edit and delete; no partial changes',async()=>{
  const before=db.prepare('SELECT * FROM learning_consultations WHERE id=1').get(),row=await detail();
  db.exec("CREATE TRIGGER fail_consult_audit BEFORE INSERT ON audit_logs WHEN NEW.action LIKE 'learning_consultation_%' BEGIN SELECT RAISE(ABORT,'audit failure'); END");
  assert.ok((await change({...row,name:'실패',interests:['barista:foundation']})).status>=400);assert.deepEqual(db.prepare('SELECT * FROM learning_consultations WHERE id=1').get(),before);
  assert.ok((await change(row,'admin','DELETE')).status>=400);assert.deepEqual(db.prepare('SELECT * FROM learning_consultations WHERE id=1').get(),before);
  db.exec('DROP TRIGGER fail_consult_audit');assert.deepEqual(snapshot(),baseline);
 });
 await t.test('real public submissions increase the private count without changing existing members',async()=>{
  const payload={name:'새 접수',phone:'01012345678',ageRange:'30대',discovery:'SNS',contactChannel:'문자',interests:['barista:foundation'],consent:true};
  const before=(await(await api.notifications(req('/api/learning/notifications'))).json()).newConsultations;
  assert.equal((await api.submit(req('/api/learning/consultations','',payload,'POST'))).status,201);
  assert.equal((await(await api.notifications(req('/api/learning/notifications'))).json()).newConsultations,before+1);
  assert.equal((await list('?q=5678')).rows[0].name,'새 접수');
 });
});
