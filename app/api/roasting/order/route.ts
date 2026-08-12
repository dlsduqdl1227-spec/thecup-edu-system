import { requireUser } from "../../../../lib/auth";
import { audit, ensureDatabase, getD1 } from "../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../lib/http";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const user = await requireUser(request, ["admin"]);
    const payload = (await request.json()) as { profileIds?: unknown };
    if (!Array.isArray(payload.profileIds) || payload.profileIds.length > 200) {
      throw new Error("저장할 프로파일 순서를 확인해 주세요.");
    }

    const profileIds = payload.profileIds.map(Number);
    const uniqueIds = new Set(profileIds);
    if (
      profileIds.some((id) => !Number.isInteger(id) || id <= 0) ||
      uniqueIds.size !== profileIds.length
    ) {
      throw new Error("프로파일 순서에 중복되거나 잘못된 항목이 있습니다.");
    }

    const db = getD1();
    const current = await db
      .prepare("SELECT id FROM roasting_profiles")
      .all<{ id: number }>();
    const sameProfiles =
      current.results.length === profileIds.length &&
      current.results.every((profile) => uniqueIds.has(Number(profile.id)));
    if (!sameProfiles) {
      return Response.json(
        { error: "프로파일 목록이 변경됐습니다. 목록을 새로고침한 뒤 다시 이동해 주세요." },
        { status: 409 },
      );
    }

    if (profileIds.length) {
      await db.batch(
        profileIds.map((id, index) =>
          db
            .prepare("UPDATE roasting_profiles SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(index, id),
        ),
      );
    }
    await audit(
      user.id,
      "reorder_roast_profiles",
      "roasting_profile",
      "",
      profileIds.join(","),
    );
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
