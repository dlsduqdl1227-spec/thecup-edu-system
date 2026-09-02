export const bookingSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS booking_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login_id TEXT,
    name TEXT NOT NULL,
    phone_hash TEXT NOT NULL UNIQUE,
    phone_last4 TEXT NOT NULL,
    approval_status TEXT NOT NULL DEFAULT 'PENDING'
      CHECK(approval_status IN ('PENDING','APPROVED','REVOKED')),
    consultation_status TEXT NOT NULL DEFAULT 'REQUESTED'
      CHECK(consultation_status IN ('REQUESTED','COMPLETED')),
    desired_station_type TEXT NOT NULL DEFAULT '',
    consultation_memo TEXT NOT NULL DEFAULT '',
    admin_memo TEXT NOT NULL DEFAULT '',
    approved_by INTEGER REFERENCES staff(id),
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS member_sessions (
    token_hash TEXT PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES booking_members(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    name TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS booking_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id INTEGER NOT NULL REFERENCES stations(id),
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','BLOCKED')),
    block_reason TEXT NOT NULL DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES staff(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS member_passes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES booking_members(id),
    type TEXT NOT NULL CHECK(type IN ('DAILY','MONTHLY')),
    valid_month TEXT NOT NULL,
    price INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','EXPIRED','CANCELLED')),
    max_active_bookings INTEGER,
    created_by INTEGER NOT NULL REFERENCES staff(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES booking_members(id),
    slot_id INTEGER NOT NULL REFERENCES booking_slots(id),
    pass_id INTEGER NOT NULL REFERENCES member_passes(id),
    slot_start_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'REQUESTED'
      CHECK(status IN ('REQUESTED','CONFIRMED','COMPLETED','CANCELLED','REJECTED','NO_SHOW')),
    purpose TEXT NOT NULL,
    material_plan TEXT NOT NULL,
    open_to_peer_practice INTEGER NOT NULL DEFAULT 0,
    user_memo TEXT NOT NULL DEFAULT '',
    admin_memo TEXT NOT NULL DEFAULT '',
    rejection_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TEXT,
    cancelled_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS booking_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES booking_members(id),
    reservation_id INTEGER REFERENCES reservations(id),
    pass_id INTEGER REFERENCES member_passes(id),
    amount INTEGER NOT NULL,
    method TEXT NOT NULL CHECK(method IN ('CARD','CASH')),
    status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(status IN ('UNPAID','PAID','REFUNDED')),
    paid_at TEXT,
    recorded_by INTEGER NOT NULL REFERENCES staff(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS booking_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES booking_members(id),
    reservation_id INTEGER REFERENCES reservations(id),
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','ANSWERED','CLOSED')),
    admin_reply TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS practice_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES booking_members(id),
    reservation_id INTEGER NOT NULL REFERENCES reservations(id),
    station_type TEXT NOT NULL,
    recipe_data TEXT NOT NULL DEFAULT '',
    sensory_note TEXT NOT NULL DEFAULT '',
    reflection TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS internal_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES booking_members(id),
    evaluator_id INTEGER REFERENCES staff(id),
    status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('PREPARING','REQUESTED','COMPLETED')),
    technical_score INTEGER,
    consistency_score INTEGER,
    sensory_score INTEGER,
    rule_score INTEGER,
    ethics_status TEXT NOT NULL DEFAULT 'PENDING',
    result TEXT NOT NULL DEFAULT 'PENDING',
    note TEXT NOT NULL DEFAULT '',
    requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    evaluated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS opportunity_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES booking_members(id),
    type TEXT NOT NULL CHECK(type IN ('MONTHLY_COFFEE_CONTENT','KCL_JUDGE')),
    status TEXT NOT NULL DEFAULT 'TRAINING'
      CHECK(status IN ('TRAINING','ELIGIBLE','UNDER_REVIEW','SELECTED','NOT_SELECTED','SUSPENDED')),
    conflict_note TEXT NOT NULL DEFAULT '',
    final_decision_by INTEGER REFERENCES staff(id),
    decided_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS public_request_limits (
    identifier_hash TEXT PRIMARY KEY,
    window_start TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0
  )`,
  "CREATE INDEX IF NOT EXISTS member_sessions_member_idx ON member_sessions(member_id)",
  "CREATE INDEX IF NOT EXISTS booking_slots_start_status_idx ON booking_slots(start_at, status)",
  "CREATE UNIQUE INDEX IF NOT EXISTS booking_slots_station_start_unique ON booking_slots(station_id, start_at)",
  "CREATE INDEX IF NOT EXISTS member_passes_member_month_idx ON member_passes(member_id, valid_month, status)",
  "CREATE INDEX IF NOT EXISTS reservations_member_created_idx ON reservations(member_id, created_at)",
  "CREATE INDEX IF NOT EXISTS reservations_slot_status_idx ON reservations(slot_id, status)",
  `CREATE UNIQUE INDEX IF NOT EXISTS reservations_active_member_slot_unique
   ON reservations(member_id, slot_id) WHERE status IN ('REQUESTED','CONFIRMED')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS reservations_confirmed_slot_unique
   ON reservations(slot_id) WHERE status = 'CONFIRMED'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS reservations_confirmed_member_time_unique
   ON reservations(member_id, slot_start_at) WHERE status = 'CONFIRMED'`,
  "CREATE INDEX IF NOT EXISTS booking_payments_member_idx ON booking_payments(member_id, created_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS practice_logs_member_reservation_unique ON practice_logs(member_id, reservation_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS opportunity_candidates_member_type_unique ON opportunity_candidates(member_id, type)",
];

export const bookingSeedStatements = [
  `INSERT OR IGNORE INTO app_settings (key, value) VALUES ('booking_daily_price', '50000')`,
  `INSERT OR IGNORE INTO app_settings (key, value) VALUES ('booking_monthly_price', '500000')`,
  `INSERT OR IGNORE INTO app_settings (key, value) VALUES ('booking_cancel_hours', '24')`,
  `INSERT OR IGNORE INTO app_settings (key, value) VALUES ('booking_max_active_bookings', '')`,
  `INSERT OR IGNORE INTO app_settings (key, value) VALUES ('booking_kakao_chat_url', '')`,
  `INSERT INTO stations (type, name, active, display_order)
   SELECT 'ESPRESSO', '에스프레소 스테이션', 1, 10
   WHERE NOT EXISTS (SELECT 1 FROM stations WHERE type = 'ESPRESSO')`,
  `INSERT INTO stations (type, name, active, display_order)
   SELECT 'BREWING', '브루잉 스테이션', 1, 20
   WHERE NOT EXISTS (SELECT 1 FROM stations WHERE type = 'BREWING')`,
  `INSERT INTO stations (type, name, active, display_order)
   SELECT 'ROASTING', '로스팅 스테이션', 1, 30
   WHERE NOT EXISTS (SELECT 1 FROM stations WHERE type = 'ROASTING')`,
];
