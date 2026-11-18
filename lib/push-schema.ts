const active = "EXISTS(SELECT 1 FROM edu_push_control WHERE id=1 AND enabled=1)";
export const pushSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS edu_push_control (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0, activated_at TEXT)`,
  `INSERT OR IGNORE INTO edu_push_control(id,enabled) VALUES (1,0)`,
  `CREATE TABLE IF NOT EXISTS edu_push_subscriptions (
    id TEXT PRIMARY KEY, audience TEXT NOT NULL CHECK(audience IN ('STAFF','MEMBER')), actor_id INTEGER NOT NULL,
    session_hash TEXT NOT NULL, security_version TEXT NOT NULL, endpoint_hash TEXT NOT NULL UNIQUE,
    endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1, consultations INTEGER NOT NULL DEFAULT 1, bookings INTEGER NOT NULL DEFAULT 1,
    consultations_since TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z', bookings_since TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
    last_status INTEGER NOT NULL DEFAULT 0, last_test_at TEXT, last_test_id TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS edu_push_devices_actor ON edu_push_subscriptions(audience,actor_id,enabled)`,
  `CREATE TABLE IF NOT EXISTS edu_push_events (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), kind TEXT NOT NULL,
    entity_id INTEGER NOT NULL DEFAULT 0, member_id INTEGER, staff_id INTEGER, test_device_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`,
  `CREATE INDEX IF NOT EXISTS edu_push_events_created ON edu_push_events(created_at,id)`,
  `CREATE TABLE IF NOT EXISTS edu_push_deliveries (
    event_id TEXT NOT NULL REFERENCES edu_push_events(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL REFERENCES edu_push_subscriptions(id) ON DELETE CASCADE,
    session_hash TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'PENDING'
      CHECK(state IN ('PENDING','SENDING','ACCEPTED','DISPLAYED','FAILED','SKIPPED')),
    attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0,
    provider_status INTEGER NOT NULL DEFAULT 0, displayed_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY(event_id,subscription_id))`,
  `CREATE TRIGGER IF NOT EXISTS edu_push_device_insert_limit BEFORE INSERT ON edu_push_subscriptions
   WHEN NEW.enabled=1 AND NOT EXISTS(SELECT 1 FROM edu_push_subscriptions WHERE endpoint_hash=NEW.endpoint_hash)
     AND (SELECT COUNT(*) FROM edu_push_subscriptions WHERE audience=NEW.audience AND actor_id=NEW.actor_id AND enabled=1)>=10
   BEGIN SELECT RAISE(ABORT,'edu_push_device_limit'); END`,
  `CREATE TRIGGER IF NOT EXISTS edu_push_device_update_limit BEFORE UPDATE ON edu_push_subscriptions
   WHEN NEW.enabled=1 AND (NEW.actor_id<>OLD.actor_id OR NEW.audience<>OLD.audience OR OLD.enabled=0)
     AND (SELECT COUNT(*) FROM edu_push_subscriptions WHERE audience=NEW.audience AND actor_id=NEW.actor_id AND enabled=1 AND id<>OLD.id)>=10
   BEGIN SELECT RAISE(ABORT,'edu_push_device_limit'); END`,
  `CREATE TRIGGER IF NOT EXISTS edu_push_consultation_new AFTER INSERT ON learning_consultations
   WHEN ${active} AND NEW.deleted_at IS NULL AND NEW.status='NEW'
   BEGIN INSERT INTO edu_push_events(kind,entity_id,member_id) VALUES ('CONSULTATION_NEW',NEW.id,NEW.member_id); END`,
  `CREATE TRIGGER IF NOT EXISTS edu_push_consultation_assigned AFTER UPDATE OF instructor_id ON learning_consultations
   WHEN ${active} AND NEW.deleted_at IS NULL AND NEW.instructor_id IS NOT NULL AND NEW.instructor_id IS NOT OLD.instructor_id
   BEGIN INSERT INTO edu_push_events(kind,entity_id,member_id,staff_id) VALUES ('CONSULTATION_ASSIGNED',NEW.id,NEW.member_id,NEW.instructor_id); END`,
  `CREATE TRIGGER IF NOT EXISTS edu_push_reservation_new AFTER INSERT ON reservations
   WHEN ${active} AND NEW.status='REQUESTED'
   BEGIN INSERT INTO edu_push_events(kind,entity_id,member_id) VALUES ('RESERVATION_REQUESTED',NEW.id,NEW.member_id); END`,
  `CREATE TRIGGER IF NOT EXISTS edu_push_reservation_changed AFTER UPDATE OF status ON reservations
   WHEN ${active} AND NEW.status<>OLD.status AND NEW.status IN ('CONFIRMED','REJECTED','CANCELLED')
   BEGIN INSERT INTO edu_push_events(kind,entity_id,member_id) VALUES ('RESERVATION_'||NEW.status,NEW.id,NEW.member_id); END`,
  `CREATE TRIGGER IF NOT EXISTS edu_push_member_approved AFTER UPDATE OF approval_status ON booking_members
   WHEN ${active} AND NEW.deleted_at IS NULL AND NEW.approval_status='APPROVED' AND OLD.approval_status<>'APPROVED'
   BEGIN INSERT INTO edu_push_events(kind,entity_id,member_id) VALUES ('MEMBER_APPROVED',NEW.id,NEW.id); END`,
];
