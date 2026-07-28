import { requireUser } from "../../../../lib/auth";
import { audit, ensureDatabase, getD1 } from "../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../lib/http";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const user = await requireUser(request, ["admin"]);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("삭제할 프로파일을 선택해 주세요.");
    const db = getD1();
    const existing = await db
      .prepare("SELECT id FROM roasting_profiles WHERE id = ?")
      .bind(id)
      .first<{ id: number }>();
    if (!existing) {
      return Response.json({ error: "삭제할 로스팅 프로파일을 찾을 수 없습니다." }, { status: 404 });
    }
    await db.batch([
      db.prepare("DELETE FROM roasting_points WHERE profile_id = ?").bind(id),
      db.prepare("DELETE FROM roasting_profiles WHERE id = ?").bind(id),
    ]);
    await audit(user.id, "delete_roast_profile", "roasting_profile", String(id));
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
