import { requireUser } from "../../../../../../lib/auth";
import { syncConfirmedApplicantToBookingMember } from "../../../../../../lib/booking-members";
import { applicantStatuses, type ApplicantStatus } from "../../../../../../lib/course-openings";
import { audit, ensureDatabase, getD1 } from "../../../../../../lib/db";
import { assertSameOrigin, jsonError, optionalText } from "../../../../../../lib/http";

function idsFromRequest(request: Request): { courseId: number; applicantId: number } {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const courseId = Number(parts.at(-3));
  const applicantId = Number(parts.at(-1));
  if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(applicantId) || applicantId <= 0) {
    throw new Error("신청자를 선택해 주세요.");
  }
  return { courseId, applicantId };
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin"]);
    const { courseId, applicantId } = idsFromRequest(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const status = String(payload.status ?? "") as ApplicantStatus;
    const notes = optionalText(payload.notes, 300);
    if (!(applicantStatuses as readonly string[]).includes(status)) throw new Error("신청 상태를 선택해 주세요.");
    const result = await getD1()
      .prepare(
        `UPDATE course_applicants
         SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND course_id = ?`,
      )
      .bind(status, notes, applicantId, courseId)
      .run();
    if (!result.meta.changes) return Response.json({ error: "신청자를 찾을 수 없습니다." }, { status: 404 });
    const bookingMember = status === "CONFIRMED"
      ? await syncConfirmedApplicantToBookingMember(actor.id, courseId, applicantId)
      : null;
    await audit(actor.id, "update_course_applicant", "course_applicant", String(applicantId), status);
    if (bookingMember) {
      await audit(actor.id, "auto_register_booking_member", "booking_member", String(bookingMember.id), bookingMember.name);
    }
    return Response.json({ ok: true, bookingMember });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin"]);
    const { courseId, applicantId } = idsFromRequest(request);
    const result = await getD1()
      .prepare("DELETE FROM course_applicants WHERE id = ? AND course_id = ?")
      .bind(applicantId, courseId)
      .run();
    if (!result.meta.changes) return Response.json({ error: "신청자를 찾을 수 없습니다." }, { status: 404 });
    await audit(actor.id, "delete_course_applicant", "course_applicant", String(applicantId));
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
