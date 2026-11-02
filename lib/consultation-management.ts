import { AuthError, normalizePhone } from "./auth";
import { bookingText, optionalBookingText, positiveBookingInteger } from "./booking";
import { encryptContact } from "./consultation-contact";
import { ageRanges, contactChannels, discoveryChannels, interestOptions } from "./learning-catalog";

export const consultationStatuses = ["NEW", "CONTACTED", "ENROLLED", "CLOSED"] as const;
export const consultationScope = `m.deleted_at IS NULL AND (? = 1 OR c.instructor_id = ? OR EXISTS(
  SELECT 1 FROM course_enrollments e WHERE e.member_id = c.member_id AND e.instructor_id = ?))`;
export const learningPrivateHeaders = { "Cache-Control": "private, no-store", "Vary": "Cookie" };

// Writes never modify login identities, approvals, enrollments or reservations.
export async function changeConsultation(db: D1Database, actor: { id: number; role: string }, input: Record<string, unknown>, remove = false) {
  const id = positiveBookingInteger(input.id, "상담");
  const revision = positiveBookingInteger(input.revision, "상담 버전");
  const row = await db.prepare(`SELECT c.instructor_id AS instructorId, c.deleted_at AS deletedAt
    FROM learning_consultations c JOIN booking_members m ON m.id = c.member_id
    WHERE c.id = ? AND m.deleted_at IS NULL`).bind(id).first<{ instructorId: number | null; deletedAt: string | null }>();
  if (!row || (actor.role !== "admin" && row.instructorId !== actor.id)) throw new AuthError("담당 상담만 수정할 수 있습니다.", 403);
  const restore = input.action === "restore";
  if ((remove || restore) && actor.role !== "admin") throw new AuthError("상담 삭제·복구는 관리자만 할 수 있습니다.", 403);
  let statement: D1PreparedStatement;
  let action: string;
  if (remove || restore) {
    action = restore ? "learning_consultation_restore" : "learning_consultation_delete";
    statement = db.prepare(`UPDATE learning_consultations SET deleted_at = ${restore ? "NULL" : "CURRENT_TIMESTAMP"},
      updated_at = CURRENT_TIMESTAMP, revision = revision + 1
      WHERE id = ? AND revision = ? AND deleted_at IS ${restore ? "NOT NULL" : "NULL"}`).bind(id, revision);
  } else {
    if (row.deletedAt) throw new AuthError("삭제된 상담은 복구 후 수정해 주세요.", 409);
    const name = bookingText(input.name, "성함", 40).replace(/\s+/g, " ");
    const phone = normalizePhone(String(input.phone ?? ""));
    const age = bookingText(input.ageRange, "연령대", 20);
    const discovery = bookingText(input.discovery, "유입 경로", 30);
    const contact = bookingText(input.contactChannel, "상담 방법", 20);
    const status = bookingText(input.status, "상담 상태", 20);
    if (!ageRanges.includes(age) || !discoveryChannels.includes(discovery) || !contactChannels.includes(contact) || !consultationStatuses.some(value => value === status)) throw new Error("상담 항목을 다시 선택해 주세요.");
    const interests = Array.isArray(input.interests) ? [...new Set(input.interests)] : [];
    if (!interests.length || interests.length > interestOptions.length || interests.some(id => !interestOptions.some(option => option.id === id))) throw new Error("관심 과정을 하나 이상 선택해 주세요.");
    const instructor = actor.role === "admin" ? (input.instructorId ? positiveBookingInteger(input.instructorId, "담당 강사") : null) : row.instructorId;
    if (instructor && !await db.prepare("SELECT 1 FROM staff WHERE id = ? AND active = 1 AND deleted_at IS NULL AND role IN ('admin','instructor')").bind(instructor).first()) throw new Error("활성 담당 강사를 선택해 주세요.");
    action = "learning_consultation_edit";
    statement = db.prepare(`UPDATE learning_consultations SET name = ?, phone_encrypted = ?, phone_last4 = ?, age_range = ?, discovery = ?,
      contact_channel = ?, interests = ?, message = ?, status = ?, instructor_id = ?, staff_note = ?, updated_at = CURRENT_TIMESTAMP, revision = revision + 1
      WHERE id = ? AND revision = ? AND deleted_at IS NULL AND (? = 1 OR instructor_id = ?)`)
      .bind(name, await encryptContact(phone), phone.slice(-4), age, discovery, contact, JSON.stringify(interests), optionalBookingText(input.message, 1000),
        status, instructor, optionalBookingText(input.staffNote, 1000), id, revision, actor.role === "admin" ? 1 : 0, actor.id);
  }
  // The audit and update succeed together; stale forms cannot overwrite newer work.
  const results = await db.batch([statement, db.prepare(`INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, detail)
    SELECT ?, ?, 'learning_consultation', ?, '' WHERE changes() > 0`).bind(actor.id, action, String(id))]);
  if (!results[0].meta.changes) throw new AuthError("다른 작업자가 변경한 상담입니다. 입력 내용을 확인한 뒤 최신 상담을 다시 열어 주세요.", 409);
}
