import {
  assertLoginAllowed,
  clearLoginFailures,
  phoneHash,
  recordLoginFailure,
} from "../../../../lib/auth";
import { normalizeMemberLoginId } from "../../../../lib/booking";
import { audit, ensureDatabase, getD1 } from "../../../../lib/db";
import { createMemberSession, memberSessionCookie } from "../../../../lib/member-auth";
import { assertSameOrigin, jsonError } from "../../../../lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const payload = (await request.json()) as Record<string, unknown>;
    const loginId = normalizeMemberLoginId(payload.loginId);
    const hashedPhone = await phoneHash(String(payload.phone ?? ""));
    const loginKey = `member:${loginId}:${hashedPhone}`;
    await assertLoginAllowed(loginKey);
    const member = await getD1()
      .prepare(
        `SELECT id, login_id AS loginId, name, approval_status AS approvalStatus
         FROM booking_members
         WHERE login_id = ? AND phone_hash = ?`,
      )
      .bind(loginId, hashedPhone)
      .first<{ id: number; loginId: string; name: string; approvalStatus: string }>();
    if (!member || member.approvalStatus !== "APPROVED") {
      await recordLoginFailure(loginKey);
      throw new Error("상담 후 승인된 회원만 로그인할 수 있습니다.");
    }
    await clearLoginFailures(loginKey);
    const session = await createMemberSession(member.id);
    await audit(null, "member_login", "booking_member", String(member.id), member.name);
    return Response.json(
      { member: { id: member.id, loginId: member.loginId, name: member.name, approvalStatus: "APPROVED" } },
      { headers: { "Set-Cookie": memberSessionCookie(session.token, session.expiresAt) } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
