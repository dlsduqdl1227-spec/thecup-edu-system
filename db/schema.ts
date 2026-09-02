import { sql } from "drizzle-orm";
import { customType, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedBy: integer("updated_by").references(() => staff.id),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const bookingMembers = sqliteTable("booking_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  loginId: text("login_id").unique(),
  name: text("name").notNull(),
  phoneHash: text("phone_hash").notNull().unique(),
  phoneLast4: text("phone_last4").notNull(),
  approvalStatus: text("approval_status", { enum: ["PENDING", "APPROVED", "REVOKED"] }).notNull().default("PENDING"),
  consultationStatus: text("consultation_status", { enum: ["REQUESTED", "COMPLETED"] }).notNull().default("REQUESTED"),
  desiredStationType: text("desired_station_type").notNull().default(""),
  consultationMemo: text("consultation_memo").notNull().default(""),
  adminMemo: text("admin_memo").notNull().default(""),
  approvedBy: integer("approved_by").references(() => staff.id),
  approvedAt: text("approved_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const memberSessions = sqliteTable(
  "member_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    memberId: integer("member_id").notNull().references(() => bookingMembers.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("member_sessions_member_idx").on(table.memberId)],
);

export const stations = sqliteTable(
  "stations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("stations_name_unique").on(table.name)],
);

export const bookingSlots = sqliteTable(
  "booking_slots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stationId: integer("station_id").notNull().references(() => stations.id),
    startAt: text("start_at").notNull(),
    endAt: text("end_at").notNull(),
    status: text("status", { enum: ["OPEN", "BLOCKED"] }).notNull().default("OPEN"),
    blockReason: text("block_reason").notNull().default(""),
    createdBy: integer("created_by").notNull().references(() => staff.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("booking_slots_station_start_unique").on(table.stationId, table.startAt),
    index("booking_slots_start_status_idx").on(table.startAt, table.status),
  ],
);

export const memberPasses = sqliteTable(
  "member_passes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull().references(() => bookingMembers.id),
    type: text("type", { enum: ["DAILY", "MONTHLY"] }).notNull(),
    validMonth: text("valid_month").notNull(),
    price: integer("price").notNull(),
    status: text("status", { enum: ["ACTIVE", "EXPIRED", "CANCELLED"] }).notNull().default("ACTIVE"),
    maxActiveBookings: integer("max_active_bookings"),
    createdBy: integer("created_by").notNull().references(() => staff.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("member_passes_member_month_idx").on(table.memberId, table.validMonth, table.status)],
);

export const reservations = sqliteTable(
  "reservations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull().references(() => bookingMembers.id),
    slotId: integer("slot_id").notNull().references(() => bookingSlots.id),
    passId: integer("pass_id").notNull().references(() => memberPasses.id),
    slotStartAt: text("slot_start_at").notNull(),
    status: text("status", { enum: ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "REJECTED", "NO_SHOW"] }).notNull().default("REQUESTED"),
    purpose: text("purpose").notNull(),
    materialPlan: text("material_plan").notNull(),
    openToPeerPractice: integer("open_to_peer_practice", { mode: "boolean" }).notNull().default(false),
    userMemo: text("user_memo").notNull().default(""),
    adminMemo: text("admin_memo").notNull().default(""),
    rejectionReason: text("rejection_reason").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    confirmedAt: text("confirmed_at"),
    cancelledAt: text("cancelled_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("reservations_member_created_idx").on(table.memberId, table.createdAt),
    index("reservations_slot_status_idx").on(table.slotId, table.status),
    uniqueIndex("reservations_active_member_slot_unique")
      .on(table.memberId, table.slotId)
      .where(sql`status IN ('REQUESTED', 'CONFIRMED')`),
    uniqueIndex("reservations_confirmed_slot_unique")
      .on(table.slotId)
      .where(sql`status = 'CONFIRMED'`),
    uniqueIndex("reservations_confirmed_member_time_unique")
      .on(table.memberId, table.slotStartAt)
      .where(sql`status = 'CONFIRMED'`),
  ],
);

export const bookingPayments = sqliteTable(
  "booking_payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull().references(() => bookingMembers.id),
    reservationId: integer("reservation_id").references(() => reservations.id),
    passId: integer("pass_id").references(() => memberPasses.id),
    amount: integer("amount").notNull(),
    method: text("method", { enum: ["CARD", "CASH"] }).notNull(),
    status: text("status", { enum: ["UNPAID", "PAID", "REFUNDED"] }).notNull().default("UNPAID"),
    paidAt: text("paid_at"),
    recordedBy: integer("recorded_by").notNull().references(() => staff.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("booking_payments_member_idx").on(table.memberId, table.createdAt)],
);

export const bookingFeedback = sqliteTable("booking_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull().references(() => bookingMembers.id),
  reservationId: integer("reservation_id").references(() => reservations.id),
  message: text("message").notNull(),
  status: text("status", { enum: ["REQUESTED", "ANSWERED", "CLOSED"] }).notNull().default("REQUESTED"),
  adminReply: text("admin_reply").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const practiceLogs = sqliteTable(
  "practice_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull().references(() => bookingMembers.id),
    reservationId: integer("reservation_id").notNull().references(() => reservations.id),
    stationType: text("station_type").notNull(),
    recipeData: text("recipe_data").notNull().default(""),
    sensoryNote: text("sensory_note").notNull().default(""),
    reflection: text("reflection").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("practice_logs_member_reservation_unique").on(table.memberId, table.reservationId)],
);

export const internalEvaluations = sqliteTable("internal_evaluations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberId: integer("member_id").notNull().references(() => bookingMembers.id),
  evaluatorId: integer("evaluator_id").references(() => staff.id),
  status: text("status", { enum: ["PREPARING", "REQUESTED", "COMPLETED"] }).notNull().default("REQUESTED"),
  technicalScore: integer("technical_score"),
  consistencyScore: integer("consistency_score"),
  sensoryScore: integer("sensory_score"),
  ruleScore: integer("rule_score"),
  ethicsStatus: text("ethics_status").notNull().default("PENDING"),
  result: text("result").notNull().default("PENDING"),
  note: text("note").notNull().default(""),
  requestedAt: text("requested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  evaluatedAt: text("evaluated_at"),
});

export const opportunityCandidates = sqliteTable(
  "opportunity_candidates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull().references(() => bookingMembers.id),
    type: text("type", { enum: ["MONTHLY_COFFEE_CONTENT", "KCL_JUDGE"] }).notNull(),
    status: text("status", { enum: ["TRAINING", "ELIGIBLE", "UNDER_REVIEW", "SELECTED", "NOT_SELECTED", "SUSPENDED"] }).notNull().default("TRAINING"),
    conflictNote: text("conflict_note").notNull().default(""),
    finalDecisionBy: integer("final_decision_by").references(() => staff.id),
    decidedAt: text("decided_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("opportunity_candidates_member_type_unique").on(table.memberId, table.type)],
);

export const publicRequestLimits = sqliteTable("public_request_limits", {
  identifierHash: text("identifier_hash").primaryKey(),
  windowStart: text("window_start").notNull(),
  requestCount: integer("request_count").notNull().default(0),
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
  sortOrder: integer("sort_order"),
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

export const courseOpenings = sqliteTable(
  "course_openings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publicId: text("public_id").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    courseMonth: text("course_month").notNull(),
    openingMinimum: integer("opening_minimum").notNull(),
    capacity: integer("capacity"),
    recruitmentStartDate: text("recruitment_start_date"),
    recruitmentEndDate: text("recruitment_end_date"),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
    statusOverride: text("status_override", { enum: ["AUTO", "CLOSED"] }).notNull().default("AUTO"),
    displayOrder: integer("display_order").notNull().default(0),
    durationHours: integer("duration_hours").notNull().default(0),
    tuition: integer("tuition").notNull().default(0),
    feeNote: text("fee_note").notNull().default(""),
    createdBy: integer("created_by").references(() => staff.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_course_openings_public_month").on(
      table.courseMonth,
      table.isPublic,
      table.displayOrder,
    ),
  ],
);

export const courseApplicants = sqliteTable(
  "course_applicants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    courseId: integer("course_id").notNull().references(() => courseOpenings.id, { onDelete: "cascade" }),
    applicantName: text("applicant_name").notNull(),
    phoneHash: text("phone_hash").notNull(),
    phoneLast4: text("phone_last4").notNull(),
    status: text("status", {
      enum: ["WAITING", "CONFIRMED", "CANCELLED", "REJECTED", "REFUNDED"],
    }).notNull().default("WAITING"),
    notes: text("notes").notNull().default(""),
    createdBy: integer("created_by").notNull().references(() => staff.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_course_applicants_course_phone").on(table.courseId, table.phoneHash),
    index("idx_course_applicants_course_status").on(table.courseId, table.status),
  ],
);

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
