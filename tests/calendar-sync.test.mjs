import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';

test('automatic hours and FLOW closures are private, race-safe and independent of manual closures',async t=>{
 assert.ok(JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8')).compatibility_flags.includes('global_fetch_strictly_public'));
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 const prepare=(sql,args=[])=>({bind:(...next)=>prepare(sql,next),first:async()=>sqlite.prepare(sql).get(...args)??null,all:async()=>({success:true,results:sqlite.prepare(sql).all(...args)}),run:async()=>{const r=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}});
 globalThis.__calendarEnv={DB:{prepare,batch:async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
 const bundle=await build({stdin:{contents:`export * from './lib/booking-calendar.ts';export * from './lib/flow-window.ts';export {calendarSchemaStatements} from './lib/booking-calendar-schema.ts';export * from './lib/operating-calendar.ts';export {GET as adminGet,POST as adminPost} from './app/api/booking/admin/route.ts';export {GET as publicGet} from './app/api/booking/public/availability/route.ts';export {GET as memberGet,POST as memberPost} from './app/api/booking/member/route.ts';export {GET as calendarGet} from './app/api/booking/calendar/route.ts';export {POST as webhook} from './app/api/integrations/flow-calendar/route.ts';`,resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'calendar-test',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'calendar'}));b.onLoad({filter:/.*/,namespace:'calendar'},()=>({contents:'export const env=globalThis.__calendarEnv;'}));}}]});
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
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://monthlycoffee-flow.pages.dev/api/integrations/thecup-edu/calendar');assert.match(options.headers.Authorization,/Bearer test-calendar/);assert.equal(options.redirect,'manual');if(failed)throw new Error('offline');return Response.json({source:'FLOW',version:2,generatedAt:(revision=Math.max(revision+1,Date.now())),events:events.map(row=>({...row,...api.normalizeFlowWindow({start:row.startAt??row.startDate,end:row.endAt??row.endDate,allDay:row.allDay??true,endUnknown:row.endUnknown??false})}))});};
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
 await t.test('only admins receive private FLOW details; public and student responses contain busy dates only',async()=>{
  const oldFetch=globalThis.fetch;let detailCalls=0;
  const privateEvents=[{...api.normalizeFlowWindow({start:'2027-01-05T10:00',end:'2027-01-08T11:00'}),id:'private-flow-id',startDate:'2027-01-05',endDate:'2027-01-08',title:'PRIVATE EVENT TITLE',startAt:'2027-01-05T10:00',endAt:'2027-01-08T11:00',allDay:false,location:'PRIVATE VENUE',description:'PRIVATE MEMO',attendees:['PRIVATE PERSON']}];
  globalThis.fetch=async(url,options)=>{assert.equal(options.redirect,'manual');const value=new URL(String(url));assert.equal(value.origin,'https://monthlycoffee-flow.pages.dev');if(value.searchParams.get('details')==='1'){detailCalls++;return Response.json({source:'FLOW',version:2,view:'ADMIN',month:value.searchParams.get('month'),generatedAt:Date.now(),events:privateEvents});}return Response.json({source:'FLOW',version:2,generatedAt:Date.now(),events:privateEvents});};
  try{
   await api.syncFlowCalendar({force:true});
   assert.doesNotMatch(sqlite.prepare("SELECT events_json FROM booking_calendar_sync WHERE source='FLOW'").get().events_json,/PRIVATE EVENT|PRIVATE VENUE|PRIVATE MEMO|PRIVATE PERSON/);
   const publicData=await(await api.publicGet(req('/api/booking/public/availability?month=2027-01&details=1','admin'))).json();
   assert.deepEqual(publicData.busyDays,['05','06','07','08'].map(day=>({date:'2027-01-'+day,label:'마감'})));assert.doesNotMatch(JSON.stringify(publicData),/private-flow-id|PRIVATE EVENT|PRIVATE VENUE|PRIVATE MEMO|PRIVATE PERSON|flowEvents/);
   const member=await(await api.memberGet(req('/api/booking/member?month=2027-01&details=1','student'))).json();assert.deepEqual(member.busyDays,publicData.busyDays);assert.doesNotMatch(JSON.stringify(member),/private-flow-id|PRIVATE EVENT|PRIVATE VENUE|PRIVATE MEMO|PRIVATE PERSON|flowEvents/);
   assert.ok(member.slots.filter(s=>s.startAt.startsWith('2027-01-08T09:00')).every(s=>s.blockReason==='마감'&&s.displayStatus==='BLOCKED'));assert.ok(member.slots.some(s=>s.startAt.startsWith('2027-01-08T15:30')&&s.displayStatus==='AVAILABLE'));
   for(const [id,who,role] of [[2,'teacher','instructor'],[3,'employee','employee']]){sqlite.prepare("INSERT INTO staff(id,name,phone_hash,phone_last4,role) VALUES (?,?,?,'0000',?)").run(id,who,who,role);sqlite.prepare("INSERT INTO sessions(token_hash,staff_id,expires_at) VALUES (?,?,'2100-01-01')").run(digest(who),id);}
   for(const [who,status] of [['',401],['student',401],['teacher',403],['employee',403]])assert.equal((await api.calendarGet(req('/api/booking/calendar?month=2027-01&details=1',who))).status,status);
   assert.equal(detailCalls,0);assert.equal((await api.calendarGet(req('/api/booking/calendar?month=2027-13','admin'))).status,400);
   const response=await api.calendarGet(req('/api/booking/calendar?month=2027-01','admin'));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(response.headers.get('vary'),'Cookie');const admin=await response.json();assert.equal(admin.flowEvents[0].title,'PRIVATE EVENT TITLE');assert.equal(admin.flowEvents[0].location,'PRIVATE VENUE');assert.doesNotMatch(JSON.stringify(admin),/PRIVATE MEMO|PRIVATE PERSON|attendees|description/);
   globalThis.fetch=async()=>{throw Error('detail service offline');};const outage=await(await api.calendarGet(req('/api/booking/calendar?month=2027-01','admin'))).json();assert.match(outage.detailsWarning,/불러오지/);assert.deepEqual(outage.flowEvents,[]);assert.deepEqual(await api.calendarBusyDays('2027-01'),publicData.busyDays);
  }finally{globalThis.fetch=oldFetch;}
 });
 await t.test('stored FLOW hours block only overlapping lessons even when the end-unknown flag is on',async()=>{
  events=[{id:'hourly',startAt:'2027-01-19T14:00:00+09:00',endAt:'2027-01-19T15:00:00+09:00',allDay:false,endUnknown:true}];await api.syncFlowCalendar({force:true});
  const pub=await(await api.publicGet(req('/api/booking/public/availability?month=2027-01'))).json();const hours=pub.slots.filter(s=>s.startAt.startsWith('2027-01-19')).map(s=>s.startAt.slice(11,16));assert.ok(hours.includes('09:00')&&hours.includes('15:30'));assert.ok(!hours.includes('12:30'));assert.deepEqual(pub.busySlots.filter(s=>s.startAt.startsWith('2027-01-19')),[{startAt:'2027-01-19T12:30:00+09:00',endAt:'2027-01-19T15:00:00+09:00',label:'마감'}]);assert.doesNotMatch(JSON.stringify(pub),/hourly|14:00|endUnknown/);
  const member=await(await api.memberGet(req('/api/booking/member?month=2027-01','student'))).json();assert.equal(member.slots.find(s=>s.startAt==='2027-01-19T09:00:00+09:00').displayStatus,'AVAILABLE');assert.equal(member.slots.find(s=>s.startAt==='2027-01-19T15:30:00+09:00').displayStatus,'AVAILABLE');
  const midday=sqlite.prepare("SELECT id FROM booking_slots WHERE station_id=1 AND start_at='2027-01-19T12:30:00+09:00'").get().id;assert.equal((await api.memberPost(req('/api/booking/member','student',{action:'requestReservation',slotId:midday,purpose:'ESPRESSO',materialPlan:'CENTER'}))).status,409);assert.equal((await book('2027-01-19')).status,201);
  const pass=sqlite.prepare('SELECT id FROM member_passes WHERE member_id=1').get().id;assert.throws(()=>sqlite.prepare("INSERT INTO reservations(member_id,slot_id,pass_id,slot_start_at,status,purpose,material_plan) VALUES(1,?,?,?,'REQUESTED','ESPRESSO','CENTER')").run(midday,pass,'2027-01-19T12:30:00+09:00'),/booking_calendar_closed/);
 });
 await t.test('touching times stay open, timed multi-day edges are precise and explicit all-day events still close the day',async()=>{
  events=[{id:'lunch-only',startAt:'2027-01-18T11:30:00+09:00',endAt:'2027-01-18T12:30:00+09:00',allDay:false},{id:'multi',startAt:'2027-01-20T15:00:00+09:00',endAt:'2027-01-21T10:00:00+09:00',allDay:false},{id:'whole',startAt:'2027-01-26T00:00:00+09:00',endAt:'2027-01-26T23:59:00+09:00',allDay:true},{id:'missing-end',startAt:'2027-01-27T10:00:00+09:00',allDay:false,endUnknown:true}];await api.syncFlowCalendar({force:true});
  const pub=await(await api.publicGet(req('/api/booking/public/availability?month=2027-01'))).json(),times=date=>[...new Set(pub.slots.filter(s=>s.startAt.startsWith(date)).map(s=>s.startAt.slice(11,16)))];assert.deepEqual(times('2027-01-18'),['09:00','12:30','15:30']);assert.deepEqual(times('2027-01-20'),['09:00','12:30']);assert.deepEqual(times('2027-01-21'),['12:30','15:30']);assert.deepEqual(times('2027-01-26'),[]);assert.deepEqual(times('2027-01-27'),['09:00','12:30','15:30']);
 });
 await t.test('obsolete date-only database guards are replaced without changing reservations',async()=>{
  const before=sqlite.prepare('SELECT * FROM reservations ORDER BY id').all();sqlite.exec("CREATE TRIGGER booking_calendar_insert_guard BEFORE INSERT ON reservations BEGIN SELECT RAISE(ABORT,'obsolete_guard'); END;CREATE TRIGGER booking_calendar_update_guard BEFORE UPDATE ON reservations BEGIN SELECT RAISE(ABORT,'obsolete_guard'); END;");
  for(const statement of api.calendarSchemaStatements)sqlite.exec(statement);assert.deepEqual(sqlite.prepare('SELECT * FROM reservations ORDER BY id').all(),before);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name IN ('booking_calendar_insert_guard','booking_calendar_update_guard')").get().n,0);assert.equal((await book('2027-01-25')).status,201);
 });
 await t.test('private source snapshots are whitelisted, fresh, month-bounded and reject invalid fields',async()=>{
  const event={...api.normalizeFlowWindow({start:'2027-01-05T10:00',end:'2027-01-05T11:00'}),id:'safe',startDate:'2027-01-05',endDate:'2027-01-05',title:'회의',startAt:'2027-01-05T10:00',endAt:'2027-01-05T11:00',allDay:false,location:'센터',description:'DROP ME'};
  const value={source:'FLOW',version:2,view:'ADMIN',month:'2027-01',generatedAt:Date.now(),events:[event]};assert.equal(api.validateFlowDetails(value,'2027-01')[0].title,'회의');assert.ok(!('description' in api.validateFlowDetails(value,'2027-01')[0]));
  for(const changed of [{view:undefined},{month:'2027-02'},{generatedAt:Date.now()-130000},{events:[{...event,startAt:'2027-01-06T10:00'}]},{events:[{...event,title:'x'.repeat(161)}]},{events:[{...event,allDay:'yes'}]}])assert.throws(()=>api.validateFlowDetails({...value,...changed},'2027-01'));
 });
});
