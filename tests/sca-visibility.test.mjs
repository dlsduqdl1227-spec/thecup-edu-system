import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

test("education publication is admin-only, persistent and privacy-safe", async t => {
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
    export { GET as catalog } from './app/api/edu/catalog/route.ts';
    export { GET as deck } from './app/api/edu/decks/[course]/[level]/route.ts';
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
  const staffCookies = [];
  for (const [i, role] of ["admin", "employee", "instructor"].entries()) {
    sqlite.prepare("INSERT INTO staff (id,name,phone_hash,phone_last4,role) VALUES (?,?,?,?,?)").run(i + 1, role, await routes.phoneHash(`0100000000${i + 1}`), `000${i + 1}`, role);
    staffCookies.push(`thecup_session=${(await routes.createSession(i + 1)).token}`);
  }
  sqlite.prepare("INSERT INTO booking_members (id,name,phone_hash,phone_last4,approval_status) VALUES (1,'Student',?,'0004','APPROVED')").run(await routes.phoneHash("01000000004"));
  const student = `thecup_member_session=${(await routes.createMemberSession(1)).token}`;
  const context = { params: Promise.resolve({ course: "brewing", level: "Foundation" }) };
  const req = (cookie = "", body, origin = "https://qa.invalid") => new Request("https://qa.invalid/api/edu/decks/brewing/Foundation/visibility", { method: body === undefined ? "GET" : "PUT", headers: { cookie, origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const [cookie, status] of [["", 401], [student, 401], [staffCookies[1], 403], [staffCookies[2], 403]]) {
    assert.equal((await routes.visibility(req(cookie, { published: true }), context)).status, status);
  }
  for (const cookie of ["", staffCookies[1], staffCookies[2]]) assert.equal((await routes.catalog(req(cookie))).status, 401);
  assert.equal((await routes.visibility(req(staffCookies[0], { published: true }, "https://evil.invalid"), context)).status, 403);
  assert.equal((await routes.visibility(req(staffCookies[0], { published: "true" }), context)).status, 400);
  assert.equal((await routes.visibility(req(staffCookies[0], { published: true }), { params: Promise.resolve({ course: "unknown", level: "Foundation" }) })).status, 404);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM edu_deck_visibility").get().n, 0);
  assert.equal((await routes.deck(req(student), context)).status, 404);
  const result = await routes.visibility(req(staffCookies[0], { published: true }), context);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(sqlite.prepare("SELECT status FROM edu_deck_visibility").get().status, "ready");
  const catalog = await (await routes.catalog(req(student))).json();
  assert.equal(catalog.courses.flatMap(c => c.levels).filter(l => l.deck).length, 1);
  const response = await routes.deck(req(student), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const deck = await response.json();
  assert.equal(deck.status, "ready");
  assert.ok(deck.slides.every(s => !("notes" in s)));
  assert.ok(!("sources" in deck) && !("sourceNote" in deck));
  await routes.visibility(req(staffCookies[0], { published: false }), context);
  assert.equal((await routes.deck(req(student), context)).status, 404);
  assert.equal(sqlite.prepare("SELECT status FROM edu_deck_visibility").get().status, "review");
  assert.equal((await routes.deck(req(staffCookies[0]), context)).status, 200);
});
