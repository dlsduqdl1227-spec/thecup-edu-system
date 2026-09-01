import { requireUser } from "../../../../lib/auth";
import { parseCoursePayload } from "../../../../lib/course-admin";
import { audit, ensureDatabase, getD1 } from "../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../lib/http";

function courseIdFromRequest(request: Request): number {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const id = Number(parts.at(-1));
  if (!Number.isInteger(id) || id <= 0) throw new Error("과정을 선택해 주세요.");
  return id;
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin"]);
    const id = courseIdFromRequest(request);
    const payload = parseCoursePayload((await request.json()) as Record<string, unknown>);
    const result = await getD1()
      .prepare(
        `UPDATE course_openings
         SET name = ?, category = ?, course_month = ?, opening_minimum = ?, capacity = ?,
             recruitment_start_date = ?, recruitment_end_date = ?, is_public = ?,
             status_override = ?, display_order = ?, duration_hours = ?, tuition = ?,
             fee_note = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        payload.name,
        payload.category,
        payload.courseMonth,
        payload.openingMinimum,
        payload.capacity,
        payload.recruitmentStartDate,
        payload.recruitmentEndDate,
        payload.isPublic,
        payload.statusOverride,
        payload.displayOrder,
        payload.durationHours,
        payload.tuition,
        payload.feeNote,
        id,
      )
      .run();
    if (!result.meta.changes) return Response.json({ error: "과정을 찾을 수 없습니다." }, { status: 404 });
    await audit(actor.id, "update_course_opening", "course_opening", String(id), `${payload.courseMonth} · ${payload.name}`);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin"]);
    const id = courseIdFromRequest(request);
    const db = getD1();
    const course = await db.prepare("SELECT name FROM course_openings WHERE id = ?").bind(id).first<{ name: string }>();
    if (!course) return Response.json({ error: "과정을 찾을 수 없습니다." }, { status: 404 });
    await db.batch([
      db.prepare("DELETE FROM course_applicants WHERE course_id = ?").bind(id),
      db.prepare("DELETE FROM course_openings WHERE id = ?").bind(id),
    ]);
    await audit(actor.id, "delete_course_opening", "course_opening", String(id), course.name);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
