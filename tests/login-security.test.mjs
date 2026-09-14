import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

test("server security codes protect both audiences and rotate existing sessions", async (t) => {
  process.env.SESSION_SECRET = "isolated-security-test-secret-not-production";
  process.env.OPERATOR_INITIAL_SECURITY_CODE = "7319";
  process.env.STUDENT_INITIAL_SECURITY_CODE = "00000";
  const sqlite = new DatabaseSync(":memory:");
  const prepare = (sql, args = []) => ({
    bind: (...next) => prepare(sql, next),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args), success: true }),
    run: async () => { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  globalThis.__securityEnv = { DB: { prepare, batch: async (statements) => { sqlite.exec("BEGIN"); try { const rows = []; for (const statement of statements) rows.push(await statement.run()); sqlite.exec("COMMIT"); return rows; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } } };
  t.after(() => { sqlite.close(); delete globalThis.__securityEnv; });
  const output = await build({ stdin: { contents: `
    export { POST as operatorLogin } from './app/api/auth/login/route.ts';
    export { POST as studentLogin } from './app/api/member-auth/login/route.ts';
    export { PATCH as change } from './app/api/auth/security-code/route.ts';
    export { ensureDatabase } from './lib/db';
    export { phoneHash, getSessionUser, sha256, createSession, recordLoginFailure } from './lib/auth';
    export { getMemberSession } from './lib/member-auth';
    export { readLoginSecurity, makeLoginSecurity, rotateLoginSecurity } from './lib/login-security';
  `, resolveDir: fileURLToPath(new URL("../", import.meta.url)), loader: "ts" }, bundle: true, write: false, platform: "node", format: "esm", plugins: [{ name: "isolated", setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "env", namespace: "isolated" }));
    builder.onLoad({ filter: /.*/, namespace: "isolated" }, () => ({ contents: "export const env = globalThis.__securityEnv;" }));
  } }] });
  const routes = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
  await routes.ensureDatabase();
  const phone = "01000000001";
  sqlite.prepare("INSERT INTO staff (id, name, phone_hash, phone_last4, role) VALUES (1, 'Admin', ?, '0001', 'admin')").run(await routes.phoneHash(phone));
  sqlite.prepare("INSERT INTO staff (id, name, phone_hash, phone_last4, role) VALUES (2, 'Staff', ?, '0002', 'employee')").run(await routes.phoneHash("01000000002"));
  sqlite.prepare("INSERT INTO booking_members (id, name, phone_hash, phone_last4, approval_status) VALUES (1, 'Student', ?, '0001', 'APPROVED')").run(await routes.phoneHash(phone));
  const req = (path, data, cookie = "", extra = {}) => new Request(`https://qa.invalid${path}`, { method: data ? (path.includes("security-code") ? "PATCH" : "POST") : "GET", headers: { "Content-Type": "application/json", cookie, ...extra }, body: data ? JSON.stringify(data) : undefined });
  const op = (securityCode, name = "Admin", number = phone) => routes.operatorLogin(req("/api/auth/login", { name, phone: number, securityCode }));
  const student = (securityCode) => routes.studentLogin(req("/api/member-auth/login", { name: "Student", phone, securityCode }));
  const cookie = (response) => response.headers.get("set-cookie")?.split(";")[0] ?? "";
  let operatorCookie, studentCookie;
  await t.test("missing and incorrect codes cannot create either session", async () => {
    for (const login of [op, student]) for (const code of [undefined, "", "99999"]) {
      const response = await login(code); assert.equal(response.status, 401); assert.equal(response.headers.get("set-cookie"), null);
    }
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM member_sessions").get().n, 0);
  });
  await t.test("valid codes preserve leading zeros and return no code or digest", async () => {
    const operator = await op("7319"); const member = await student("00000");
    assert.equal(operator.status, 200); assert.equal(member.status, 200);
    operatorCookie = cookie(operator); studentCookie = cookie(member);
    assert.doesNotMatch(await operator.text() + await member.text(), /7319|00000|digest|securityCode/);
    assert.ok(await routes.getSessionUser(req("/", undefined, operatorCookie)));
    assert.ok(await routes.getMemberSession(req("/", undefined, studentCookie)));
    const settings = sqlite.prepare("SELECT value FROM app_settings WHERE key LIKE 'auth_security_%'").all();
    for (const row of settings) { assert.equal(JSON.parse(row.value).digest.length, 64); assert.notEqual(row.value, "00000"); }
  });
  await t.test("anonymous, student and ordinary staff cannot change codes", async () => {
    const payload = { audience: "student", currentOperatorCode: "7319", newCode: "00123", confirmCode: "00123" };
    assert.equal((await routes.change(req("/api/auth/security-code", payload))).status, 401);
    assert.equal((await routes.change(req("/api/auth/security-code", payload, studentCookie))).status, 401);
    const staff = await op("7319", "Staff", "01000000002");
    assert.equal((await routes.change(req("/api/auth/security-code", payload, cookie(staff)))).status, 403);
    assert.equal((await routes.change(req("/api/auth/security-code", payload, operatorCookie, { origin: "https://external.invalid" }))).status, 403);
    assert.equal((await routes.change(req("/api/auth/security-code", { ...payload, currentOperatorCode: "9999" }, operatorCookie))).status, 403);
    assert.equal((await routes.change(req("/api/auth/security-code", { ...payload, confirmCode: "9999" }, operatorCookie))).status, 400);
  });
  await t.test("student rotation invalidates student sessions only and never falls back to initial code", async () => {
    const result = await routes.change(req("/api/auth/security-code", { audience: "student", currentOperatorCode: "7319", newCode: "00123", confirmCode: "00123" }, operatorCookie));
    assert.equal(result.status, 200);
    assert.equal(await routes.getMemberSession(req("/", undefined, studentCookie)), null);
    assert.ok(await routes.getSessionUser(req("/", undefined, operatorCookie)));
    assert.equal((await student("00000")).status, 401);
    const response = await student("00123"); assert.equal(response.status, 200); studentCookie = cookie(response);
  });
  await t.test("operator rotation invalidates all old operators, preserves students and handles login/rotation races", async () => {
    const before = await routes.readLoginSecurity("operator");
    const result = await routes.change(req("/api/auth/security-code", { audience: "operator", currentOperatorCode: "7319", newCode: "845612", confirmCode: "845612" }, operatorCookie));
    assert.equal(result.status, 200); assert.equal((await result.json()).requiresRelogin, true);
    assert.equal(await routes.getSessionUser(req("/", undefined, operatorCookie)), null);
    assert.ok(await routes.getMemberSession(req("/", undefined, studentCookie)));
    assert.equal((await op("7319")).status, 401);
    assert.equal((await op("845612")).status, 200);
    const raced = await routes.createSession(1, before.version);
    assert.equal(await routes.getSessionUser(req("/", undefined, `thecup_session=${raced.token}`)), null);
    assert.equal(await routes.rotateLoginSecurity("operator", before, "12345"), false);
  });
  await t.test("legacy cookies are rejected even if the old token remains in the database", async () => {
    sqlite.prepare("INSERT INTO sessions (token_hash, staff_id, expires_at) VALUES (?, 1, '2100-01-01')").run(await routes.sha256("legacy-token"));
    assert.equal(await routes.getSessionUser(req("/", undefined, "thecup_session=legacy-token")), null);
  });
  await t.test("a persistence failure rolls back the code change and preserves login", async () => {
    const before = await routes.readLoginSecurity("operator");
    const response = await op("845612");
    sqlite.exec("CREATE TRIGGER fail_security_audit BEFORE INSERT ON audit_logs WHEN NEW.action = 'change_login_security_code' BEGIN SELECT RAISE(ABORT, 'SQLITE QA audit failure'); END");
    const mock = t.mock.method(console, "error", () => {});
    const failed = await routes.change(req("/api/auth/security-code", { audience: "operator", currentOperatorCode: "845612", newCode: "87543", confirmCode: "87543" }, cookie(response)));
    mock.mock.restore(); sqlite.exec("DROP TRIGGER fail_security_audit");
    assert.equal(failed.status, 500);
    assert.deepEqual(await routes.readLoginSecurity("operator"), before);
    assert.equal((await op("845612")).status, 200);
  });
  await t.test("repeated bad codes are rate limited and failures increment atomically", async () => {
    for (let i = 0; i < 5; i++) assert.equal((await op("9999")).status, 401);
    assert.equal((await op("845612")).status, 429);
    await Promise.all(Array.from({ length: 7 }, () => routes.recordLoginFailure("parallel-test")));
    assert.equal(sqlite.prepare("SELECT attempt_count FROM login_attempts WHERE identifier_hash = 'parallel-test'").get().attempt_count, 7);
    const audits = sqlite.prepare("SELECT detail FROM audit_logs WHERE action = 'change_login_security_code'").all();
    assert.doesNotMatch(JSON.stringify(audits), /7319|845612|00123|00000|digest/);
  });
});
