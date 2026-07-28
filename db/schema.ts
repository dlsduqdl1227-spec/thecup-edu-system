import { sql } from "drizzle-orm";
import { customType, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const sqliteBlob = customType<{ data: ArrayBuffer }>({
  dataType() {
    return "blob";
  },
});

export const staff = sqliteTable("staff", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phoneHash: text("phone_hash").notNull().unique(),
  phoneLast4: text("phone_last4").notNull(),
  role: text("role", { enum: ["admin", "employee", "instructor"] }).notNull(),
  canFinance: integer("can_finance", { mode: "boolean" }).notNull().default(false),
  canInventory: integer("can_inventory", { mode: "boolean" }).notNull().default(false),
  canRoasting: integer("can_roasting", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staff.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const monthlyFinance = sqliteTable(
  "monthly_finance",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    revenue: integer("revenue").notNull().default(0),
    baselineExpense: integer("baseline_expense").notNull().default(0),
    note: text("note").notNull().default(""),
    source: text("source").notNull().default(""),
  },
  (table) => [uniqueIndex("monthly_finance_period_idx").on(table.year, table.month)],
);

export const financeTransactions = sqliteTable("finance_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["income", "expense"] }).notNull(),
  category: text("category").notNull(),
  amount: integer("amount").notNull(),
  transactionDate: text("transaction_date").notNull(),
  description: text("description").notNull().default(""),
  inventoryMovementId: integer("inventory_movement_id"),
  createdBy: integer("created_by").notNull().references(() => staff.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const inventoryItems = sqliteTable("inventory_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category", {
    enum: ["green", "roasted", "gusto", "milk", "other"],
  }).notNull(),
  name: text("name").notNull(),
  lot: text("lot").notNull().default(""),
  process: text("process").notNull().default(""),
  expiryDate: text("expiry_date"),
  legacyKey: text("legacy_key").unique(),
  unit: text("unit").notNull(),
  quantity: real("quantity").notNull().default(0),
  reorderLevel: real("reorder_level").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: integer("created_by").references(() => staff.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const inventoryMovements = sqliteTable(
  "inventory_movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id").notNull().references(() => inventoryItems.id),
    movementType: text("movement_type", {
      enum: ["in", "out", "adjust", "roast_in", "roast_out"],
    }).notNull(),
    quantity: real("quantity").notNull(),
    movementDate: text("movement_date").notNull(),
    note: text("note").notNull().default(""),
    className: text("class_name").notNull().default(""),
    costAmount: integer("cost_amount").notNull().default(0),
    receiptKey: text("receipt_key"),
    receiptDeletedAt: text("receipt_deleted_at"),
    createdBy: integer("created_by").notNull().references(() => staff.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("movements_receipt_key_idx").on(table.receiptKey)],
);

export const receiptFiles = sqliteTable("receipt_files", {
  movementId: integer("movement_id")
    .primaryKey()
    .references(() => inventoryMovements.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  data: sqliteBlob("data").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const roastingProfiles = sqliteTable("roasting_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  beanName: text("bean_name").notNull(),
  origin: text("origin").notNull().default(""),
  process: text("process").notNull().default(""),
  batchWeight: real("batch_weight").notNull(),
  chargeTemp: real("charge_temp").notNull(),
  legacyMilestoneSeconds: integer("yellowing_seconds").notNull(),
  turningPointSeconds: integer("turning_point_seconds"),
  firstCrackSeconds: integer("first_crack_seconds").notNull(),
  dropTemp: real("drop_temp").notNull(),
  totalSeconds: integer("total_seconds").notNull(),
  developmentSeconds: integer("development_seconds").notNull(),
  developmentRatio: real("development_ratio").notNull(),
  gasNotes: text("gas_notes").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdBy: integer("created_by").notNull().references(() => staff.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const roastingPoints = sqliteTable("roasting_points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").notNull().references(() => roastingProfiles.id),
  seconds: integer("seconds").notNull(),
  beanTemp: real("bean_temp").notNull(),
  gasPressure: real("gas_pressure").notNull().default(0),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorId: integer("actor_id").references(() => staff.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull().default(""),
  detail: text("detail").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const loginAttempts = sqliteTable("login_attempts", {
  identifierHash: text("identifier_hash").primaryKey(),
  windowStart: text("window_start").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
});
