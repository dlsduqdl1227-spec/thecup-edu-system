import { AuthError, requireUser } from "../../../../../lib/auth";
import { getD1 } from "../../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../../lib/http";
import { parseBulkAccess } from "../../../../../lib/sca-edu/bulk-access";
import { deckKey } from "../../../../../lib/sca-edu/catalog";
import { EDU_CATALOG, EDU_DECKS } from "../../../../../lib/sca-edu/decks";
import { privateEduResponse } from "../../../../../lib/sca-edu/visibility";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser(request, ["admin"]);
    const { memberIds, levels, enabled } = parseBulkAccess(await request.json());
    for (const { courseId, level } of levels) {
      const entry = EDU_CATALOG.courses.find(c => c.id === courseId)?.levels.find(l => l.level === level);
      if (!entry?.deck || !EDU_DECKS[deckKey(courseId, level)] || !["review", "ready"].includes(entry.status)) {
        throw new AuthError("열람 설정할 과목·레벨을 찾을 수 없습니다. 목록을 새로고침해 주세요.", 404);
      }
    }
    const db = getD1(), ids = JSON.stringify(memberIds), targets = JSON.stringify(levels);
    // JSON parameters keep even 100 students × all levels below D1's parameter limit.
    const eligible = `SELECT COUNT(*) FROM booking_members WHERE id IN (SELECT value FROM json_each(?))
      AND deleted_at IS NULL ${enabled ? "AND approval_status = 'APPROVED'" : ""}`;
    const change = enabled
      ? db.prepare(`INSERT INTO edu_member_levels (member_id, course_id, level, approval_stamp, updated_by, updated_at)
          SELECT m.id, json_extract(t.value, '$.courseId'), json_extract(t.value, '$.level'),
            COALESCE(m.approved_at, m.created_at), ?, CURRENT_TIMESTAMP
          FROM booking_members m CROSS JOIN json_each(?) t
          WHERE m.id IN (SELECT value FROM json_each(?)) AND (${eligible}) = ?
          ON CONFLICT(member_id, course_id, level) DO UPDATE SET approval_stamp = excluded.approval_stamp,
            updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
        .bind(String(actor.id), targets, ids, ids, memberIds.length)
      : db.prepare(`DELETE FROM edu_member_levels WHERE member_id IN (SELECT value FROM json_each(?))
          AND EXISTS (SELECT 1 FROM json_each(?) t WHERE json_extract(t.value, '$.courseId') = course_id
            AND json_extract(t.value, '$.level') = level) AND (${eligible}) = ?`)
        .bind(ids, targets, ids, memberIds.length);
    // Validate, change, and audit in one transaction. A stale/deleted/unapproved target changes nothing.
    const [check, result] = await db.batch([
      db.prepare(`SELECT (${eligible}) AS eligibleCount`).bind(ids),
      change,
      db.prepare(`INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail)
        SELECT ?, ?, 'edu_member_levels', ?, ? WHERE (${eligible}) = ?`)
        .bind(actor.id, enabled ? "bulk_grant_education" : "bulk_revoke_education", ids,
          `${memberIds.length}명 · ${levels.map(l => deckKey(l.courseId, l.level)).join(", ")}`, ids, memberIds.length),
    ]);
    if (Number((check.results?.[0] as { eligibleCount?: number } | undefined)?.eligibleCount) !== memberIds.length) {
      throw new AuthError(enabled ? "삭제되었거나 예약 승인이 안 된 수강생이 포함되어 있습니다. 아무 권한도 변경하지 않았습니다. 목록을 새로고침해 주세요."
        : "삭제되었거나 없는 수강생이 포함되어 있습니다. 아무 권한도 변경하지 않았습니다. 목록을 새로고침해 주세요.", 409);
    }
    return privateEduResponse(Response.json({ ok: true, enabled, memberCount: memberIds.length, levelCount: levels.length, affected: Number(result.meta.changes) }));
  } catch (error) { return privateEduResponse(jsonError(error)); }
}
