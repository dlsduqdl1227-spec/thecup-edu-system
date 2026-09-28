import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

test("education course grants are per student, admin-only and independent of booking approval", async t => {
  process.env.SESSION_SECRET = "local-education-test-only";
  process.env.OPERATOR_INITIAL_SECURITY_CODE = "7319";
  process.env.STUDENT_INITIAL_SECURITY_CODE = "08372";
  const sqlite = new DatabaseSync(":memory:");
  const prepare = (sql, args = []) => ({
    bind: (...next) => prepare(sql, next),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args), success: true }),
    run: async () => { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  globalThis.__educationEnv = { DB: { prepare, batch: async statements => {
    sqlite.exec("BEGIN");
    try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec("COMMIT"); return results; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } } };
  t.after(() => { sqlite.close(); delete globalThis.__educationEnv; });
  const output = await build({ stdin: { contents: `
    export { PUT as visibility } from './app/api/edu/decks/[course]/[level]/visibility/route.ts';
    export { PUT as grant } from './app/api/edu/members/[memberId]/courses/[course]/levels/[level]/route.ts';
    export { GET as members } from './app/api/edu/members/route.ts';
    export { GET as me } from './app/api/edu/me/route.ts';
    export { GET as catalog } from './app/api/edu/catalog/route.ts';
    export { GET as deck } from './app/api/edu/decks/[course]/[level]/route.ts';
    export { GET as asset } from './app/api/edu/decks/[course]/[level]/assets/[asset]/route.ts';
    export { PUT as legacyCourse } from './app/api/edu/members/[memberId]/courses/[course]/route.ts';
    export { ensureDatabase } from './lib/db';
    export { createSession, phoneHash } from './lib/auth';
    export { createMemberSession } from './lib/member-auth';
  `, resolveDir: fileURLToPath(new URL("../", import.meta.url)), loader: "ts" }, bundle: true, write: false, platform: "node", format: "esm", plugins: [{ name: "isolated", setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "env", namespace: "isolated" }));
    b.onLoad({ filter: /.*/, namespace: "isolated" }, () => ({ contents: "export const env = globalThis.__educationEnv;" }));
  } }] });
  const routes = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
  await routes.ensureDatabase();
  const before = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  sqlite.exec(readFileSync(new URL("../drizzle/0016_workable_namora.sql", import.meta.url), "utf8"));
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name).filter(n => !before.includes(n)), ["edu_deck_visibility"]);
  sqlite.exec(readFileSync(new URL("../drizzle/0017_wealthy_gertrude_yorkes.sql", import.meta.url), "utf8"));
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name).filter(n => !before.includes(n)), ["edu_deck_visibility", "edu_member_courses"]);
  sqlite.exec(readFileSync(new URL('../drizzle/0018_big_dragon_man.sql', import.meta.url), 'utf8'));
  const staffCookies = [];
  for (const [i, role] of ["admin", "employee", "instructor"].entries()) {
    sqlite.prepare("INSERT INTO staff (id,name,phone_hash,phone_last4,role) VALUES (?,?,?,?,?)").run(i + 1, role, await routes.phoneHash(`0100000000${i + 1}`), `000${i + 1}`, role);
    staffCookies.push(`thecup_session=${(await routes.createSession(i + 1)).token}`);
  }
  const students = [];
  for (const [i, status] of ['APPROVED','APPROVED','PENDING','REVOKED'].entries()) {
    sqlite.prepare("INSERT INTO booking_members (id,name,phone_hash,phone_last4,approval_status) VALUES (?,?,?,?,?)").run(i+1, `Student ${i+1}`, await routes.phoneHash(`0100000000${i+4}`), `000${i+4}`, status);
    students.push(`thecup_member_session=${(await routes.createMemberSession(i+1)).token}`);
  }
  const student = students[0];
  const imageBytes = Buffer.from('89504e470d0a1a0a', 'hex');
  sqlite.prepare("INSERT INTO edu_assets VALUES ('sca-water','image/png',?,?)").run(imageBytes,'a'.repeat(64));
  const context = { params: Promise.resolve({ course: "brewing", level: "Foundation" }) };
  const req = (cookie = "", body, origin = "https://qa.invalid") => new Request("https://qa.invalid/api/edu/decks/brewing/Foundation/visibility", { method: body === undefined ? "GET" : "PUT", headers: { cookie, origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const target = (memberId = '1', course = 'brewing', level = 'Foundation') => ({ params: Promise.resolve({ memberId, course, level }) });
  const imageContext = {params:Promise.resolve({course:'brewing',level:'Foundation',asset:'sca-water'})};
  assert.equal((await routes.asset(req(),imageContext)).status,401);
  assert.equal((await routes.asset(req(student),imageContext)).status,404);
  assert.equal((await routes.legacyCourse(req(staffCookies[0],{enabled:true}))).status,409);
  for (const [cookie, status] of [["", 401], [student, 401], [staffCookies[1], 403], [staffCookies[2], 403]]) {
    assert.equal((await routes.grant(req(cookie, { enabled: true }), target())).status, status);
    assert.equal((await routes.members(req(cookie))).status, status);
    assert.equal((await routes.visibility(req(cookie, { published: true }))).status, status);
  }
  for (const cookie of ["", staffCookies[1], staffCookies[2]]) assert.equal((await routes.catalog(req(cookie))).status, 401);
  assert.equal((await routes.visibility(req(staffCookies[0], { published: true }))).status, 409);
  assert.equal((await routes.grant(req(staffCookies[0], { enabled: true }, "https://evil.invalid"), target())).status, 403);
  assert.equal((await routes.grant(req(staffCookies[0], { enabled: "true" }), target())).status, 400);
  for (const id of ['0','-1','1.5','1 OR 1=1','9007199254740992']) assert.equal((await routes.grant(req(staffCookies[0], { enabled: true }), target(id))).status, 400);
  assert.equal((await routes.grant(req(staffCookies[0], { enabled: true }), target('99'))).status, 404);
  assert.equal((await routes.grant(req(staffCookies[0], { enabled: true }), target('1','unknown'))).status, 404);
  for (const id of ['3','4']) assert.equal((await routes.grant(req(staffCookies[0], { enabled: true }), target(id))).status, 409);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM edu_member_levels").get().n, 0);
  // Even historical global publication grants no access to general booking members.
  sqlite.prepare("INSERT INTO edu_deck_visibility VALUES ('brewing','Foundation','ready','1',CURRENT_TIMESTAMP)").run();
  assert.equal((await routes.deck(req(student), context)).status, 404);
  assert.deepEqual((await (await routes.catalog(req(student))).json()).courses, []);
  assert.deepEqual(await (await routes.me(req(student))).json(), { name: 'Student 1', role: 'student' });
  assert.equal((await routes.grant(req(staffCookies[0], { enabled: true }), target('1','brewing','Unknown'))).status, 404);
  const result = await routes.grant(req(staffCookies[0], { enabled: true }), target());
  assert.equal(result.status, 200);
  const image = await routes.asset(req(student),imageContext);
  assert.equal(image.status,200);
  assert.equal(image.headers.get('content-type'),'image/png');
  assert.equal(image.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()),imageBytes);
  assert.equal((await routes.asset(req(student),{params:Promise.resolve({course:'brewing',level:'Intermediate',asset:'sca-water'})})).status,404);
  assert.equal((await routes.asset(req(student),{params:Promise.resolve({course:'brewing',level:'Foundation',asset:'flavor-wheel-ko'})})).status,404);
  assert.equal((await routes.asset(req(student),{params:Promise.resolve({course:'brewing',level:'Foundation',asset:'sca-brewing-2019'})})).status,503);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM edu_member_levels").get().n, 1);
  assert.equal((await routes.grant(req(staffCookies[0], { enabled: true }), target())).status, 200);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM edu_member_levels").get().n, 1, 'repeat enable is idempotent');
  assert.equal((await routes.deck(req(student), {params:Promise.resolve({course:'brewing',level:'Intermediate'})})).status, 404);
  const catalog = await (await routes.catalog(req(student))).json();
  assert.deepEqual(catalog.courses.map(c => c.id), ['brewing']);
  assert.equal(catalog.courses.flatMap(c => c.levels).filter(l => l.deck).length, 1);
  assert.equal((await routes.deck(req(students[1]), context)).status, 404, 'another approved student has no access');
  await routes.grant(req(staffCookies[0], { enabled: true }), target('2','roasting'));
  assert.deepEqual((await (await routes.catalog(req(students[1]))).json()).courses.map(c => c.id), ['roasting']);
  const list = await (await routes.members(req(staffCookies[0]))).json();
  assert.deepEqual(list.members[0].levels,[{courseId:'brewing',level:'Foundation'}]);
  assert.deepEqual(Object.keys(list.members[0]).sort(), ['id','name','phoneLast4','approvalStatus','levels'].sort());
  const response = await routes.deck(req(student), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const deck = await response.json();
  assert.equal(deck.status, "ready");
  assert.ok(deck.slides.every(s => !("notes" in s)));
  assert.ok(!("sources" in deck) && !("sourceNote" in deck));
  await routes.grant(req(staffCookies[0], { enabled: false }), target());
  assert.equal((await routes.asset(req(student),imageContext)).status,404);
  assert.equal((await routes.deck(req(student), context)).status, 404);
  assert.equal(sqlite.prepare("SELECT approval_status FROM booking_members WHERE id=1").get().approval_status, 'APPROVED', 'education revoke leaves booking approval intact');
  assert.equal((await routes.catalog(req(student))).status, 200, 'member login remains usable');
  assert.deepEqual((await (await routes.catalog(req(students[1]))).json()).courses.map(c => c.id), ['roasting']);
  await routes.grant(req(staffCookies[0], { enabled: true }), target());
  sqlite.prepare("UPDATE booking_members SET approval_status='REVOKED' WHERE id=1").run();
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM edu_member_levels WHERE member_id=1").get().n, 0, 'revocation clears only that member education grants, even within the same second');
  assert.equal((await routes.deck(req(student), context)).status, 401);
  sqlite.prepare("UPDATE booking_members SET approval_status='APPROVED' WHERE id=1").run();
  assert.equal((await routes.deck(req(student), context)).status, 404, 'same-timestamp reapproval cannot recover grants');
  sqlite.prepare("UPDATE booking_members SET approval_status='APPROVED',approved_at='2099-01-01T00:00:00.000Z' WHERE id=1").run();
  assert.equal((await routes.deck(req(student), context)).status, 404, 'reapproval must not resurrect old course grants');
  await routes.grant(req(staffCookies[0], { enabled: true }), target());
  assert.equal((await routes.deck(req(student), context)).status, 200);
  sqlite.prepare("UPDATE booking_members SET deleted_at=CURRENT_TIMESTAMP WHERE id=1").run();
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM edu_member_levels WHERE member_id=1").get().n, 0);
  assert.equal((await routes.deck(req(student), context)).status, 401);
  assert.equal((await routes.grant(req(staffCookies[0], { enabled: true }), target())).status, 404);
  assert.ok(!(await (await routes.members(req(staffCookies[0]))).json()).members.some(m => m.id === 1));
  assert.equal((await routes.deck(req(staffCookies[0]), context)).status, 200);
});
