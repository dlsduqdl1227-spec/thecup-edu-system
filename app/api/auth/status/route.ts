import { getSessionUser } from "../../../../lib/auth";
import { ensureDatabase, getD1 } from "../../../../lib/db";
import { jsonError } from "../../../../lib/http";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const row = await getD1().prepare("SELECT COUNT(*) AS count FROM staff").first<{ count: number }>();
    const user = await getSessionUser(request);
    return Response.json({
      bootstrapRequired: Number(row?.count ?? 0) === 0,
      user,
    });
  } catch (error) {
    return jsonError(error);
  }
}
