import { getD1 } from "./db";
export async function memberEnrollments(memberId: number, instructorId: number | null = null) {
  const db = getD1();
  const result = await db.prepare(`SELECT e.id, e.course_key AS courseKey, e.course_name AS courseName,
    e.station_type AS stationType, e.total_sessions AS totalSessions, e.session_minutes AS sessionMinutes,
    e.status, t.name AS instructorName, e.paid_amount AS paidAmount,
    SUM(CASE WHEN r.status IN ('REQUESTED','CONFIRMED','COMPLETED','NO_SHOW') THEN 1 ELSE 0 END) AS usedSessions,
    SUM(CASE WHEN r.status = 'REQUESTED' THEN 1 ELSE 0 END) AS pendingSessions,
    SUM(CASE WHEN r.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmedSessions,
    SUM(CASE WHEN r.status IN ('COMPLETED','NO_SHOW') THEN 1 ELSE 0 END) AS completedSessions
    FROM course_enrollments e JOIN staff t ON t.id = e.instructor_id LEFT JOIN reservations r ON r.enrollment_id = e.id
    WHERE e.member_id = ? AND (? IS NULL OR e.instructor_id = ?) GROUP BY e.id ORDER BY e.id DESC`).bind(memberId, instructorId, instructorId).all();
  const mode = await db.prepare("SELECT 1 FROM learning_members WHERE member_id = ?").bind(memberId).first();
  return { enrollments: result.results, courseBookingRequired: Boolean(mode) };
}
