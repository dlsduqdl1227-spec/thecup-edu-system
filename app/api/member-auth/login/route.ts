import {
  assertLoginAllowed,
  clearLoginFailures,
  phoneHash,
  recordLoginFailure,
} from "../../../../lib/auth";
import { bookingText } from "../../../../lib/booking";
import { audit, ensureDatabase, getD1 } from "../../../../lib/db";
import { createMemberSession, memberSessionCookie } from "../../../../lib/member-auth";
import { assertSameOrigin, jsonError } from "../../../../lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const payload = (await request.json()) as Record<string, unknown>;
    const name = bookingText(payload.name, "이름", 40).replace(/\s+/g, " ");
    const hashedPhone = await phoneHash(String(payload.phone ?? ""));
    const loginKey = `member:${hashedPhone}`;
    await assertLoginAllowed(loginKey);
    const member = await getD1()
      .prepare(
        `SELECT id, name, approval_status AS approvalStatus
         FROM booking_members
         WHERE name = ? COLLATE NOCASE AND phone_hash = ?
           AND approval_status = 'APPROVED' AND deleted_at IS NULL`,
      )
      .bind(name, hashedPhone)
      .first<{ id: number; name: string; approvalStatus: string }>();
    if (!member) {
      await recordLoginFailure(loginKey);
      throw new Error("이름 또는 휴대폰 번호가 올바르지 않거나 승인되지 않은 계정입니다.");
    }
    await clearLoginFailures(loginKey);
    const session = await createMemberSession(member.id);
    await audit(null, "member_login", "booking_member", String(member.id), member.name);
    return Response.json(
      { member: { id: member.id, name: member.name, approvalStatus: "APPROVED" } },
      { headers: { "Set-Cookie": memberSessionCookie(session.token, session.expiresAt) } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
