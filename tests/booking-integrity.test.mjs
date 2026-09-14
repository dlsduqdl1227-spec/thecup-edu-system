import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

test("booking lifecycle keeps private, public and recruitment schedules consistent", async (t) => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const prepare = (sql, args = []) => ({
    bind: (...next) => prepare(sql, next),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args), success: true }),
    run: async () => { const result = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
  });
  globalThis.__bookingTestEnv = { DB: { prepare, batch: async (statements) => {
    sqlite.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } } };
  t.after(() => { sqlite.close(); delete globalThis.__bookingTestEnv; });
  const output = await build({ stdin: { contents: `
    export { GET as adminGet, POST as admin } from './app/api/booking/admin/route.ts';
    export { GET as memberGet, POST as member } from './app/api/booking/member/route.ts';
    export { GET as availability } from './app/api/booking/public/availability/route.ts';
    export { GET as courses } from './app/api/course-openings/route.ts';
  `, resolveDir: fileURLToPath(new URL("../", import.meta.url)), loader: "ts" }, bundle: true, write: false, platform: "node", format: "esm", plugins: [{ name: "isolated-db", setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "test", namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const env = globalThis.__bookingTestEnv;" }));
  } }] });
  const routes = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
  const securityVersion = "00000000-0000-4000-8000-000000000000";
  const secureToken = (name) => `${securityVersion}.${name.padEnd(43, "x")}`;
  const request = (path, cookie = "", data) => new Request(`https://booking-test.invalid${path}`, { method: data ? "POST" : "GET", headers: { cookie: cookie.replace(/(thecup_(?:member_)?session=)([^;]+)/g, (_, prefix, value) => prefix + secureToken(value)), "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined });
  assert.equal((await routes.adminGet(request("/api/booking/admin"))).status, 401);
  for (const audience of ["operator", "student"]) sqlite.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)").run(`auth_security_${audience}`, JSON.stringify({ version: securityVersion, digest: "0".repeat(64) }));
  const hash = (token) => createHash("sha256").update(secureToken(token)).digest("hex");
  sqlite.prepare("INSERT INTO staff (name, phone_hash, phone_last4, role) VALUES ('QA Admin', 'admin', '0000', 'admin')").run();
  sqlite.prepare("INSERT INTO sessions (token_hash, staff_id, expires_at) VALUES (?, 1, '2100-01-01')").run(hash("admin"));
  for (let id = 1; id <= 2; id++) {
    sqlite.prepare("INSERT INTO booking_members (name, phone_hash, phone_last4, approval_status, approved_by) VALUES (?, ?, '0000', 'APPROVED', 1)").run(`QA ${id}`, `member${id}`);
    sqlite.prepare("INSERT INTO member_sessions (token_hash, member_id, expires_at) VALUES (?, ?, '2100-01-01')").run(hash(`member${id}`), id);
  }
  const admin = (data) => routes.admin(request("/api/booking/admin", "thecup_session=admin", data));
  const member = (id, data) => routes.member(request("/api/booking/member", `thecup_member_session=member${id}`, data));
  const reserve = (id, slotId) => member(id, { action: "requestReservation", slotId, purpose: "ESPRESSO", materialPlan: "SELF" });
  const slots = () => sqlite.prepare("SELECT * FROM booking_slots ORDER BY id").all();

  await t.test("async validation returns readable JSON 400, not a rejected handler", async () => {
    const response = await admin({ action: "generateSlots", month: "2099-10", dates: ["2099-10-32"] });
    assert.equal(response.status, 400); assert.match((await response.json()).error, /날짜/);
  });
  await t.test("batch creation and copying exclude overlapping times", async () => {
    const data = { action: "generateSlots", month: "2099-10", dates: ["2099-10-12"], stationIds: [1], times: [{ start: "09:00", end: "11:30" }] };
    assert.equal((await (await admin(data)).json()).created, 1);
    assert.equal((await (await admin(data)).json()).skipped, 1);
    await admin({ ...data, dates: ["2099-10-13"], times: [{ start: "10:00", end: "12:00" }] });
    const copied = await admin({ action: "copyDate", sourceDate: "2099-10-12", targetDate: "2099-10-13" });
    assert.deepEqual(await copied.json(), { ok: true, created: 0, skipped: 1 });
    assert.equal((await admin({ action: "copyDate", sourceDate: "2099-02-31", targetDate: "2099-10-14" })).status, 400);
  });
  let reservationId;
  await t.test("approved member requests without a manually issued pass; duplicate requests are 409", async () => {
    const response = await reserve(1, slots()[0].id);
    assert.equal(response.status, 201, await response.clone().text());
    reservationId = (await response.json()).id;
    assert.equal((await reserve(1, slots()[0].id)).status, 409);
  });
  await t.test("confirmation removes the slot from public and administrator availability counts", async () => {
    const response = await admin({ action: "decideReservation", reservationId, decision: "CONFIRMED" });
    assert.equal(response.status, 200, await response.clone().text());
    const publicData = await (await routes.availability(request("/api/booking/public/availability?month=2099-10"))).json();
    const summary = await (await routes.courses(request("/api/course-openings?month=2099-10", "thecup_session=admin"))).json();
    assert.equal(publicData.slots.length, 1);
    assert.equal(summary.scheduleDays.reduce((sum, day) => sum + day.openSlots, 0), publicData.slots.length);
    assert.doesNotMatch(JSON.stringify(publicData), /phone|memberId|memberName|payment|QA /);
    assert.equal((await reserve(2, slots()[0].id)).status, 409);
    assert.equal((await admin({ action: "setSlotBlock", slotId: slots()[0].id, blocked: true, reason: "QA" })).status, 409);
  });
  await t.test("different start times that overlap cannot both be confirmed for one member", async () => {
    await admin({ action: "generateSlots", month: "2099-10", dates: ["2099-10-12"], stationIds: [2], times: [{ start: "10:00", end: "12:00" }] });
    assert.equal((await reserve(1, slots().at(-1).id)).status, 409);
    // Simulate a request submitted before the first confirmation, then confirm it later.
    const pass = sqlite.prepare("SELECT id FROM member_passes WHERE member_id = 1").get();
    const pending = sqlite.prepare("INSERT INTO reservations (member_id, slot_id, pass_id, slot_start_at, status, purpose, material_plan) VALUES (1, ?, ?, ?, 'REQUESTED', 'BREWING', 'SELF')").run(slots().at(-1).id, pass.id, slots().at(-1).start_at);
    assert.equal((await admin({ action: "decideReservation", reservationId: Number(pending.lastInsertRowid), decision: "CONFIRMED" })).status, 409);
  });
  await t.test("recording payment twice is rejected and cancellation reopens the slot", async () => {
    const payment = { action: "recordPayment", memberId: 1, reservationId, method: "CARD", status: "PAID" };
    assert.equal((await admin(payment)).status, 201);
    assert.equal((await admin(payment)).status, 409);
    assert.equal((await member(1, { action: "cancelReservation", reservationId })).status, 200);
    const publicData = await (await routes.availability(request("/api/booking/public/availability?month=2099-10"))).json();
    assert.equal(publicData.slots.length, 3);
  });
  await t.test("legacy overlapping slots use the same availability rules in all views", async () => {
    const slot = slots()[0];
    const response = await reserve(2, slot.id);
    assert.equal(response.status, 201);
    const nextId = (await response.json()).id;
    assert.equal((await admin({ action: "decideReservation", reservationId: nextId, decision: "CONFIRMED" })).status, 200);
    const overlapping = sqlite.prepare("INSERT INTO booking_slots (station_id, start_at, end_at, status, created_by) VALUES (1, '2099-10-12T10:00:00+09:00', '2099-10-12T12:00:00+09:00', 'OPEN', 1)").run();
    const publicData = await (await routes.availability(request("/api/booking/public/availability?month=2099-10"))).json();
    assert.equal(publicData.slots.some((row) => row.stationName === "에스프레소 스테이션" && row.startAt.startsWith("2099-10-12")), false);
    const summary = await (await routes.courses(request("/api/course-openings?month=2099-10", "thecup_session=admin"))).json();
    assert.equal(summary.scheduleDays.reduce((sum, day) => sum + day.openSlots, 0), publicData.slots.length);
    const memberData = await (await routes.memberGet(request("/api/booking/member?month=2099-10", "thecup_member_session=member2"))).json();
    assert.equal(memberData.slots.find((row) => row.id === Number(overlapping.lastInsertRowid)).displayStatus, "RESERVED");
    assert.equal(memberData.slots.find((row) => row.stationId === 2 && row.startAt.startsWith("2099-10-12")).displayStatus, "RESERVED");
  });
  await t.test("revocation invalidates existing sessions without erasing reservation history", async () => {
    assert.equal((await admin({ action: "approveMember", memberId: 1, approved: false })).status, 200);
    assert.equal((await routes.memberGet(request("/api/booking/member", "thecup_member_session=member1"))).status, 401);
    assert.equal(sqlite.prepare("SELECT status FROM reservations WHERE id = ?").get(reservationId).status, "CANCELLED");
    assert.equal((await admin({ action: "deleteMember", memberId: 1 })).status, 200);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM booking_payments WHERE member_id = 1").get().count, 1);
  });
});
