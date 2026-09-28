import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

test('bulk education access is bounded, atomic, level-specific and administrator-only', async t => {
  process.env.SESSION_SECRET = 'local-bulk-access-test-secret-only';
  process.env.OPERATOR_INITIAL_SECURITY_CODE = '7319';
  process.env.STUDENT_INITIAL_SECURITY_CODE = '08372';
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys = ON');
  const prepare = (sql, args = []) => {
    const execute = () => { const s = sqlite.prepare(sql); if (s.columns().length) return { success: true, results: s.all(...args), meta: {} };
      const r = s.run(...args); return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; };
    return { bind: (...next) => prepare(sql, next), first: async () => sqlite.prepare(sql).get(...args) ?? null, all: async () => execute(), run: async () => execute(), execute };
  };
  globalThis.__bulkEduEnv = { DB: { prepare, batch: async statements => {
    sqlite.exec('BEGIN'); try { const results = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } };
  t.after(() => { sqlite.close(); delete globalThis.__bulkEduEnv; });
  const output = await build({ stdin: { contents: `
    export { PUT as bulk } from './app/api/edu/members/bulk/route.ts';
    export { GET as catalog } from './app/api/edu/catalog/route.ts';
    export { ensureDatabase } from './lib/db';
    export { createSession } from './lib/auth';
    export { createMemberSession } from './lib/member-auth';
    export { EDU_CATALOG } from './lib/sca-edu/decks';
  `, loader: 'ts', resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'isolated-bulk', setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'isolated' }));
    b.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export const env = globalThis.__bulkEduEnv;' }));
  } }] });
  const routes = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
  await routes.ensureDatabase();
  for (const file of ['0016_workable_namora.sql','0017_wealthy_gertrude_yorkes.sql','0018_big_dragon_man.sql']) sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url),'utf8'));
  const staff = [];
  for (const [i,role] of ['admin','employee','instructor'].entries()) {
    sqlite.prepare('INSERT INTO staff (id,name,phone_hash,phone_last4,role) VALUES (?,?,?,?,?)').run(i+1,role,role,'0000',role);
    staff.push(`thecup_session=${(await routes.createSession(i+1)).token}`);
  }
  for (let id=1;id<=104;id++) sqlite.prepare("INSERT INTO booking_members (id,name,phone_hash,phone_last4,approval_status,deleted_at) VALUES (?,?,?,'0000',?,?)")
    .run(id,`QA ${id}`,`qa${id}`,id===102?'PENDING':id===104?'REVOKED':'APPROVED',id===103?'2026-01-01':null);
  const student = `thecup_member_session=${(await routes.createMemberSession(1)).token}`;
  const req = (data, cookie=staff[0], origin) => new Request('https://qa.invalid/api/edu/members/bulk', { method: 'PUT', headers: { cookie, 'Content-Type': 'application/json', ...(origin?{origin}:{}) }, body: JSON.stringify(data) });
  const brewing = {courseId:'brewing',level:'Foundation'}, roasting = {courseId:'roasting',level:'Intermediate'};
  const payload = { memberIds:[1,2], levels:[brewing,roasting], enabled:true };
  const grants = () => sqlite.prepare('SELECT member_id,course_id,level,approval_stamp FROM edu_member_levels ORDER BY member_id,course_id,level').all();
  const apply = data => routes.bulk(req(data));
  const body = async data => { const r=await apply(data); assert.equal(r.status,200,await r.clone().text()); assert.equal(r.headers.get('cache-control'),'private, no-store'); return r.json(); };
  await t.test('rejects anonymous, staff, student and cross-site requests', async () => {
    for (const cookie of ['',staff[1],staff[2],student]) assert.ok([401,403].includes((await routes.bulk(req(payload,cookie))).status));
    assert.equal((await routes.bulk(req(payload,staff[0],'https://elsewhere.invalid'))).status,403);
    assert.equal(grants().length,0);
  });
  await t.test('one request grants the selected product without changing booking approval or other students', async () => {
    const before=sqlite.prepare('SELECT * FROM booking_members').all();
    await body({...payload,memberIds:[101],levels:[{courseId:'sustainability',level:'Foundation'}]});
    const result=await body(payload); assert.equal(result.memberCount,2); assert.equal(result.levelCount,2); assert.equal(result.affected,4);
    assert.equal(grants().length,5); assert.deepEqual(sqlite.prepare('SELECT * FROM booking_members').all(),before);
    const catalog=await (await routes.catalog(new Request('https://qa.invalid/api/edu/catalog',{headers:{cookie:student}}))).json();
    assert.deepEqual(catalog.courses.map(c=>c.id).sort(),['brewing','roasting']);
    assert.equal(catalog.courses.find(c=>c.id==='brewing').levels[0].level,'Foundation');
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM edu_deck_visibility').get().n,0);
  });
  await t.test('duplicates are deduplicated, repeated enable is idempotent, revoke preserves unselected levels', async () => {
    const result=await body({...payload,memberIds:[1,1,2],levels:[brewing,brewing,roasting]});
    assert.equal(result.memberCount,2); assert.equal(result.levelCount,2); assert.equal(grants().length,5);
    await body({...payload,levels:[brewing],enabled:false});
    assert.equal(grants().length,3); assert.ok(grants().filter(r=>r.member_id<3).every(r=>r.level==='Intermediate'));
    await body({...payload,levels:[brewing],enabled:false}); assert.equal(grants().length,3);
  });
  await t.test('a single unapproved, deleted or absent target prevents any partial write', async () => {
    const before=grants(), logs=sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get().n;
    for(const id of [102,103,104,99999]) assert.equal((await apply({...payload,memberIds:[1,id]})).status,409);
    assert.deepEqual(grants(),before); assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,logs);
    assert.equal((await apply({...payload,memberIds:[1,103],enabled:false})).status,409);
    assert.deepEqual(grants(),before);
    await body({...payload,memberIds:[102,104],enabled:false});
    assert.equal(sqlite.prepare('SELECT approval_status s FROM booking_members WHERE id=102').get().s,'PENDING');
  });
  await t.test('validates the complete request before any grant or audit record', async () => {
    const before=grants();
    for(const bad of [null,{}, {...payload,memberIds:[]},{...payload,memberIds:['1']},{...payload,memberIds:[-1]},
      {...payload,memberIds:Array.from({length:101},(_,i)=>i+1)}, {...payload,levels:[]},{...payload,levels:Array(25).fill(brewing)},
      {...payload,levels:[null]},{...payload,enabled:'true'},{...payload,levels:[{courseId:'../brewing',level:'Foundation'}]}]) {
      assert.equal((await apply(bad)).status,400);
    }
    assert.equal((await apply({...payload,levels:[brewing,{courseId:'water-maintenance',level:'Professional'}]})).status,404);
    assert.deepEqual(grants(),before);
  });
  await t.test('100 students times all 18 levels uses bounded SQL parameters and preserves other accounts', async () => {
    const all={ memberIds:Array.from({length:100},(_,i)=>i+1), levels:routes.EDU_CATALOG.courses.flatMap(c=>c.levels.filter(l=>l.deck&&['ready','review'].includes(l.status)).map(l=>({courseId:c.id,level:l.level}))), enabled:true };
    assert.equal(all.levels.length,18);
    await body(all); assert.equal(grants().length,1801);
    await body({...all,enabled:false}); assert.equal(grants().length,1); assert.equal(grants()[0].member_id,101);
  });
  await t.test('an audit failure rolls back every level in the transaction', async () => {
    sqlite.exec("CREATE TRIGGER qa_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.action='bulk_grant_education' BEGIN SELECT RAISE(ABORT,'qa audit unavailable'); END");
    const before=grants(); assert.notEqual((await apply(payload)).status,200); assert.deepEqual(grants(),before);
    sqlite.exec('DROP TRIGGER qa_audit_failure');
  });
});
