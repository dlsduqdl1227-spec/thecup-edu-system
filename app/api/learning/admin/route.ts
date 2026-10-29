import { AuthError, requireUser } from "../../../../lib/auth";
import { bookingText, nonNegativeBookingInteger, optionalBookingText, positiveBookingInteger } from "../../../../lib/booking";
import { decryptContact } from "../../../../lib/consultation-contact";
import { audit, ensureDatabase, getD1 } from "../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../lib/http";
import { getLearningCourse } from "../../../../lib/learning-catalog";
import { memberEnrollments } from "../../../../lib/learning";
import { purgeExpiredConsultations } from "../../../../lib/learning-schema";
import { decideReservation } from "../../booking/admin/route";

const privateHeaders = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const actor = await requireUser(request, ["admin", "instructor"]);
    const admin = actor.role === "admin";
    const db = getD1();
    await purgeExpiredConsultations(db);
    const query = new URL(request.url).searchParams;
    const page = Math.floor(Math.max(1, Math.min(10000, Number(query.get("page")) || 1)));
    const search = optionalBookingText(query.get("q"), 80);
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    const scope = `m.deleted_at IS NULL AND (? = 1 OR EXISTS(SELECT 1 FROM course_enrollments e WHERE e.member_id = m.id AND e.instructor_id = ?) OR EXISTS(SELECT 1 FROM learning_consultations c WHERE c.member_id = m.id AND c.instructor_id = ?))
      AND (m.name LIKE ? ESCAPE '\\' OR m.phone_last4 LIKE ? ESCAPE '\\')`;
    const args = [admin ? 1 : 0, actor.id, actor.id, pattern, pattern];
    const members = await db.prepare(`SELECT m.id, m.name, m.phone_last4 AS phoneLast4, m.approval_status AS approvalStatus,
      EXISTS(SELECT 1 FROM learning_consultations c WHERE c.member_id = m.id AND c.status = 'NEW') AS needsConsultation
      FROM booking_members m WHERE ${scope} ORDER BY needsConsultation DESC, m.id DESC LIMIT 25 OFFSET ?`).bind(...args, (page - 1) * 25).all();
    const total = await db.prepare(`SELECT COUNT(*) AS count FROM booking_members m WHERE ${scope}`).bind(...args).first<{ count: number }>();
    const instructors = admin ? (await db.prepare("SELECT id, name FROM staff WHERE active = 1 AND deleted_at IS NULL AND role IN ('admin','instructor') ORDER BY name").all()).results : [{ id: actor.id, name: actor.name }];
    const requestRows = await db.prepare(`SELECT r.id, r.member_id AS memberId, m.name AS memberName, e.course_name AS courseName,
      r.status, r.user_memo AS userMemo, r.admin_memo AS adminMemo, r.rejection_reason AS rejectionReason,
      sl.start_at AS startAt, sl.end_at AS endAt, t.name AS instructorName
      FROM reservations r JOIN course_enrollments e ON e.id = r.enrollment_id JOIN staff t ON t.id = e.instructor_id
      JOIN booking_slots sl ON sl.id = r.slot_id JOIN booking_members m ON m.id = r.member_id
      WHERE m.deleted_at IS NULL AND (? = 1 OR e.instructor_id = ?) AND r.status IN ('REQUESTED','CONFIRMED')
      ORDER BY CASE r.status WHEN 'REQUESTED' THEN 0 ELSE 1 END, sl.start_at LIMIT 25 OFFSET ?`).bind(admin ? 1 : 0, actor.id, (page - 1) * 25).all();
    const requestTotal = await db.prepare(`SELECT COUNT(*) AS count FROM reservations r JOIN course_enrollments e ON e.id = r.enrollment_id
      JOIN booking_members m ON m.id = r.member_id WHERE m.deleted_at IS NULL AND (? = 1 OR e.instructor_id = ?) AND r.status IN ('REQUESTED','CONFIRMED')`).bind(admin ? 1 : 0, actor.id).first<{ count: number }>();
    let detail = null;
    if (query.has("memberId")) {
      const memberId = positiveBookingInteger(query.get("memberId"), "수강생");
      const allowed = await db.prepare(`SELECT m.id, m.name, m.approval_status AS approvalStatus FROM booking_members m WHERE m.id = ? AND ${scope}`).bind(memberId, ...args.slice(0, 3), "%", "%").first();
      if (!allowed) throw new AuthError("이 수강생의 상담 정보를 볼 수 없습니다.", 403);
      const rows = await db.prepare(`SELECT id, name, phone_encrypted AS encrypted, age_range AS ageRange, discovery,
        interests, contact_channel AS contactChannel, message, status, instructor_id AS instructorId,
        staff_note AS staffNote, created_at AS createdAt FROM learning_consultations WHERE member_id = ?
        AND (? = 1 OR instructor_id = ? OR EXISTS(SELECT 1 FROM course_enrollments e WHERE e.member_id = ? AND e.instructor_id = ?))
        ORDER BY id DESC LIMIT 10`).bind(memberId, admin ? 1 : 0, actor.id, memberId, actor.id).all<{ encrypted: string; [key: string]: unknown }>();
      const consultations = await Promise.all(rows.results.map(async ({ encrypted, ...row }) => ({ ...row, phone: await decryptContact(encrypted) })));
      const learning = await memberEnrollments(memberId, admin ? null : actor.id);
      detail = { member: allowed, consultations, ...learning };
    }
    return Response.json({ isAdmin: admin, members: members.results, total: total?.count ?? 0, page, instructors, requests: requestRows.results, requestTotal: requestTotal?.count ?? 0, detail }, { headers: privateHeaders });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin", "instructor"]);
    const input = await request.json() as Record<string, unknown>;
    const db = getD1();
    if (input.action === "decideReservation") {
      const reservationId = positiveBookingInteger(input.reservationId, "예약");
      const row = await db.prepare(`SELECT e.instructor_id AS instructorId FROM reservations r JOIN course_enrollments e ON e.id = r.enrollment_id WHERE r.id = ?`).bind(reservationId).first<{ instructorId: number }>();
      if (!row || (actor.role !== "admin" && row.instructorId !== actor.id)) throw new AuthError("담당 수업만 처리할 수 있습니다.", 403);
      return await decideReservation(actor.id, input);
    }
    if (input.action === "consultation") {
      const id = positiveBookingInteger(input.id, "상담");
      const status = bookingText(input.status, "상담 상태", 20);
      if (!["NEW", "CONTACTED", "ENROLLED", "CLOSED"].includes(status)) throw new Error("상담 상태를 확인해 주세요.");
      const note = optionalBookingText(input.note, 1000);
      const instructor = input.instructorId ? positiveBookingInteger(input.instructorId, "담당 강사") : null;
      if (actor.role === "admin" && instructor && !await db.prepare("SELECT 1 FROM staff WHERE id = ? AND active = 1 AND deleted_at IS NULL AND role IN ('admin','instructor')").bind(instructor).first()) throw new Error("활성 강사를 선택해 주세요.");
      const result = await db.prepare(`UPDATE learning_consultations SET status = ?, staff_note = ?, instructor_id = CASE WHEN ? = 1 THEN ? ELSE instructor_id END, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND (? = 1 OR instructor_id = ?)`).bind(status, note, actor.role === "admin" ? 1 : 0, instructor, id, actor.role === "admin" ? 1 : 0, actor.id).run();
      if (!result.meta.changes) throw new AuthError("상담을 수정할 권한이 없습니다.", 403);
      await audit(actor.id, "learning_consultation_update", "learning_consultation", String(id), status);
      return Response.json({ ok: true }, { headers: privateHeaders });
    }
    if (actor.role !== "admin") throw new AuthError("수강 등록은 관리자만 가능합니다.", 403);
    if (input.action === "enroll") {
      const memberId = positiveBookingInteger(input.memberId, "수강생");
      const course = getLearningCourse(input.courseKey);
      const total = positiveBookingInteger(input.totalSessions, "수강 회차");
      const minutes = positiveBookingInteger(input.sessionMinutes, "수업 시간");
      const amount = nonNegativeBookingInteger(input.paidAmount, "결제 확인 금액");
      const instructorId = positiveBookingInteger(input.instructorId, "담당 강사");
      const requestKey = bookingText(input.requestKey, "등록 키", 80);
      const priceType = bookingText(input.priceType, "요금 구분", 30);
      if (input.paymentConfirmed !== true) throw new Error("결제 확인 후 수강 등록해 주세요.");
      if (course.id === "q-grader:course" && input.qOpeningConfirmed !== true) throw new Error("Q Grader는 6인 모집과 개강 일정을 확인한 뒤 등록해 주세요.");
      if (total > 100 || minutes < 30 || minutes > 480 || amount > 100000000 || !["SUBSCRIBER", "REGULAR", "PACKAGE", "CUSTOM"].includes(priceType)) throw new Error("회차·수업 시간·금액을 확인해 주세요.");
      if (!await db.prepare("SELECT 1 FROM staff WHERE id = ? AND active = 1 AND deleted_at IS NULL AND role IN ('admin','instructor')").bind(instructorId).first()) throw new Error("활성 담당 강사를 선택해 주세요.");
      if (!await db.prepare("SELECT 1 FROM booking_members WHERE id = ? AND deleted_at IS NULL").bind(memberId).first()) throw new Error("수강생을 찾을 수 없습니다.");
      const existing = await db.prepare("SELECT id, member_id AS memberId FROM course_enrollments WHERE request_key = ?").bind(requestKey).first<{ id: number; memberId: number }>();
      if (existing) {
        if (existing.memberId !== memberId) throw new AuthError("등록 키가 중복되었습니다.", 409);
        return Response.json({ ok: true, id: existing.id }, { headers: privateHeaders });
      }
      const results = await db.batch([
        db.prepare(`INSERT INTO course_enrollments(request_key, member_id, course_key, course_name, station_type, instructor_id, total_sessions, session_minutes, paid_amount, price_type, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(requestKey, memberId, course.id, course.name, course.station, instructorId, total, minutes, amount, priceType, actor.id),
        db.prepare(`UPDATE booking_members SET approval_status = 'APPROVED', consultation_status = 'COMPLETED', approved_by = ?, approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`).bind(actor.id, memberId),
        db.prepare(`UPDATE learning_consultations SET status = 'ENROLLED', instructor_id = COALESCE(instructor_id, ?), updated_at = CURRENT_TIMESTAMP WHERE member_id = ? AND status != 'CLOSED'`).bind(instructorId, memberId),
        db.prepare("INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, detail) VALUES (?, 'learning_enroll', 'booking_member', ?, ?)").bind(actor.id, String(memberId), `${course.name} · ${total}회`),
      ]);
      return Response.json({ ok: true, id: results[0].meta.last_row_id }, { status: 201, headers: privateHeaders });
    }
    if (input.action === "enrollmentStatus") {
      const id = positiveBookingInteger(input.id, "수강 과정");
      if (!["ACTIVE", "PAUSED"].includes(String(input.status))) throw new Error("수강 상태를 확인해 주세요.");
      const result = await db.prepare("UPDATE course_enrollments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(input.status, id).run();
      if (!result.meta.changes) throw new Error("과정을 찾을 수 없습니다.");
      await audit(actor.id, "learning_enrollment_status", "course_enrollment", String(id), String(input.status));
      return Response.json({ ok: true }, { headers: privateHeaders });
    }
    throw new Error("지원하지 않는 작업입니다.");
  } catch (error) { return jsonError(error); }
}
