import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {build} from 'esbuild';

test('automatic hours and FLOW closures are private, race-safe and independent of manual closures',async t=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 const prepare=(sql,args=[])=>({bind:(...next)=>prepare(sql,next),first:async()=>sqlite.prepare(sql).get(...args)??null,all:async()=>({success:true,results:sqlite.prepare(sql).all(...args)}),run:async()=>{const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}});
 globalThis.__calendarEnv={DB:{prepare,batch:async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
 const bundle=await build({stdin:{contents:`export * from './lib/booking-calendar.ts';export * from './lib/operating-calendar.ts';export {GET as adminGet,POST as adminPost} from './app/api/booking/admin/route.ts';export {GET as publicGet} from './app/api/booking/public/availability/route.ts';export {GET as memberGet,POST as memberPost} from './app/api/booking/member/route.ts';export {GET as calendarGet} from './app/api/booking/calendar/route.ts';export {POST as webhook} from './app/api/integrations/flow-calendar/route.ts';`,resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'calendar-test',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'calendar'}));b.onLoad({filter:/.*/,namespace:'calendar'},()=>({contents:'export const env=globalThis.__calendarEnv;'}));}}]});
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const securityVersion='00000000-0000-4000-8000-000000000000', token=name=>`${securityVersion}.${name.padEnd(43,'x')}`,digest=name=>createHash('sha256').update(token(name)).digest('hex');
 const req=(path,who='',data)=>new Request('https://calendar.test'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(who?{cookie:`${who==='student'?'thecup_member_session':'thecup_session'}=${token(who)}`}:{})},body:data?JSON.stringify(data):undefined});
 await api.adminGet(req('/api/booking/admin'));
 for(const audience of ['operator','student'])sqlite.prepare('INSERT INTO app_settings(key,value) VALUES (?,?)').run('auth_security_'+audience,JSON.stringify({version:securityVersion,digest:'0'.repeat(64)}));
 sqlite.exec("INSERT INTO staff(id,name,phone_hash,phone_last4,role) VALUES (1,'QA 운영자','staff','0000','admin');INSERT INTO booking_members(id,name,phone_hash,phone_last4,approval_status,approved_by) VALUES (1,'QA 수강생','student','0000','APPROVED',1)");
 sqlite.exec('DELETE FROM learning_members WHERE member_id=1'); // Existing, unrestricted booking account.
 sqlite.prepare("INSERT INTO sessions(token_hash,staff_id,expires_at) VALUES (?,1,'2100-01-01')").run(digest('admin'));
 sqlite.prepare("INSERT INTO member_sessions(token_hash,member_id,expires_at) VALUES (?,1,'2100-01-01')").run(digest('student'));
 const nativeFetch=globalThis.fetch;let events=[],failed=false,revision=Date.now();
 t.after(()=>{globalThis.fetch=nativeFetch;delete globalThis.__calendarEnv;sqlite.close();});
 await t.test('weekday, holiday, lunch and year boundaries',async()=>{
  assert.equal(api.operatingDayReason('2027-01-01'),'신정');assert.equal(api.operatingDayReason('2027-01-02'),'주말 휴무');assert.equal(api.operatingDayReason('2027-05-03'),'대체공휴일');assert.equal(api.operatingDayReason('2027-07-19'),'대체공휴일');assert.equal(api.operatingDayReason('2027-01-04'),'');assert.match(api.operatingDayReason('2028-01-03'),/미확인/);
  assert.match(api.operatingTimeReason('2027-01-04T12:00','2027-01-04T14:30'),/점심/);assert.equal(api.operatingTimeReason('2027-01-04T12:30','2027-01-04T15:00'),'');assert.deepEqual(api.rollingMonths(new Date('2026-12-31T16:00:00Z')),['2027-01','2027-02','2027-03']);
 });
 await t.test('rolling slots are generated once, never on lunch/weekends/holidays; old records remain identical',async()=>{
  globalThis.__calendarEnv.BOOKING_AUTOMATION_ENABLED='true';
  const before=sqlite.prepare('SELECT * FROM booking_slots ORDER BY id').all();
  let result=await api.ensureAutomaticSchedule(true,new Date('2026-11-17T09:00:00Z'));assert.ok(result.created>0);
  const generated=sqlite.prepare('SELECT * FROM booking_slots ORDER BY id').all();for(const s of generated)assert.equal(api.operatingTimeReason(s.start_at,s.end_at),'');
  result=await api.ensureAutomaticSchedule(true,new Date('2026-11-17T09:00:00Z'));assert.equal(result.created,0);assert.deepEqual(sqlite.prepare('SELECT * FROM booking_slots ORDER BY id').all(),generated);assert.deepEqual(generated.filter(s=>before.some(b=>b.id===s.id)),before);
 });
 const slot=date=>sqlite.prepare("SELECT id FROM booking_slots WHERE station_id=1 AND start_at=?").get(date+'T09:00:00+09:00').id;
 const book=date=>api.memberPost(req('/api/booking/member','student',{action:'requestReservation',slotId:slot(date),purpose:'ESPRESSO',materialPlan:'CENTER'}));
 let confirmed,pending;
 await t.test('existing confirmed and pending reservations are created before a closure',async()=>{
  let r=await book('2027-01-05');assert.equal(r.status,201,await r.clone().text());confirmed=(await r.json()).id;
  r=await api.adminPost(req('/api/booking/admin','admin',{action:'decideReservation',reservationId:confirmed,decision:'CONFIRMED'}));assert.equal(r.status,200,await r.clone().text());
  r=await book('2027-01-07');assert.equal(r.status,201);pending=(await r.json()).id;
  sqlite.prepare("UPDATE booking_slots SET status='BLOCKED',block_reason='수동 휴강 유지' WHERE id=?").run(slot('2027-01-06'));
 });
 globalThis.__calendarEnv.FLOW_CALENDAR_SECRET='test-calendar-secret-never-use-in-production';
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://monthlycoffee-flow.pages.dev/api/integrations/thecup-edu/calendar');assert.match(options.headers.Authorization,/Bearer test-calendar/);if(failed)throw new Error('offline');return Response.json({source:'FLOW',generatedAt:++revision,events});};
 await t.test('snapshot closes entire inclusive dates in every station and preserves existing reservations',async()=>{
  events=[{id:'flow-1',startDate:'2027-01-05',endDate:'2027-01-08'}];assert.equal((await api.syncFlowCalendar({force:true})).ok,true);
  const response=await api.publicGet(req('/api/booking/public/availability?month=2027-01'));const pub=await response.json();assert.equal(response.status,200);assert.ok(!pub.slots.some(s=>s.startAt.slice(0,10)>='2027-01-05'&&s.startAt.slice(0,10)<='2027-01-08'));assert.doesNotMatch(JSON.stringify(pub),/flow-1|QA 수강생|test-calendar/);
  const summary=await api.calendarSummary();assert.equal(summary.conflicts.length,2);assert.equal(sqlite.prepare('SELECT status FROM reservations WHERE id=?').get(confirmed).status,'CONFIRMED');
  const member=await(await api.memberGet(req('/api/booking/member?month=2027-01','student'))).json();assert.equal(member.slots.find(s=>s.id===slot('2027-01-05')).displayStatus,'CONFIRMED');
  assert.equal((await book('2027-01-08')).status,409);assert.equal((await api.adminPost(req('/api/booking/admin','admin',{action:'decideReservation',reservationId:pending,decision:'CONFIRMED'}))).status,409);
  const pass=sqlite.prepare('SELECT id FROM member_passes WHERE member_id=1').get().id;
  assert.throws(()=>sqlite.prepare("INSERT INTO reservations(member_id,slot_id,pass_id,slot_start_at,status,purpose,material_plan) VALUES (1,?,?,?,'REQUESTED','ESPRESSO','CENTER')").run(slot('2027-01-08'),pass,'2027-01-08T09:00:00+09:00'),/booking_calendar_closed/);
 });
 await t.test('moving and deleting FLOW events releases only that source, retaining manual closures',async()=>{
  events=[{id:'flow-1',startDate:'2027-01-11',endDate:'2027-01-11'},{id:'flow-2',startDate:'2027-01-11',endDate:'2027-01-12'}];await api.syncFlowCalendar({force:true});
  assert.equal(sqlite.prepare('SELECT status,block_reason FROM booking_slots WHERE id=?').get(slot('2027-01-06')).block_reason,'수동 휴강 유지');assert.equal((await book('2027-01-08')).status,201);
  events=[events[1]];await api.syncFlowCalendar({force:true});assert.equal((await book('2027-01-11')).status,409);
  events=[];await api.syncFlowCalendar({force:true});assert.equal((await book('2027-01-11')).status,201);assert.equal((await book('2027-01-06')).status,409);
 });
 await t.test('upstream errors retain last good numbers; requests fail safely while cancellation still works',async()=>{
  events=[{id:'retained',startDate:'2027-01-13',endDate:'2027-01-13'}];await api.syncFlowCalendar({force:true});const cached=sqlite.prepare("SELECT events_json FROM booking_calendar_sync WHERE source='FLOW'").get().events_json;failed=true;
  assert.equal((await api.syncFlowCalendar({force:true})).ok,false);assert.equal(sqlite.prepare("SELECT events_json FROM booking_calendar_sync WHERE source='FLOW'").get().events_json,cached);assert.equal((await book('2027-01-14')).status,503);
  assert.equal((await api.memberPost(req('/api/booking/member','student',{action:'cancelReservation',reservationId:pending}))).status,200);failed=false;
 });
 await t.test('anonymous status and unsigned webhooks are denied; malformed snapshots cannot clear closures',async()=>{
  assert.equal((await api.calendarGet(req('/api/booking/calendar'))).status,401);assert.equal((await api.webhook(new Request('https://calendar.test/api/integrations/flow-calendar',{method:'POST'}))).status,401);
  const auth={authorization:'Bearer '+globalThis.__calendarEnv.FLOW_CALENDAR_SECRET};assert.equal((await api.webhook(new Request('https://calendar.test/api/integrations/flow-calendar',{method:'POST',headers:auth}))).status,200);
  for(const events of [[{id:'x',startDate:'2027-02-30',endDate:'2027-03-02'}],[{id:'x',startDate:'2027-01-03',endDate:'2027-01-02'}],[{id:'x',startDate:'2027-01-03',endDate:'2027-01-03'},{id:'x',startDate:'2027-01-03',endDate:'2027-01-03'}]])assert.throws(()=>api.validateFlowSnapshot({source:'FLOW',generatedAt:Date.now(),events}));
  assert.throws(()=>api.validateFlowSnapshot({source:'FLOW',generatedAt:Date.now()-130000,events:[]}));
 });
});
