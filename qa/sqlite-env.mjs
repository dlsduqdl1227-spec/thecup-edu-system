import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

// A new isolated in-memory D1-compatible database for each QA server process.
const database = globalThis.__thecupQaDatabase ??= new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
if (!database.prepare("SELECT name FROM sqlite_master WHERE name = 'edu_deck_visibility'").get()) {
  database.exec(readFileSync(new URL("../drizzle/0016_workable_namora.sql", import.meta.url), "utf8"));
}
let educationSchemaReady = false;
function prepare(sql, values = []) {
  const args = values.map((value) => value instanceof ArrayBuffer ? Buffer.from(value) : value);
  const execute = () => {
    const statement = database.prepare(sql);
    if (statement.columns().length) return { success: true, results: statement.all(...args), meta: {} };
    const result = statement.run(...args);
    // The grant cleanup trigger needs the existing member table, created during bootstrap.
    if (!educationSchemaReady && database.prepare("SELECT name FROM sqlite_master WHERE name = 'booking_members'").get()) {
      if (!database.prepare("SELECT name FROM sqlite_master WHERE name = 'edu_member_courses'").get()) {
        database.exec(readFileSync(new URL("../drizzle/0017_wealthy_gertrude_yorkes.sql", import.meta.url), "utf8"));
      }
      if (!database.prepare("SELECT name FROM sqlite_master WHERE name = 'edu_member_levels'").get()) {
        database.exec(readFileSync(new URL("../drizzle/0018_big_dragon_man.sql", import.meta.url), "utf8"));
        for (const id of ['flavor-wheel-ko','sca-brewing-2019','sca-water']) {
          const file = resolve(process.env.EDU_QA_ASSET_DIR || 'outputs/sca-assets', `${id}.png`);
          if (existsSync(file)) {
            const data = readFileSync(file);
            database.prepare('INSERT INTO edu_assets VALUES (?,?,?,?)').run(id,'image/png',data,createHash('sha256').update(data).digest('hex'));
          }
        }
      }
      educationSchemaReady = true;
    }
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
