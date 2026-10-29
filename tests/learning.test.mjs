import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

test('consultation → paid course → time request → instructor confirmation is secure and atomic', async t => {
  process.env.SESSION_SECRET = 'learning-test-private-secret-not-production';
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  const prepare = (sql, args = []) => ({ bind: (...next) => prepare(sql,next),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args), success:true }),
    run: async () => { const r=db.prepare(sql).run(...args); return { success:true, meta:{ changes:Number(r.changes), last_row_id:Number(r.lastInsertRowid) } }; },
  });
  const database={prepare,batch:async statements=>{db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
  globalThis.__learningEnv={DB:database};
  t.after(()=>{db.close();delete globalThis.__learningEnv;});
  const bundle=await build({stdin:{contents:`
    export {GET as get,POST as act} from './app/api/learning/admin/route.ts';
    export {POST as consult} from './app/api/learning/consultations/route.ts';
    export {POST as member,GET as memberGet} from './app/api/booking/member/route.ts';
    export {POST as admin} from './app/api/booking/admin/route.ts';
    export {GET as publicGet} from './app/api/booking/public/availability/route.ts';
    export {ensureLearningSchema} from './lib/learning-schema.ts';
    export {encryptContact,decryptContact} from './lib/consultation-contact.ts';
  `,resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'learning-test',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'learning'}));b.onLoad({filter:/.*/,namespace:'learning'},()=>({contents:'export const env=globalThis.__learningEnv;'}));}}]});
  const routes=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const version='00000000-0000-4000-8000-000000000000';
  const token=s=>`${version}.${s.padEnd(43,'x')}`;
  const digest=s=>createHash('sha256').update(token(s)).digest('hex');
  const req=(path,who='',data,origin)=>new Request(`https://learning.invalid${path}`,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(who?{cookie:`${who.startsWith('student')?'thecup_member_session':'thecup_session'}=${token(who)}`} : {}),...(origin?{origin}: {})},body:data?JSON.stringify(data):undefined});
  assert.equal((await routes.get(req('/api/learning/admin'))).status,401);
  for(const audience of ['operator','student'])db.prepare('INSERT INTO app_settings(key,value) VALUES (?,?)').run(`auth_security_${audience}`,JSON.stringify({version,digest:'0'.repeat(64)}));
  for(const [i,name,role] of [[1,'admin','admin'],[2,'teacher','instructor'],[3,'other','instructor'],[4,'employee','employee']]){
    db.prepare('INSERT INTO staff(id,name,phone_hash,phone_last4,role) VALUES (?,?,?,\'0000\',?)').run(i,name,name,role);
    db.prepare('INSERT INTO sessions(token_hash,staff_id,expires_at) VALUES (?,?,\'2100-01-01\')').run(digest(name),i);
  }
  const act=(data,who='admin')=>routes.act(req('/api/learning/admin',who,data));
  const get=(who='admin',suffix='')=>routes.get(req('/api/learning/admin'+suffix,who));
  const account=(id,name)=>{db.prepare("INSERT INTO booking_members(id,name,phone_hash,phone_last4,approval_status,approved_by) VALUES (?,?,?,'0000','APPROVED',1)").run(id,name,name);db.prepare("INSERT INTO member_sessions(token_hash,member_id,expires_at) VALUES (?,?,'2100-01-01')").run(digest(`student${id}`),id);};
  account(1,'Legacy');db.prepare('DELETE FROM learning_members WHERE member_id=1').run();
  account(2,'New learner');account(3,'Parallel learner');
  const payload={name:'상담 테스트',phone:'01000001111',ageRange:'30대',discovery:'SNS',contactChannel:'전화',interests:['barista:foundation','all-foundation'],message:'주말 수업 문의',consent:true};
  let applicant;
  await t.test('consent and allowlisted choices required; cross-origin rejected; no partial member',async()=>{
    for(const changed of [{consent:false},{interests:[]},{interests:['invalid']},{ageRange:'x'},{discovery:'x'},{phone:'abc'}])assert.equal((await routes.consult(req('/api/learning/consultations','',{...payload,...changed}))).status,400);
    assert.equal((await routes.consult(req('/api/learning/consultations','',payload,'https://other.invalid'))).status,403);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM learning_consultations').get().n,0);
  });
  await t.test('contact encrypted at rest and excluded from lists and public responses',async()=>{
    const response=await routes.consult(req('/api/learning/consultations','',payload));assert.equal(response.status,201,await response.clone().text());
    assert.doesNotMatch(await response.text(),/01000001111|memberId|alreadyApproved/);
    const row=db.prepare('SELECT * FROM learning_consultations').get();applicant=row.member_id;
    assert.doesNotMatch(JSON.stringify(row),/01000001111/);assert.equal(await routes.decryptContact(row.phone_encrypted),'01000001111');
    const list=await(await get()).json();assert.doesNotMatch(JSON.stringify(list),/01000001111|phone_encrypted|phone_hash/);
    const detail=await(await get('admin',`?memberId=${applicant}`)).json();assert.equal(detail.detail.consultations[0].phone,'01000001111');
    assert.match((await get()).headers.get('cache-control'),/no-store/);
    const pub=await(await routes.publicGet(req('/api/booking/public/availability?month=2099-10'))).json();assert.doesNotMatch(JSON.stringify(pub),/01000001111|상담 테스트/);
  });
  await t.test('only assigned instructor can read consultation, employee and unrelated instructor denied',async()=>{
    assert.equal((await get('employee')).status,403);
    assert.equal((await get('teacher',`?memberId=${applicant}`)).status,403);
    const c=db.prepare('SELECT id FROM learning_consultations').get().id;
    assert.equal((await act({action:'consultation',id:c,status:'CONTACTED',instructorId:2,note:'확인'})).status,200);
    assert.equal((await get('teacher',`?memberId=${applicant}`)).status,200);
    assert.equal((await get('other',`?memberId=${applicant}`)).status,403);
    assert.equal((await act({action:'consultation',id:c,status:'CLOSED'},'other')).status,403);
  });
  await t.test('phone rate limit is atomic and repeated consultation does not change account name or access',async()=>{
    const before=db.prepare('SELECT * FROM booking_members WHERE id=?').get(applicant);
    const responses=await Promise.all([1,2,3,4].map(()=>routes.consult(req('/api/learning/consultations','',{...payload,name:'다른 이름'}))));
    assert.deepEqual(responses.map(r=>r.status).sort(),[201,201,429,429]);
    assert.deepEqual(db.prepare('SELECT * FROM booking_members WHERE id=?').get(applicant),before);
  });
  await routes.admin(req('/api/booking/admin','admin',{action:'generateSlots',month:'2099-10',dates:['2099-10-12','2099-10-13','2099-10-14','2099-10-15','2099-10-16'],stationIds:[1,3],times:[{start:'09:00',end:'11:30'}]}));
  const slot=(day,type='ESPRESSO')=>db.prepare('SELECT s.id FROM booking_slots s JOIN stations t ON t.id=s.station_id WHERE s.start_at LIKE ? AND t.type=?').get(`2099-10-${day}%`,type).id;
  const reserve=(id,day,enrollmentId,type='ESPRESSO')=>routes.member(req('/api/booking/member',`student${id}`,{action:'requestReservation',slotId:slot(day,type),purpose:'ESPRESSO',materialPlan:'CENTER',enrollmentId}));
  const enroll=(memberId,overrides={})=>act({action:'enroll',memberId,requestKey:`test-${crypto.randomUUID()}`,courseKey:'barista:foundation',totalSessions:3,sessionMinutes:150,paidAmount:240000,priceType:'SUBSCRIBER',instructorId:2,paymentConfirmed:true,...overrides});
  let e2,e3,first;
  await t.test('existing members remain unrestricted after repeat migration; new members need paid course',async()=>{
    await routes.ensureLearningSchema(database);
    assert.equal(db.prepare('SELECT 1 FROM learning_members WHERE member_id=1').get(),undefined);
    assert.equal((await reserve(1,'12')).status,201);
    assert.equal((await reserve(2,'13')).status,409);
    const dashboard=await(await routes.memberGet(req('/api/booking/member?month=2099-10','student2'))).json();assert.equal(dashboard.courseBookingRequired,true);assert.deepEqual(dashboard.enrollments,[]);
  });
  await t.test('staff must verify payment, instructor and course; instructor cannot grant sessions',async()=>{
    assert.equal((await enroll(2,{paymentConfirmed:false})).status,400);
    assert.equal((await enroll(2,{instructorId:4})).status,400);
    assert.equal((await enroll(2,{courseKey:'not-course'})).status,400);
    assert.equal((await enroll(2,{courseKey:'q-grader:course'})).status,400);
    assert.equal((await act({action:'enroll'},'teacher')).status,403);
    const a=await enroll(2,{requestKey:'idempotent'});assert.equal(a.status,201,await a.clone().text());e2=(await a.json()).id;
    const retry=await enroll(2,{requestKey:'idempotent'});assert.equal((await retry.json()).id,e2);assert.equal(db.prepare('SELECT COUNT(*) n FROM course_enrollments WHERE member_id=2').get().n,1);
    e3=(await(await enroll(3)).json()).id;
    assert.equal(db.prepare('SELECT COUNT(*) n FROM finance_transactions').get().n,0);
  });
  await t.test('three sessions only, including requests; concurrent last-session requests cannot exceed quota',async()=>{
    const a=await reserve(2,'12',e2);assert.equal(a.status,201,await a.clone().text());first=(await a.json()).id;
    assert.equal((await reserve(2,'13',e2)).status,201);
    const pair=await Promise.all([reserve(2,'14',e2),reserve(2,'15',e2)]);assert.deepEqual(pair.map(r=>r.status).sort(),[201,409]);
    assert.equal((await reserve(2,'16',e2)).status,409);
    const own=await(await routes.memberGet(req('/api/booking/member?month=2099-10','student2'))).json();assert.equal(own.enrollments[0].usedSessions,3);
  });
  await t.test('another member cannot consume credits; wrong subject and short time cannot be booked',async()=>{
    assert.equal((await reserve(3,'12',e2)).status,403);
    assert.equal((await reserve(3,'12',e3,'ROASTING')).status,409);
    await routes.admin(req('/api/booking/admin','admin',{action:'generateSlots',month:'2099-10',dates:['2099-10-17'],stationIds:[1],times:[{start:'09:00',end:'10:00'}]}));
    assert.equal((await reserve(3,'17',e3)).status,409);
  });
  await t.test('assigned instructor can confirm; other staff cannot; station becomes unavailable',async()=>{
    assert.equal((await act({action:'decideReservation',reservationId:first,decision:'CONFIRMED'},'other')).status,403);
    assert.equal((await act({action:'decideReservation',reservationId:first,decision:'CONFIRMED'},'teacher')).status,200);
    assert.equal((await reserve(3,'12',e3)).status,409);
    assert.equal((await routes.admin(req('/api/booking/admin','admin',{action:'recordPayment',memberId:2,reservationId:first,method:'CARD',status:'PAID'}))).status,409);
  });
  await t.test('different subjects run in parallel with different teachers, but not with same teacher',async()=>{
    const roast=(await(await enroll(3,{courseKey:'roasting:foundation'})).json()).id;
    assert.equal((await reserve(3,'12',roast,'ROASTING')).status,409);
    const secondTeacher=(await(await enroll(3,{courseKey:'roasting:foundation',instructorId:3})).json()).id;
    const r=await reserve(3,'12',secondTeacher,'ROASTING');assert.equal(r.status,201,await r.clone().text());
    assert.equal((await act({action:'decideReservation',reservationId:(await r.json()).id,decision:'CONFIRMED'},'other')).status,200);
  });
  await t.test('rejection and cancellation release sessions; pause blocks new requests and confirmation',async()=>{
    await act({action:'enrollmentStatus',id:e2,status:'PAUSED'});
    const pending=db.prepare("SELECT id FROM reservations WHERE enrollment_id=? AND status='REQUESTED' LIMIT 1").get(e2).id;
    assert.equal((await act({action:'decideReservation',reservationId:pending,decision:'CONFIRMED'},'teacher')).status,409);
    assert.equal(db.prepare('SELECT status FROM reservations WHERE id=?').get(first).status,'CONFIRMED');
    await act({action:'enrollmentStatus',id:e2,status:'ACTIVE'});
    const id=db.prepare("SELECT id FROM reservations WHERE enrollment_id=? AND status='REQUESTED' ORDER BY id LIMIT 1").get(e2).id;
    assert.equal((await act({action:'decideReservation',reservationId:id,decision:'REJECTED',rejectionReason:'시간 변경'},'teacher')).status,200);
    assert.equal((await reserve(2,'16',e2)).status,201);
    assert.equal((await act({action:'enrollmentStatus',id:e3,status:'PAUSED'})).status,200);
    assert.equal((await reserve(3,'16',e3)).status,403);
    const cancelled=await routes.member(req('/api/booking/member','student2',{action:'cancelReservation',reservationId:first}));assert.equal(cancelled.status,200);
    assert.equal((await reserve(2,'12',e2)).status,201);
  });
  await t.test('two pending lessons on separate stations cannot confirm for one teacher at the same time',async()=>{
    const course=(await(await enroll(3,{courseKey:'roasting:foundation'})).json()).id;
    const a=await reserve(3,'16',course,'ROASTING');assert.equal(a.status,201);
    const other=(await a.json()).id;
    const own=db.prepare("SELECT id FROM reservations WHERE enrollment_id=? AND status='REQUESTED' AND slot_start_at LIKE '2099-10-16%'").get(e2).id;
    assert.equal((await act({action:'decideReservation',reservationId:own,decision:'CONFIRMED'},'teacher')).status,200);
    assert.equal((await act({action:'decideReservation',reservationId:other,decision:'CONFIRMED'},'teacher')).status,409);
  });
  await t.test('enrollment and approval both roll back if the audit fails',async()=>{
    account(5,'Rollback');db.prepare("UPDATE booking_members SET approval_status='PENDING' WHERE id=5").run();
    db.exec("CREATE TRIGGER fail_learning_audit BEFORE INSERT ON audit_logs WHEN NEW.action='learning_enroll' BEGIN SELECT RAISE(ABORT,'audit test failure'); END");
    const result=await enroll(5);assert.ok(result.status>=400);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM course_enrollments WHERE member_id=5').get().n,0);
    assert.equal(db.prepare('SELECT approval_status FROM booking_members WHERE id=5').get().approval_status,'PENDING');
    db.exec('DROP TRIGGER fail_learning_audit');
  });
  await t.test('revoked students cannot request; member history survives and contacts expire only when closed',async()=>{
    assert.equal((await routes.admin(req('/api/booking/admin','admin',{action:'approveMember',memberId:2,approved:false}))).status,200);
    assert.equal((await reserve(2,'12',e2)).status,401);
    const c=db.prepare('SELECT id FROM learning_consultations ORDER BY id LIMIT 1').get().id;
    db.prepare("UPDATE learning_consultations SET status='CLOSED',updated_at='2000-01-01' WHERE id=?").run(c);
    await get();assert.equal(db.prepare('SELECT 1 FROM learning_consultations WHERE id=?').get(c),undefined);
    assert.ok(db.prepare('SELECT COUNT(*) n FROM reservations').get().n>0);
    assert.ok(db.prepare('SELECT COUNT(*) n FROM learning_consultations').get().n>0);
  });
});
