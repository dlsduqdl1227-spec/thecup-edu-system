import { requireUser, AuthError } from "../../../../lib/auth";
import { optionalBookingText, positiveBookingInteger } from "../../../../lib/booking";
import { decryptContact } from "../../../../lib/consultation-contact";
import { changeConsultation, consultationScope, consultationStatuses, learningPrivateHeaders } from "../../../../lib/consultation-management";
import { ensureDatabase, getD1 } from "../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../lib/http";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const actor = await requireUser(request, ["admin", "instructor"]);
    const db = getD1(), admin = actor.role === "admin";
    const query = new URL(request.url).searchParams, args: (string | number)[] = [admin ? 1 : 0, actor.id, actor.id];
    const instructors = admin ? (await db.prepare("SELECT id, name FROM staff WHERE active = 1 AND deleted_at IS NULL AND role IN ('admin','instructor') ORDER BY name").all()).results : [{ id: actor.id, name: actor.name }];
    if (query.has("id")) {
      const row = await db.prepare(`SELECT c.id, c.member_id AS memberId, c.name, c.phone_encrypted AS encrypted, c.age_range AS ageRange,
        c.discovery, c.contact_channel AS contactChannel, c.interests, c.message, c.status, c.staff_note AS staffNote, c.instructor_id AS instructorId,
        c.created_at AS createdAt, c.updated_at AS updatedAt, c.deleted_at AS deletedAt, c.revision, m.approval_status AS approvalStatus
        FROM learning_consultations c JOIN booking_members m ON m.id = c.member_id WHERE c.id = ? AND ${consultationScope}
        AND (? = 1 OR c.deleted_at IS NULL)`).bind(positiveBookingInteger(query.get("id"), "상담"), ...args, admin ? 1 : 0).first<{ encrypted: string; instructorId: number | null; [key: string]: unknown }>();
      if (!row) throw new AuthError("이 상담을 볼 수 없습니다.", 403);
      const { encrypted, ...detail } = row;
      return Response.json({ detail: { ...detail, phone: await decryptContact(encrypted), canEdit: admin || row.instructorId === actor.id }, instructors, isAdmin: admin }, { headers: learningPrivateHeaders });
    }
    const deleted = query.get("deleted") === "1";
    if (deleted && !admin) throw new AuthError("삭제한 상담은 관리자만 볼 수 있습니다.", 403);
    const status = query.get("status") || "";
    if (status && !consultationStatuses.some(value => value === status)) throw new Error("상담 상태를 확인해 주세요.");
    const sort = query.get("sort") || "newest";
    const orders: Record<string, string> = { newest: "c.id DESC", oldest: "c.id ASC", name: "c.name COLLATE NOCASE ASC, c.id DESC", updated: "c.updated_at DESC, c.id DESC" };
    if (!Object.hasOwn(orders, sort)) throw new Error("정렬 기준을 확인해 주세요.");
    const search = optionalBookingText(query.get("q"), 80), pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    let scope = `${consultationScope} AND c.deleted_at IS ${deleted ? "NOT NULL" : "NULL"}
      AND (c.name LIKE ? ESCAPE '\\' OR m.name LIKE ? ESCAPE '\\' OR COALESCE(NULLIF(c.phone_last4,''),m.phone_last4) LIKE ? ESCAPE '\\')`;
    args.push(pattern, pattern, pattern);
    if (status) { scope += " AND c.status = ?"; args.push(status); }
    const total = (await db.prepare(`SELECT COUNT(*) AS count FROM learning_consultations c JOIN booking_members m ON m.id = c.member_id WHERE ${scope}`).bind(...args).first<{ count: number }>())?.count ?? 0;
    const page = Math.min(Math.max(1, Math.ceil(total / 25)), Math.max(1, Math.floor(Number(query.get("page")) || 1)));
    const rows = await db.prepare(`SELECT c.id, c.member_id AS memberId, c.name, COALESCE(NULLIF(c.phone_last4,''),m.phone_last4) AS phoneLast4,
      c.interests, c.status, c.contact_channel AS contactChannel, c.created_at AS createdAt, c.updated_at AS updatedAt, c.revision,
      c.deleted_at AS deletedAt, t.name AS instructorName, m.approval_status AS approvalStatus
      FROM learning_consultations c JOIN booking_members m ON m.id = c.member_id LEFT JOIN staff t ON t.id = c.instructor_id
      WHERE ${scope} ORDER BY ${orders[sort]} LIMIT 25 OFFSET ?`).bind(...args, (page - 1) * 25).all();
    return Response.json({ rows: rows.results, total, page, isAdmin: admin }, { headers: learningPrivateHeaders });
  } catch (error) { return jsonError(error); }
}
async function mutate(request: Request, remove: boolean) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin", "instructor"]);
    const body = await request.text();
    if (body.length > 12000) throw new AuthError("입력 내용이 너무 깁니다.", 413);
    await changeConsultation(getD1(), actor, JSON.parse(body) as Record<string, unknown>, remove);
    return Response.json({ ok: true }, { headers: learningPrivateHeaders });
  } catch (error) { return jsonError(error); }
}
export const PATCH = (request: Request) => mutate(request, false);
export const DELETE = (request: Request) => mutate(request, true);
