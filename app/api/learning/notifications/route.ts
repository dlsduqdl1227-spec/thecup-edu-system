import { requireUser } from "../../../../lib/auth";
import { consultationScope, learningPrivateHeaders } from "../../../../lib/consultation-management";
import { ensureDatabase, getD1 } from "../../../../lib/db";
import { jsonError } from "../../../../lib/http";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const actor = await requireUser(request, ["admin", "instructor"]);
    const db = getD1();
    const counts = await db.prepare(`SELECT COUNT(*) AS newConsultations, COALESCE(MAX(c.id),0) AS latestId
      FROM learning_consultations c JOIN booking_members m ON m.id = c.member_id
      WHERE ${consultationScope} AND c.deleted_at IS NULL AND c.status = 'NEW'`)
      .bind(actor.role === "admin" ? 1 : 0, actor.id, actor.id).first();
    // No names, contact information or messages in notification responses.
    return Response.json(counts ?? { newConsultations: 0, latestId: 0 }, { headers: learningPrivateHeaders });
  } catch (error) { return jsonError(error); }
}
