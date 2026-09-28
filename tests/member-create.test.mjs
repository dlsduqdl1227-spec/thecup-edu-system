import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

test('administrator direct student registration preserves identity, booking and education boundaries', async t => {
  const oldEnv = { ...process.env };
  process.env.SESSION_SECRET = 'local-member-create-test-only-secret';
  process.env.OPERATOR_INITIAL_SECURITY_CODE = '7319';
  process.env.STUDENT_INITIAL_SECURITY_CODE = '08372';
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const prepare = (sql, args = []) => {
    const execute = () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; };
    return { bind: (...next) => prepare(sql, next), first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args), success: true }), run: async () => execute(), execute };
  };
  globalThis.__memberCreateEnv = { DB: { prepare, batch: async statements => {
    db.exec('BEGIN');
    try { const results = statements.map(s => s.execute()); db.exec('COMMIT'); return results; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } } };
  t.after(() => {
    db.close(); delete globalThis.__memberCreateEnv;
    for (const key of ['SESSION_SECRET', 'OPERATOR_INITIAL_SECURITY_CODE', 'STUDENT_INITIAL_SECURITY_CODE']) {
      if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key];
    }
  });
  const bundle = await build({ stdin: { contents: `
    export { GET as list, POST as admin } from './app/api/booking/admin/route.ts';
    export { POST as login } from './app/api/member-auth/login/route.ts';
    export { GET as memberGet, POST as member } from './app/api/booking/member/route.ts';
    export { GET as eduMembers } from './app/api/edu/members/route.ts';
    export { GET as catalog } from './app/api/edu/catalog/route.ts';
    export { ensureDatabase } from './lib/db';
    export { createSession, phoneHash } from './lib/auth';
  `, loader: 'ts', resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'isolated-member-db', setup(b) {
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'isolated' }));
      b.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export const env = globalThis.__memberCreateEnv;' }));
    } }] });
  const routes = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  await routes.ensureDatabase();
  for (const file of ['0016_workable_namora.sql','0017_wealthy_gertrude_yorkes.sql','0018_big_dragon_man.sql']) db.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const cookies = [];
  for (const [i, role] of ['admin','employee','instructor'].entries()) {
    db.prepare('INSERT INTO staff (id,name,phone_hash,phone_last4,role) VALUES (?,?,?,?,?)').run(i+1, `QA ${role}`, await routes.phoneHash(`0100000990${i+1}`), `990${i+1}`, role);
    cookies.push(`thecup_session=${(await routes.createSession(i+1)).token}`);
  }
  const req = (path, cookie = '', data, origin) => new Request(`https://member-test.invalid${path}`, {
    method: data ? 'POST' : 'GET', headers: { cookie, 'Content-Type': 'application/json', ...(origin ? { origin } : {}) }, body: data ? JSON.stringify(data) : undefined,
  });
  const post = data => routes.admin(req('/api/booking/admin', cookies[0], data));
  const payload = { action: 'createMember', name: '  QA   신규  ', phone: '010-0000-9901', approvalStatus: 'APPROVED', desiredStationType: 'brewing', adminMemo: '관리 메모' };
  const login = (name, phone, securityCode = '08372') => routes.login(req('/api/member-auth/login', '', { name, phone, securityCode }));
  let memberId, studentCookie;
  await t.test('anonymous, employees, instructors and foreign origins cannot create students', async () => {
    for (const cookie of ['', cookies[1], cookies[2]]) assert.ok([401,403].includes((await routes.admin(req('/api/booking/admin', cookie, payload))).status));
    assert.equal((await routes.admin(req('/api/booking/admin', cookies[0], payload, 'https://elsewhere.invalid'))).status, 403);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM booking_members').get().n, 0);
  });
  await t.test('approved registration stores only a normalized identity and can immediately log in', async () => {
    const r = await post(payload); assert.equal(r.status, 201, await r.clone().text());
    const result = await r.json(); memberId = result.id;
    assert.deepEqual(result, { ok: true, id: memberId, approvalStatus: 'APPROVED' });
    const row = db.prepare('SELECT * FROM booking_members WHERE id=?').get(memberId);
    assert.equal(row.name, 'QA 신규'); assert.equal(row.phone_hash, await routes.phoneHash(payload.phone));
    assert.equal(row.phone_last4, '9901'); assert.equal(row.approved_by, 1); assert.ok(row.approved_at);
    assert.equal(row.desired_station_type, 'BREWING'); assert.equal(row.consultation_status, 'COMPLETED');
    assert.doesNotMatch(JSON.stringify(row), /01000009901|010-0000-9901/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM staff').get().n, 3, 'same phone in separate staff list is not overwritten');
    assert.equal((await login('QA 신규', payload.phone, 'wrong')).status, 401);
    const signedIn = await login('QA 신규', payload.phone); assert.equal(signedIn.status, 200);
    studentCookie = signedIn.headers.get('set-cookie').split(';')[0];
    assert.equal((await routes.memberGet(req('/api/booking/member', studentCookie))).status, 200);
    assert.ok([401,403].includes((await routes.admin(req('/api/booking/admin', studentCookie, { ...payload, phone: '01000009907' }))).status));
    const listed = await (await routes.list(req('/api/booking/admin', cookies[0]))).json();
    assert.equal(listed.members.find(m => m.id === memberId).name, 'QA 신규');
    assert.doesNotMatch(JSON.stringify(listed.members), /phone_hash|phoneHash|01000009901|010-0000-9901/);
  });
  await t.test('new student has no education grants but can request a station without an issued pass', async () => {
    const list = await (await routes.eduMembers(req('/api/edu/members', cookies[0]))).json();
    assert.deepEqual(list.members.find(m => m.id === memberId).levels, []);
    assert.deepEqual((await (await routes.catalog(req('/api/edu/catalog', studentCookie))).json()).courses, []);
    await post({ action: 'generateSlots', month: '2099-10', dates: ['2099-10-12'], stationIds: [1], times: [{ start: '09:00', end: '11:30' }] });
    const slot = db.prepare('SELECT id FROM booking_slots ORDER BY id DESC').get();
    const r = await routes.member(req('/api/booking/member', studentCookie, { action: 'requestReservation', slotId: slot.id, purpose: 'ESPRESSO', materialPlan: 'SELF' }));
    assert.equal(r.status, 201, await r.clone().text());
  });
  await t.test('duplicate and simultaneous requests do not overwrite or create duplicate accounts', async () => {
    const before = db.prepare('SELECT * FROM booking_members WHERE id=?').get(memberId);
    const dup = await post({ ...payload, name: '다른 이름', phone: '01000009901', approvalStatus: 'PENDING' });
    assert.equal(dup.status, 409); assert.match((await dup.json()).error, /이미 등록/);
    assert.deepEqual(db.prepare('SELECT * FROM booking_members WHERE id=?').get(memberId), before);
    const pair = await Promise.all([post({ ...payload, phone: '01000009903' }), post({ ...payload, phone: '010-0000-9903' })]);
    assert.deepEqual(pair.map(r => r.status).sort(), [201,409]);
  });
  await t.test('pending registration stays blocked until explicitly approved', async () => {
    const result = await post({ ...payload, name: 'QA 대기', phone: '01000009904', approvalStatus: 'PENDING' });
    assert.equal(result.status, 201); const { id } = await result.json();
    const row = db.prepare('SELECT * FROM booking_members WHERE id=?').get(id);
    assert.equal(row.approved_by, null); assert.equal(row.approved_at, null); assert.equal(row.consultation_status, 'REQUESTED');
    assert.equal((await login('QA 대기', '01000009904')).status, 401);
    assert.equal((await post({ action: 'approveMember', memberId: id, approved: true })).status, 200);
    assert.equal((await login('QA 대기', '01000009904')).status, 200);
    await post({ action: 'deleteMember', memberId: id });
    assert.equal((await post({ ...payload, phone: '01000009904' })).status, 409, 'deleted accounts are not silently restored');
    assert.ok(db.prepare('SELECT deleted_at FROM booking_members WHERE id=?').get(id).deleted_at);
  });
  await t.test('invalid fields and status never insert partial accounts', async () => {
    const before = db.prepare('SELECT COUNT(*) n FROM booking_members').get().n;
    for (const invalid of [{ name: ' ' }, { name: 'a'.repeat(41) }, { phone: '123' }, { approvalStatus: 'REVOKED' }, { approvalStatus: undefined }, { adminMemo: 'x'.repeat(501) }, { desiredStationType: '<script>' }]) {
      assert.equal((await post({ ...payload, phone: '01000009905', ...invalid })).status, 400);
    }
    assert.equal(db.prepare('SELECT COUNT(*) n FROM booking_members').get().n, before);
    const logs = db.prepare("SELECT * FROM audit_logs WHERE action='create_booking_member'").all();
    assert.equal(logs.length, 3); assert.doesNotMatch(JSON.stringify(logs), /010000099|관리 메모/);
  });
  await t.test('audit failure rolls back registration', async () => {
    db.exec("CREATE TRIGGER qa_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.action='create_booking_member' BEGIN SELECT RAISE(ABORT, 'qa audit unavailable'); END");
    const before = db.prepare('SELECT COUNT(*) n FROM booking_members').get().n;
    assert.notEqual((await post({ ...payload, phone: '01000009906' })).status, 201);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM booking_members').get().n, before);
    db.exec('DROP TRIGGER qa_audit_failure');
  });
});
