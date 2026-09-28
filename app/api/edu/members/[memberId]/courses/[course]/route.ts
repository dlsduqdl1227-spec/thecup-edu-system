import { AuthError, requireUser } from "../../../../../../../lib/auth";
import { getD1 } from "../../../../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../../../../lib/http";
import { deckKey } from "../../../../../../../lib/sca-edu/catalog";
import { EDU_CATALOG, EDU_DECKS } from "../../../../../../../lib/sca-edu/decks";
import { privateEduResponse } from "../../../../../../../lib/sca-edu/visibility";

export async function PUT(request: Request, context: { params: Promise<{ memberId: string; course: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser(request, ["admin"]);
    const { memberId, course } = await context.params;
    if (!/^[1-9]\d*$/.test(memberId) || !Number.isSafeInteger(Number(memberId))) throw new Error("수강생을 확인해 주세요.");
    const entry = EDU_CATALOG.courses.find(item => item.id === course);
    if (!entry?.levels.some(level => level.deck && EDU_DECKS[deckKey(course, level.level)] && ["review", "ready"].includes(level.status))) {
      throw new AuthError("열람 설정할 과목을 찾을 수 없습니다.", 404);
    }
    const payload = await request.json() as { enabled?: unknown } | null;
    if (typeof payload?.enabled !== "boolean") throw new Error("과목 열람 여부를 선택해 주세요.");
    const db = getD1();
    const member = await db.prepare("SELECT id FROM booking_members WHERE id = ? AND deleted_at IS NULL").bind(Number(memberId)).first();
    if (!member) throw new AuthError("수강생을 찾을 수 없습니다.", 404);
    if (payload.enabled) {
      // Capture approval epoch so restored accounts must be explicitly granted again.
      const result = await db.prepare(`INSERT INTO edu_member_courses (member_id, course_id, approval_stamp, updated_by, updated_at)
        SELECT id, ?, COALESCE(approved_at, created_at), ?, CURRENT_TIMESTAMP FROM booking_members
        WHERE id = ? AND approval_status = 'APPROVED' AND deleted_at IS NULL
        ON CONFLICT(member_id, course_id) DO UPDATE SET approval_stamp = excluded.approval_stamp,
          updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
        .bind(course, String(actor.id), Number(memberId)).run();
      if (!result.meta.changes) throw new AuthError("먼저 상담·회원에서 수강생을 승인해 주세요.", 409);
    } else {
      await db.prepare("DELETE FROM edu_member_courses WHERE member_id = ? AND course_id = ?").bind(Number(memberId), course).run();
    }
    return privateEduResponse(Response.json({ ok: true, enabled: payload.enabled }));
  } catch (error) { return privateEduResponse(jsonError(error)); }
}
