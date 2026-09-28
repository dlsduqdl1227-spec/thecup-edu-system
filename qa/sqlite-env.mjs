import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

// A new isolated in-memory D1-compatible database for each QA server process.
const database = globalThis.__thecupQaDatabase ??= new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
if (!database.prepare("SELECT name FROM sqlite_master WHERE name = 'edu_deck_visibility'").get()) {
  database.exec(readFileSync(new URL("../drizzle/0016_workable_namora.sql", import.meta.url), "utf8"));
}
function prepare(sql, values = []) {
  const args = values.map((value) => value instanceof ArrayBuffer ? Buffer.from(value) : value);
  const execute = () => {
    const statement = database.prepare(sql);
    if (statement.columns().length) return { success: true, results: statement.all(...args), meta: {} };
    const result = statement.run(...args);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  };
  return {
    bind: (...next) => prepare(sql, next),
    first: async (column) => { const row = database.prepare(sql).get(...args) ?? null; return column ? row?.[column] ?? null : row; },
    all: async () => execute(),
    run: async () => execute(),
    execute,
  };
}
export const env = { DB: {
  prepare,
  batch: async (statements) => {
    database.exec("BEGIN");
    try { const results = statements.map((statement) => statement.execute()); database.exec("COMMIT"); return results; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  },
} };
