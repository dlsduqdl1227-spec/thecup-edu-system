import { normalizePhone, phoneHash, requireUser } from "../../../../../lib/auth";
import { applicantStatuses, type ApplicantStatus } from "../../../../../lib/course-openings";
import { audit, ensureDatabase, getD1 } from "../../../../../lib/db";
import { assertSameOrigin, jsonError, optionalText, textValue } from "../../../../../lib/http";

function courseIdFromRequest(request: Request): number {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const id = Number(parts.at(-2));
  if (!Number.isInteger(id) || id <= 0) throw new Error("과정을 선택해 주세요.");
  return id;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin"]);
    const courseId = courseIdFromRequest(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const applicantName = textValue(payload.applicantName, "신청자 이름", 40).replace(/\s+/g, " ");
    const phone = normalizePhone(String(payload.phone ?? ""));
    const status = String(payload.status ?? "WAITING") as ApplicantStatus;
    const notes = optionalText(payload.notes, 300);
    if (!(applicantStatuses as readonly string[]).includes(status)) throw new Error("신청 상태를 선택해 주세요.");
    const db = getD1();
    const course = await db.prepare("SELECT name FROM course_openings WHERE id = ?").bind(courseId).first<{ name: string }>();
    if (!course) return Response.json({ error: "과정을 찾을 수 없습니다." }, { status: 404 });
    const result = await db
      .prepare(
        `INSERT INTO course_applicants
          (course_id, applicant_name, phone_hash, phone_last4, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(courseId, applicantName, await phoneHash(phone), phone.slice(-4), status, notes, actor.id)
      .run();
    const id = Number(result.meta.last_row_id);
    await audit(actor.id, "create_course_applicant", "course_applicant", String(id), `${course.name} · ${status}`);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/UNIQUE|idx_course_applicants_course_phone/i.test(message)) {
      return Response.json({ error: "이 과정에 이미 등록된 연락처입니다." }, { status: 409 });
    }
    return jsonError(error);
  }
}
