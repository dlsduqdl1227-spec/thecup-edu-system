import { AuthError, requireUser } from "../../../../../../../lib/auth";
import { getD1 } from "../../../../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../../../../lib/http";
import { deckForViewer } from "../../../../../../../lib/sca-edu/catalog";
import { EDU_CATALOG, EDU_DECKS } from "../../../../../../../lib/sca-edu/decks";
import { privateEduResponse } from "../../../../../../../lib/sca-edu/visibility";

export async function PUT(request: Request, context: { params: Promise<{ course: string; level: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request, ["admin"]);
    const { course, level } = await context.params;
    if (!deckForViewer(EDU_CATALOG, EDU_DECKS, "admin", course, level)) {
      throw new AuthError("공개 설정할 교육자료를 찾을 수 없습니다.", 404);
    }
    const payload = await request.json() as { published?: unknown } | null;
    if (typeof payload?.published !== "boolean") throw new Error("공개 여부를 선택해 주세요.");
    const status = payload.published ? "ready" : "review";
    await getD1().prepare(`INSERT INTO edu_deck_visibility (course_id, level, status, updated_by, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(course_id, level) DO UPDATE SET status = excluded.status,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
      .bind(course, level, status, String(user.id)).run();
    return privateEduResponse(Response.json({ ok: true, status }));
  } catch (error) { return privateEduResponse(jsonError(error)); }
}
