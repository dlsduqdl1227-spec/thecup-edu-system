import { getD1 } from "./db";

type ConfirmedApplicantSource = {
  applicantName: string;
  phoneHash: string;
  phoneLast4: string;
  courseName: string;
  category: string;
};

export type SyncedBookingMember = {
  id: number;
  loginId: string;
};

/**
 * A confirmed course applicant becomes an approved station member immediately.
 * The phone hash is shared by both private tables, so an existing consultation
 * record is upgraded instead of creating a duplicate person.
 */
export async function syncConfirmedApplicantToBookingMember(
  actorId: number,
  courseId: number,
  applicantId: number,
): Promise<SyncedBookingMember> {
  const db = getD1();
  const source = await db
    .prepare(
      `SELECT a.applicant_name AS applicantName, a.phone_hash AS phoneHash,
              a.phone_last4 AS phoneLast4, c.name AS courseName, c.category
       FROM course_applicants a
       JOIN course_openings c ON c.id = a.course_id
       WHERE a.id = ? AND a.course_id = ? AND a.status = 'CONFIRMED'`,
    )
    .bind(applicantId, courseId)
    .first<ConfirmedApplicantSource>();
  if (!source) throw new Error("확정 수강생 정보를 찾을 수 없습니다.");

  const automaticMemo = `${source.courseName} 과정 수강 확정 자동 등록`;
  await db
    .prepare(
      `INSERT INTO booking_members
        (name, phone_hash, phone_last4, approval_status, consultation_status,
         desired_station_type, consultation_memo, admin_memo, approved_by, approved_at)
       VALUES (?, ?, ?, 'APPROVED', 'COMPLETED', ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(phone_hash) DO UPDATE SET
         name = excluded.name,
         phone_last4 = excluded.phone_last4,
         approval_status = 'APPROVED',
         consultation_status = 'COMPLETED',
         desired_station_type = CASE
           WHEN booking_members.desired_station_type = '' THEN excluded.desired_station_type
           ELSE booking_members.desired_station_type
         END,
         admin_memo = CASE
           WHEN booking_members.admin_memo = '' THEN excluded.admin_memo
           ELSE booking_members.admin_memo
         END,
         approved_by = excluded.approved_by,
         approved_at = CASE
           WHEN booking_members.approval_status = 'APPROVED' AND booking_members.approved_at IS NOT NULL
             THEN booking_members.approved_at
           ELSE CURRENT_TIMESTAMP
         END,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      source.applicantName,
      source.phoneHash,
      source.phoneLast4,
      source.category,
      automaticMemo,
      automaticMemo,
      actorId,
    )
    .run();

  const member = await db
    .prepare("SELECT id, login_id AS loginId FROM booking_members WHERE phone_hash = ?")
    .bind(source.phoneHash)
    .first<{ id: number; loginId: string | null }>();
  if (!member) throw new Error("수강생 DB 등록을 완료하지 못했습니다.");

  const loginId = member.loginId || `CUP${String(member.id).padStart(5, "0")}`;
  if (!member.loginId) {
    await db
      .prepare("UPDATE booking_members SET login_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(loginId, member.id)
      .run();
  }
  return { id: member.id, loginId };
}
