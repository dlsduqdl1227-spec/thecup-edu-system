import { env } from "cloudflare:workers";
import {
  summarizeLegacyInventory,
  type LegacyInventoryEntry,
} from "./legacy-inventory";

export type StaffRole = "admin" | "employee" | "instructor";
export type StaffPermission = "finance" | "inventory" | "roasting";

export type SessionUser = {
  id: number;
  name: string;
  role: StaffRole;
  canFinance: boolean;
  canInventory: boolean;
  canRoasting: boolean;
};

type MonthlySeed = {
  year: number;
  month: number;
  revenue: number;
  expense: number;
  note?: string;
};

const monthlySeeds: MonthlySeed[] = [
  { year: 2022, month: 1, revenue: 0, expense: 0 },
  { year: 2022, month: 2, revenue: 0, expense: 0 },
  { year: 2022, month: 3, revenue: 1700000, expense: 0 },
  { year: 2022, month: 4, revenue: 6091520, expense: 183150 },
  { year: 2022, month: 5, revenue: 10694570, expense: 911200 },
  { year: 2022, month: 6, revenue: 10333400, expense: 946800 },
  { year: 2022, month: 7, revenue: 11022280, expense: 361600 },
  { year: 2022, month: 8, revenue: 5937300, expense: 1720400 },
  { year: 2022, month: 9, revenue: 14788410, expense: 487100 },
  { year: 2022, month: 10, revenue: 5673000, expense: 700360 },
  { year: 2022, month: 11, revenue: 6136000, expense: 613500 },
  { year: 2022, month: 12, revenue: 11398280, expense: 201600 },
  { year: 2023, month: 1, revenue: 6662500, expense: 446825 },
  { year: 2023, month: 2, revenue: 9840000, expense: 1068720 },
  { year: 2023, month: 3, revenue: 10956500, expense: 603610 },
  { year: 2023, month: 4, revenue: 14006008, expense: 685140 },
  { year: 2023, month: 5, revenue: 13762500, expense: 585890 },
  { year: 2023, month: 6, revenue: 11995689, expense: 774620 },
  { year: 2023, month: 7, revenue: 14490182, expense: 1011350 },
  { year: 2023, month: 8, revenue: 11347000, expense: 684895 },
  { year: 2023, month: 9, revenue: 14600818, expense: 1100350 },
  { year: 2023, month: 10, revenue: 7038800, expense: 697431 },
  { year: 2023, month: 11, revenue: 23260364, expense: 760865 },
  { year: 2023, month: 12, revenue: 6465000, expense: 624490 },
  { year: 2024, month: 1, revenue: 11416000, expense: 388280 },
  { year: 2024, month: 2, revenue: 7211500, expense: 363585 },
  { year: 2024, month: 3, revenue: 7110000, expense: 444405 },
  { year: 2024, month: 4, revenue: 9209000, expense: 412275 },
  { year: 2024, month: 5, revenue: 10649500, expense: 345371 },
  { year: 2024, month: 6, revenue: 9783000, expense: 290670 },
  { year: 2024, month: 7, revenue: 10589000, expense: 199850 },
  { year: 2024, month: 8, revenue: 3074000, expense: 342510 },
  { year: 2024, month: 9, revenue: 7012150, expense: 228370 },
  { year: 2024, month: 10, revenue: 4517500, expense: 221740 },
  { year: 2024, month: 11, revenue: 3484000, expense: 364592 },
  { year: 2024, month: 12, revenue: 8540150, expense: 365734 },
  { year: 2025, month: 1, revenue: 954000, expense: 175035 },
  { year: 2025, month: 2, revenue: 2594500, expense: 476800 },
  { year: 2025, month: 3, revenue: 9315000, expense: 472226 },
  { year: 2025, month: 4, revenue: 6198000, expense: 387420 },
  { year: 2025, month: 5, revenue: 2526000, expense: 328800 },
  { year: 2025, month: 6, revenue: 2910750, expense: 109700, note: "대회 연습·예선 기간" },
  { year: 2025, month: 7, revenue: 3412000, expense: 108000 },
  { year: 2025, month: 8, revenue: 3869000, expense: 187200 },
  { year: 2025, month: 9, revenue: 3408000, expense: 109600 },
  { year: 2025, month: 10, revenue: 7370000, expense: 109600 },
  { year: 2025, month: 11, revenue: 7050000, expense: 73600, note: "카페쇼" },
  { year: 2025, month: 12, revenue: 3593000, expense: 235471 },
  { year: 2026, month: 1, revenue: 2140000, expense: 311488 },
  { year: 2026, month: 2, revenue: 7990000, expense: 110400 },
  { year: 2026, month: 3, revenue: 4915000, expense: 206200 },
  { year: 2026, month: 4, revenue: 5104000, expense: 94500 },
  { year: 2026, month: 5, revenue: 1150000, expense: 37600 },
  { year: 2026, month: 6, revenue: 1120000, expense: 201220, note: "대회 시즌" },
  { year: 2026, month: 7, revenue: 2650000, expense: 46000, note: "7월 24일까지 집계" },
  { year: 2026, month: 8, revenue: 0, expense: 0 },
  { year: 2026, month: 9, revenue: 0, expense: 0 },
  { year: 2026, month: 10, revenue: 0, expense: 0 },
  { year: 2026, month: 11, revenue: 0, expense: 0, note: "카페쇼 예정" },
  { year: 2026, month: 12, revenue: 0, expense: 0 },
];

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone_hash TEXT NOT NULL UNIQUE,
    phone_last4 TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','employee','instructor')),
    can_finance INTEGER NOT NULL DEFAULT 0,
    can_inventory INTEGER NOT NULL DEFAULT 0,
    can_roasting INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    staff_id INTEGER NOT NULL REFERENCES staff(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS monthly_finance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    revenue INTEGER NOT NULL DEFAULT 0,
    baseline_expense INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    UNIQUE(year, month)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
    category TEXT NOT NULL,
    amount INTEGER NOT NULL,
    transaction_date TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    inventory_movement_id INTEGER,
    created_by INTEGER NOT NULL REFERENCES staff(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK(category IN ('green','roasted','gusto','milk','other')),
    name TEXT NOT NULL,
    lot TEXT NOT NULL DEFAULT '',
    process TEXT NOT NULL DEFAULT '',
    expiry_date TEXT,
    legacy_key TEXT,
    unit TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    reorder_level REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER REFERENCES staff(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES inventory_items(id),
    movement_type TEXT NOT NULL CHECK(movement_type IN ('in','out','adjust','roast_in','roast_out')),
    quantity REAL NOT NULL,
    movement_date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    class_name TEXT NOT NULL DEFAULT '',
    cost_amount INTEGER NOT NULL DEFAULT 0,
    receipt_key TEXT,
    receipt_deleted_at TEXT,
    created_by INTEGER NOT NULL REFERENCES staff(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS receipt_files (
    movement_id INTEGER PRIMARY KEY REFERENCES inventory_movements(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS roasting_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bean_name TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT '',
    process TEXT NOT NULL DEFAULT '',
    batch_weight REAL NOT NULL,
    charge_temp REAL NOT NULL,
    yellowing_seconds INTEGER NOT NULL,
    first_crack_seconds INTEGER NOT NULL,
    drop_temp REAL NOT NULL,
    total_seconds INTEGER NOT NULL,
    development_seconds INTEGER NOT NULL,
    development_ratio REAL NOT NULL,
    gas_notes TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER,
    created_by INTEGER NOT NULL REFERENCES staff(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS roasting_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES roasting_profiles(id) ON DELETE CASCADE,
    seconds INTEGER NOT NULL,
    bean_temp REAL NOT NULL,
    gas_pressure REAL NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER REFERENCES staff(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    identifier_hash TEXT PRIMARY KEY,
    window_start TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0
  )`,
  "CREATE INDEX IF NOT EXISTS sessions_staff_idx ON sessions(staff_id)",
  "CREATE INDEX IF NOT EXISTS movements_item_date_idx ON inventory_movements(item_id, movement_date)",
  "CREATE UNIQUE INDEX IF NOT EXISTS movements_receipt_key_idx ON inventory_movements(receipt_key)",
  "CREATE INDEX IF NOT EXISTS finance_date_idx ON finance_transactions(transaction_date)",
  "CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at)",
  "CREATE INDEX IF NOT EXISTS roasting_points_profile_idx ON roasting_points(profile_id, seconds)",
  `CREATE TRIGGER IF NOT EXISTS inventory_nonnegative_update
   BEFORE UPDATE OF quantity ON inventory_items
   WHEN NEW.quantity < 0
   BEGIN
     SELECT RAISE(ABORT, 'inventory_quantity_negative');
   END`,
];

let initialization: Promise<void> | null = null;

export function getD1(): D1Database {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error("데이터베이스 연결이 준비되지 않았습니다.");
  return database;
}

export async function ensureDatabase(): Promise<void> {
  if (!initialization) {
    initialization = initializeDatabase().catch((error) => {
      initialization = null;
      throw error;
    });
  }
  await initialization;
}

async function initializeDatabase(): Promise<void> {
  const db = getD1();
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  await ensureStaffPermissionColumns(db);
  await ensureInventoryItemColumns(db);
  await ensureInventoryMovementColumns(db);
  await ensureRoastingProfileColumns(db);

  const financeSeedStatements = monthlySeeds.map((row) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO monthly_finance
          (year, month, revenue, baseline_expense, note, source)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.year,
        row.month,
        row.revenue,
        row.expense,
        row.note ?? "",
        `더컵에듀 연매출 분석표 KPI - ${row.year}년 연매출.csv`,
      ),
  );

  const inventorySeedStatements = [
    ["milk", "수업용 우유", "팩", 8],
    ["gusto", "구스토 원두", "g", 1000],
    ["roasted", "로스팅(원두)", "g", 1000],
    ["green", "로스팅용 생두", "kg", 5],
  ].map(([category, name, unit, reorder]) =>
    db
      .prepare(
        `INSERT INTO inventory_items (category, name, unit, quantity, reorder_level)
         SELECT ?, ?, ?, 0, ?
         WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE name = ?)`,
      )
      .bind(category, name, unit, reorder, name),
  );

  await db
    .prepare(
      `UPDATE inventory_items
       SET name = '로스팅(원두)', updated_at = CURRENT_TIMESTAMP
       WHERE category = 'roasted'
         AND name IN ('더컵 로스팅 원두', '더컵 볶은 원두')`,
    )
    .run();
  await db.batch([...financeSeedStatements, ...inventorySeedStatements]);
  await ensureLegacyInventory(db);
}

async function ensureStaffPermissionColumns(db: D1Database): Promise<void> {
  const columns = await db
    .prepare("PRAGMA table_info(staff)")
    .all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const missing = [
    ["can_finance", "ALTER TABLE staff ADD COLUMN can_finance INTEGER NOT NULL DEFAULT 0"],
    ["can_inventory", "ALTER TABLE staff ADD COLUMN can_inventory INTEGER NOT NULL DEFAULT 0"],
    ["can_roasting", "ALTER TABLE staff ADD COLUMN can_roasting INTEGER NOT NULL DEFAULT 0"],
    ["deleted_at", "ALTER TABLE staff ADD COLUMN deleted_at TEXT"],
  ].filter(([name]) => !names.has(name));
  const addedPermissionColumn = missing.some(([name]) => name.startsWith("can_"));

  for (const [, statement] of missing) {
    await db.prepare(statement).run();
  }

  if (addedPermissionColumn) {
    await db
      .prepare(
        `UPDATE staff
         SET can_finance = 1, can_inventory = 1, can_roasting = 1
         WHERE role IN ('admin', 'employee')`,
      )
      .run();
  }
}

async function ensureInventoryMovementColumns(db: D1Database): Promise<void> {
  const columns = await db
    .prepare("PRAGMA table_info(inventory_movements)")
    .all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));

  if (!names.has("receipt_deleted_at")) {
    await db
      .prepare("ALTER TABLE inventory_movements ADD COLUMN receipt_deleted_at TEXT")
      .run();
  }
}

async function ensureRoastingProfileColumns(db: D1Database): Promise<void> {
  const columns = await db
    .prepare("PRAGMA table_info(roasting_profiles)")
    .all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));

  if (!names.has("turning_point_seconds")) {
    await db
      .prepare("ALTER TABLE roasting_profiles ADD COLUMN turning_point_seconds INTEGER")
      .run();
  }

  if (!names.has("sort_order")) {
    await db
      .prepare("ALTER TABLE roasting_profiles ADD COLUMN sort_order INTEGER")
      .run();
  }

  await db
    .prepare(
      `UPDATE roasting_profiles
       SET turning_point_seconds = COALESCE(
         (
           SELECT rp.seconds
           FROM roasting_points rp
           WHERE rp.profile_id = roasting_profiles.id
             AND rp.seconds > 0
             AND rp.seconds < roasting_profiles.first_crack_seconds
           ORDER BY rp.bean_temp ASC, rp.seconds ASC
           LIMIT 1
         ),
         yellowing_seconds
       )
       WHERE turning_point_seconds IS NULL`,
    )
    .run();

  await db
    .prepare(
      `UPDATE roasting_profiles
       SET sort_order = (
         SELECT COUNT(*)
         FROM roasting_profiles AS newer
         WHERE newer.id > roasting_profiles.id
       )
       WHERE sort_order IS NULL`,
    )
    .run();
}

async function ensureInventoryItemColumns(db: D1Database): Promise<void> {
  const columns = await db
    .prepare("PRAGMA table_info(inventory_items)")
    .all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const missing = [
    ["lot", "ALTER TABLE inventory_items ADD COLUMN lot TEXT NOT NULL DEFAULT ''"],
    ["process", "ALTER TABLE inventory_items ADD COLUMN process TEXT NOT NULL DEFAULT ''"],
    ["expiry_date", "ALTER TABLE inventory_items ADD COLUMN expiry_date TEXT"],
    ["legacy_key", "ALTER TABLE inventory_items ADD COLUMN legacy_key TEXT"],
  ].filter(([name]) => !names.has(name));

  for (const [, statement] of missing) {
    await db.prepare(statement).run();
  }

  await db
    .prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_legacy_key_unique ON inventory_items(legacy_key)",
    )
    .run();
}

export async function readLegacyInventoryEntries(
  db: D1Database,
): Promise<LegacyInventoryEntry[]> {
  const table = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entries'",
    )
    .first<{ name: string }>();
  if (!table) return [];

  const rows = await db
    .prepare(
      `SELECT id, created_at, item, lot, type, amount_mkg,
              expiry_date, process, category
       FROM entries
       ORDER BY created_at ASC, id ASC`,
    )
    .all<LegacyInventoryEntry>();
  return rows.results;
}

async function ensureLegacyInventory(db: D1Database): Promise<void> {
  const entries = await readLegacyInventoryEntries(db);
  if (!entries.length) return;

  const summaries = summarizeLegacyInventory(entries);
  if (summaries.length) {
    await db.batch(
      summaries.map((item) =>
        db
          .prepare(
            `INSERT INTO inventory_items
              (category, name, lot, process, expiry_date, legacy_key,
               unit, quantity, reorder_level, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
             ON CONFLICT(legacy_key) DO NOTHING`,
          )
          .bind(
            item.category,
            item.name,
            item.lot,
            item.process,
            item.expiryDate,
            item.legacyKey,
            item.unit,
            item.quantity,
            item.reorderLevel,
          ),
      ),
    );
  }

  await db.batch([
    db.prepare(
      `UPDATE inventory_items
       SET active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE name = '로스팅용 생두' AND quantity = 0
         AND EXISTS (SELECT 1 FROM inventory_items WHERE legacy_key IS NOT NULL AND category = 'green')`,
    ),
    db.prepare(
      `UPDATE inventory_items
       SET active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE name = '구스토 원두' AND quantity = 0
         AND EXISTS (SELECT 1 FROM inventory_items WHERE legacy_key IS NOT NULL AND category = 'gusto')`,
    ),
  ]);
}

export async function audit(
  actorId: number | null,
  action: string,
  entityType: string,
  entityId = "",
  detail = "",
): Promise<void> {
  const db = getD1();
  await db
    .prepare(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(actorId, action, entityType, entityId, detail.slice(0, 500))
    .run();
}
