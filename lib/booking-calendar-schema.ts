// External closures are independent of manual booking_slots.status. Replacing a
// successful FLOW snapshot never reopens a manually blocked slot.
export const flowBlockedSQL = (slot = "sl") => `EXISTS (
  SELECT 1 FROM booking_calendar_sync c, json_each(c.events_json) e
  WHERE c.source = 'FLOW' AND COALESCE(json_extract(e.value,'$.timingPending'),0)=0 AND (
    (json_type(e.value,'$.blockStartAt')='text' AND json_type(e.value,'$.blockEndAt')='text'
      AND julianday(json_extract(e.value,'$.blockStartAt')) < julianday(${slot}.end_at)
      AND julianday(json_extract(e.value,'$.blockEndAt')) > julianday(${slot}.start_at))
    OR (json_type(e.value,'$.blockStartAt') IS NULL AND json_extract(e.value,'$.startDate') <= substr(${slot}.start_at,1,10)
      AND json_extract(e.value,'$.endDate') >= substr(${slot}.start_at,1,10))))`;
export const operatingValidSQL = (slot = "sl") => `(
  substr(${slot}.start_at,1,4) IN ('2026','2027')
  AND strftime('%w',substr(${slot}.start_at,1,10)) NOT IN ('0','6')
  AND NOT EXISTS(SELECT 1 FROM booking_calendar_holidays h WHERE h.date = substr(${slot}.start_at,1,10))
  AND substr(${slot}.start_at,1,10) = substr(${slot}.end_at,1,10)
  AND substr(${slot}.start_at,12,5) >= '09:00' AND substr(${slot}.end_at,12,5) <= '18:00'
  AND (substr(${slot}.end_at,12,5) <= '11:30' OR substr(${slot}.start_at,12,5) >= '12:30'))`;
export const calendarClosedSQL = (slot = "sl") => `(${flowBlockedSQL(slot)} OR (
  EXISTS(SELECT 1 FROM booking_calendar_automation WHERE id=1 AND enabled=1) AND NOT ${operatingValidSQL(slot)}))`;
export const calendarSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS booking_calendar_sync (
    source TEXT PRIMARY KEY, events_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(events_json)),
    source_revision INTEGER NOT NULL DEFAULT 0, synced_at TEXT, attempted_at TEXT, last_error TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS booking_calendar_holidays (date TEXT PRIMARY KEY, name TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS booking_calendar_automation (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0, generated_at TEXT)`,
  `INSERT OR IGNORE INTO booking_calendar_automation(id,enabled) VALUES (1,0)`,
  `CREATE TRIGGER IF NOT EXISTS booking_calendar_insert_time_guard BEFORE INSERT ON reservations
   WHEN NEW.status IN ('REQUESTED','CONFIRMED') AND EXISTS (
     SELECT 1 FROM booking_slots sl WHERE sl.id=NEW.slot_id AND ${calendarClosedSQL()})
   BEGIN SELECT RAISE(ABORT, 'booking_calendar_closed'); END`,
  `CREATE TRIGGER IF NOT EXISTS booking_calendar_update_time_guard BEFORE UPDATE OF status,slot_id ON reservations
   WHEN NEW.status IN ('REQUESTED','CONFIRMED') AND (NEW.status<>OLD.status OR NEW.slot_id<>OLD.slot_id) AND EXISTS (
     SELECT 1 FROM booking_slots sl WHERE sl.id=NEW.slot_id AND ${calendarClosedSQL()})
   BEGIN SELECT RAISE(ABORT, 'booking_calendar_closed'); END`,
  `DROP TRIGGER IF EXISTS booking_calendar_insert_guard`,
  `DROP TRIGGER IF EXISTS booking_calendar_update_guard`,
];
