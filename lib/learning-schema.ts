// Additive migration: existing students and reservations retain their original access.
export const learningSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS learning_members (member_id INTEGER PRIMARY KEY REFERENCES booking_members(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TRIGGER IF NOT EXISTS learning_new_member AFTER INSERT ON booking_members BEGIN
     INSERT OR IGNORE INTO learning_members(member_id) VALUES (NEW.id);
   END`,
  `CREATE TABLE IF NOT EXISTS learning_consultations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES booking_members(id),
    name TEXT NOT NULL, phone_encrypted TEXT NOT NULL,
    age_range TEXT NOT NULL, discovery TEXT NOT NULL, interests TEXT NOT NULL,
    contact_channel TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
    consent_version TEXT NOT NULL, consent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','CONTACTED','ENROLLED','CLOSED')),
    instructor_id INTEGER REFERENCES staff(id), staff_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS learning_consultations_status ON learning_consultations(status, instructor_id, id)`,
  `CREATE TABLE IF NOT EXISTS course_enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, request_key TEXT NOT NULL UNIQUE,
    member_id INTEGER NOT NULL REFERENCES booking_members(id), course_key TEXT NOT NULL, course_name TEXT NOT NULL,
    station_type TEXT NOT NULL, instructor_id INTEGER NOT NULL REFERENCES staff(id),
    total_sessions INTEGER NOT NULL CHECK(total_sessions BETWEEN 1 AND 100),
    session_minutes INTEGER NOT NULL DEFAULT 150 CHECK(session_minutes BETWEEN 30 AND 480),
    paid_amount INTEGER NOT NULL CHECK(paid_amount >= 0), price_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED')),
    paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by INTEGER NOT NULL REFERENCES staff(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS course_enrollments_member ON course_enrollments(member_id, status)`,
  `CREATE TRIGGER IF NOT EXISTS learning_enrollment_member_guard BEFORE INSERT ON course_enrollments BEGIN
    SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM booking_members WHERE id = NEW.member_id AND deleted_at IS NULL)
      THEN RAISE(ABORT, 'learning_unavailable') END;
  END`,
];

// SQL guards run inside the same D1 statement as writes, including simultaneous requests.
export const learningReservationGuards = [
  `CREATE INDEX IF NOT EXISTS reservations_enrollment ON reservations(enrollment_id, status)`,
  `CREATE TRIGGER IF NOT EXISTS learning_reservation_guard BEFORE INSERT ON reservations BEGIN
    SELECT CASE WHEN NEW.enrollment_id IS NULL AND EXISTS(SELECT 1 FROM learning_members WHERE member_id = NEW.member_id)
      THEN RAISE(ABORT, 'learning_enrollment_required') END;
    SELECT CASE WHEN NEW.enrollment_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM course_enrollments e JOIN staff teacher ON teacher.id = e.instructor_id
      JOIN booking_slots sl ON sl.id = NEW.slot_id JOIN stations st ON st.id = sl.station_id
      WHERE e.id = NEW.enrollment_id AND e.member_id = NEW.member_id AND e.status = 'ACTIVE'
        AND teacher.active = 1 AND teacher.deleted_at IS NULL AND teacher.role IN ('admin','instructor')
        AND st.type = e.station_type AND (julianday(sl.end_at)-julianday(sl.start_at))*1440 >= e.session_minutes - 0.01
        AND (SELECT COUNT(*) FROM reservations r WHERE r.enrollment_id = e.id AND r.status IN ('REQUESTED','CONFIRMED','COMPLETED','NO_SHOW')) < e.total_sessions
    ) THEN RAISE(ABORT, 'learning_unavailable') END;
    SELECT CASE WHEN NEW.enrollment_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM reservations r JOIN booking_slots occupied ON occupied.id = r.slot_id
      JOIN booking_slots wanted ON wanted.id = NEW.slot_id
      WHERE r.member_id = NEW.member_id AND r.status IN ('REQUESTED','CONFIRMED')
        AND occupied.start_at < wanted.end_at AND occupied.end_at > wanted.start_at
    ) THEN RAISE(ABORT, 'learning_member_overlap') END;
    SELECT CASE WHEN NEW.enrollment_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM reservations r JOIN course_enrollments other ON other.id = r.enrollment_id
      JOIN course_enrollments own ON own.id = NEW.enrollment_id
      JOIN booking_slots occupied ON occupied.id = r.slot_id JOIN booking_slots wanted ON wanted.id = NEW.slot_id
      WHERE r.status = 'CONFIRMED' AND other.instructor_id = own.instructor_id
        AND occupied.start_at < wanted.end_at AND occupied.end_at > wanted.start_at
    ) THEN RAISE(ABORT, 'learning_instructor_overlap') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS learning_confirmation_guard BEFORE UPDATE OF status ON reservations
   WHEN NEW.status = 'CONFIRMED' AND OLD.status != 'CONFIRMED' AND NEW.enrollment_id IS NOT NULL BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM course_enrollments e JOIN staff teacher ON teacher.id = e.instructor_id
      WHERE e.id = NEW.enrollment_id AND e.status = 'ACTIVE' AND teacher.active = 1 AND teacher.deleted_at IS NULL AND teacher.role IN ('admin','instructor'))
      THEN RAISE(ABORT, 'learning_unavailable') END;
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM reservations r JOIN course_enrollments other ON other.id = r.enrollment_id
      JOIN course_enrollments own ON own.id = NEW.enrollment_id
      JOIN booking_slots occupied ON occupied.id = r.slot_id JOIN booking_slots wanted ON wanted.id = NEW.slot_id
      WHERE r.id != NEW.id AND r.status = 'CONFIRMED' AND other.instructor_id = own.instructor_id
        AND occupied.start_at < wanted.end_at AND occupied.end_at > wanted.start_at
    ) THEN RAISE(ABORT, 'learning_instructor_overlap') END;
  END`,
];
export async function ensureLearningSchema(db: D1Database) {
  await db.batch(learningSchemaStatements.map(sql => db.prepare(sql)));
  const columns = await db.prepare("PRAGMA table_info(reservations)").all<{ name: string }>();
  if (!columns.results.some(column => column.name === "enrollment_id")) {
    try { await db.prepare("ALTER TABLE reservations ADD COLUMN enrollment_id INTEGER REFERENCES course_enrollments(id)").run(); }
    catch (error) {
      // Another Worker isolate can finish this additive migration concurrently.
      const current = await db.prepare("PRAGMA table_info(reservations)").all<{ name: string }>();
      if (!current.results.some(column => column.name === "enrollment_id")) throw error;
    }
  }
  await db.batch(learningReservationGuards.map(sql => db.prepare(sql)));
}

export async function purgeExpiredConsultations(db: D1Database) {
  // New consultation records only. Never touches member, payment or reservation history.
  await db.prepare("DELETE FROM learning_consultations WHERE status = 'CLOSED' AND updated_at < datetime('now', '-1 year')").run();
}
