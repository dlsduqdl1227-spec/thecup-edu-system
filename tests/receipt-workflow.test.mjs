import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

// Run the actual route handlers against isolated, in-memory SQLite. No live accounts or uploads.
test("receipt upload atomically links stock and expense, and only its instructor or an administrator can read it", async (t) => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const prepare = (sql, values = []) => {
    const args = values.map((value) => value instanceof ArrayBuffer ? Buffer.from(value) : value);
    return {
      bind: (...next) => prepare(sql, next),
      first: async () => sqlite.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...args), success: true }),
      run: async () => {
        const result = sqlite.prepare(sql).run(...args);
        return { success: true, meta: { last_row_id: Number(result.lastInsertRowid), changes: Number(result.changes) } };
      },
    };
  };
  globalThis.__receiptTestEnv = { DB: {
    prepare,
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  } };
  t.after(() => { sqlite.close(); delete globalThis.__receiptTestEnv; });
  const output = await build({
    stdin: { contents: 'export { POST as upload } from "./app/api/inventory/milk-purchase/route.ts"; export { GET as receipt } from "./app/api/receipts/[id]/route.ts";', resolveDir: fileURLToPath(new URL("../", import.meta.url)), loader: "ts" },
    bundle: true, write: false, platform: "node", format: "esm",
    plugins: [{ name: "isolated-database", setup(builder) {
      builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "test-db", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const env = globalThis.__receiptTestEnv;", loader: "js" }));
    } }],
  });
  const routes = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
  const securityVersion = "00000000-0000-4000-8000-000000000000";
  const secureToken = (name) => `${securityVersion}.${name.padEnd(43, "x")}`;
  const request = (path, cookie, init = {}) => new Request(`https://receipt-test.invalid${path}`, { ...init, headers: cookie ? { cookie: `thecup_session=${secureToken(cookie)}` } : undefined });
  const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });
  assert.equal((await routes.receipt(request("/api/receipts/1"), params(1))).status, 401);

  sqlite.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)").run("auth_security_operator", JSON.stringify({ version: securityVersion, digest: "0".repeat(64) }));
  const addUser = (name, role, token) => {
    const row = sqlite.prepare("INSERT INTO staff (name, phone_hash, phone_last4, role) VALUES (?, ?, '0000', ?)").run(name, name, role);
    sqlite.prepare("INSERT INTO sessions (token_hash, staff_id, expires_at) VALUES (?, ?, ?)").run(createHash("sha256").update(secureToken(token)).digest("hex"), Number(row.lastInsertRowid), "2099-01-01T00:00:00Z");
  };
  addUser("Test instructor", "instructor", "owner");
  addUser("Other instructor", "instructor", "other");
  addUser("Test admin", "admin", "admin");
  const milkBefore = sqlite.prepare("SELECT quantity FROM inventory_items WHERE category = 'milk' AND active = 1 LIMIT 1").get().quantity;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=", "base64");
  const form = new FormData();
  form.set("quantity", "2"); form.set("amount", "5000"); form.set("movementDate", "2026-09-11");
  form.set("receipt", new File([png], "album.png", { type: "image/png" }));
  const saved = await routes.upload(request("/api/inventory/milk-purchase", "owner", { method: "POST", body: form }));
  assert.equal(saved.status, 201, await saved.clone().text());
  const { id } = await saved.json();
  assert.equal(sqlite.prepare("SELECT quantity FROM inventory_items WHERE category = 'milk' AND active = 1 LIMIT 1").get().quantity, milkBefore + 2);
  assert.equal(sqlite.prepare("SELECT amount FROM finance_transactions WHERE inventory_movement_id = ?").get(id).amount, 5000);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receipt_files WHERE movement_id = ?").get(id).count, 1);
  for (const token of ["owner", "admin"]) {
    const image = await routes.receipt(request(`/api/receipts/${id}`, token), params(id));
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  }
  assert.equal((await routes.receipt(request(`/api/receipts/${id}`, "other"), params(id))).status, 403);
  form.set("receipt", new File(["not a photo"], "fake.png", { type: "image/png" }));
  assert.equal((await routes.upload(request("/api/inventory/milk-purchase", "owner", { method: "POST", body: form }))).status, 400);
  assert.equal(sqlite.prepare("SELECT quantity FROM inventory_items WHERE category = 'milk' AND active = 1 LIMIT 1").get().quantity, milkBefore + 2);
  sqlite.exec("CREATE TRIGGER simulate_expense_failure BEFORE INSERT ON finance_transactions BEGIN SELECT RAISE(ABORT, 'SQLITE test expense failure'); END");
  t.mock.method(console, "error", () => {});
  form.set("receipt", new File([png], "album.png", { type: "image/png" }));
  assert.equal((await routes.upload(request("/api/inventory/milk-purchase", "owner", { method: "POST", body: form }))).status, 500);
  assert.equal(sqlite.prepare("SELECT quantity FROM inventory_items WHERE category = 'milk' AND active = 1 LIMIT 1").get().quantity, milkBefore + 2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM receipt_files").get().count, 1);
});
