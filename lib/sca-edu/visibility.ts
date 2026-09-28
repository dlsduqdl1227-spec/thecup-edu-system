import { getD1 } from "../db";
import { applyMemberCourseAccess, type EduSessionViewer } from "./catalog";
import { EDU_CATALOG } from "./decks";

export async function effectiveEduCatalog(viewer: EduSessionViewer) {
  if (viewer.role === "admin") return EDU_CATALOG;
  if (!viewer.memberId) return applyMemberCourseAccess(EDU_CATALOG, []);
  const rows = await getD1().prepare(
    `SELECT g.course_id AS courseId FROM edu_member_courses g
     JOIN booking_members m ON m.id = g.member_id
     WHERE g.member_id = ? AND m.approval_status = 'APPROVED' AND m.deleted_at IS NULL
       AND g.approval_stamp = COALESCE(m.approved_at, m.created_at)`,
  ).bind(viewer.memberId).all<{ courseId: string }>();
  return applyMemberCourseAccess(EDU_CATALOG, rows.results.map(row => row.courseId));
}

export function privateEduResponse(response: Response): Response {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
