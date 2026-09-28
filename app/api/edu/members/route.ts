import { requireUser } from "../../../../lib/auth";
import { getD1 } from "../../../../lib/db";
import { jsonError } from "../../../../lib/http";
import type { EduMemberAccess } from "../../../../lib/sca-edu/catalog";
import { privateEduResponse } from "../../../../lib/sca-edu/visibility";

export async function GET(request: Request) {
  try {
    await requireUser(request, ["admin"]);
    // No full phone, memo, financial data or administrator metadata in this list.
    const rows = await getD1().prepare(`SELECT m.id, m.name, m.phone_last4 AS phoneLast4,
      m.approval_status AS approvalStatus, g.course_id AS courseId, g.level
      FROM booking_members m LEFT JOIN edu_member_levels g ON g.member_id = m.id
        AND m.approval_status = 'APPROVED' AND g.approval_stamp = COALESCE(m.approved_at, m.created_at)
      WHERE m.deleted_at IS NULL ORDER BY m.name, m.id, g.course_id`)
      .all<Omit<EduMemberAccess, "levels"> & { courseId: string | null; level: string | null }>();
    const members = new Map<number, EduMemberAccess>();
    for (const row of rows.results) {
      if (!members.has(row.id)) members.set(row.id, { id: row.id, name: row.name,
        phoneLast4: row.phoneLast4, approvalStatus: row.approvalStatus, levels: [] });
      if (row.courseId && row.level) members.get(row.id)!.levels.push({ courseId: row.courseId, level: row.level });
    }
    return privateEduResponse(Response.json({ members: [...members.values()] }));
  } catch (error) { return privateEduResponse(jsonError(error)); }
}
