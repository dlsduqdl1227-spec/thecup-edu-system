import { getSessionUser } from "../../../../lib/auth";
import { ensureDatabase, getD1 } from "../../../../lib/db";
import { jsonError } from "../../../../lib/http";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const db = getD1();
    const [row, user, visibilitySetting] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM staff").first<{ count: number }>(),
      getSessionUser(request),
      db
        .prepare("SELECT value FROM app_settings WHERE key = 'public_course_openings_visible'")
        .first<{ value: string }>(),
    ]);
    return Response.json({
      bootstrapRequired: Number(row?.count ?? 0) === 0,
      publicPageVisible: visibilitySetting?.value === "1",
      user,
    });
  } catch (error) {
    return jsonError(error);
  }
}
