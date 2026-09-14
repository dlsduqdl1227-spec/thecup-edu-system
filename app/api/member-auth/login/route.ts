import {
  assertLoginAllowed,
  clearLoginFailures,
  phoneHash,
  recordLoginFailure,
  loginAttemptKeys,
  AuthError,
} from "../../../../lib/auth";
import { bookingText } from "../../../../lib/booking";
import { audit, ensureDatabase, getD1 } from "../../../../lib/db";
import { createMemberSession, memberSessionCookie } from "../../../../lib/member-auth";
import { assertSameOrigin, jsonError } from "../../../../lib/http";
import { matchesSecurityCode, readLoginSecurity } from "../../../../lib/login-security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const payload = (await request.json()) as Record<string, unknown>;
    const name = bookingText(payload.name, "이름", 40).replace(/\s+/g, " ");
    const hashedPhone = await phoneHash(String(payload.phone ?? ""));
    const loginKey = `member:${hashedPhone}`;
    const attemptKeys = await loginAttemptKeys(request, loginKey, "student");
    await Promise.all(attemptKeys.map(assertLoginAllowed));
    const security = await readLoginSecurity("student");
    const codeMatches = await matchesSecurityCode("student", payload.securityCode, security);
    const member = await getD1()
      .prepare(
        `SELECT id, name, approval_status AS approvalStatus
         FROM booking_members
         WHERE name = ? COLLATE NOCASE AND phone_hash = ?
           AND approval_status = 'APPROVED' AND deleted_at IS NULL`,
      )
      .bind(name, hashedPhone)
      .first<{ id: number; name: string; approvalStatus: string }>();
    if (!member || !codeMatches) {
      await Promise.all(attemptKeys.map(recordLoginFailure));
      throw new AuthError("이름, 휴대폰 번호 또는 보안코드가 올바르지 않거나 승인되지 않은 계정입니다.", 401);
    }
    await Promise.all(attemptKeys.map(clearLoginFailures));
    const session = await createMemberSession(member.id, security.version);
    await audit(null, "member_login", "booking_member", String(member.id), member.name);
    return Response.json(
      { member: { id: member.id, name: member.name, approvalStatus: "APPROVED" } },
      { headers: { "Set-Cookie": memberSessionCookie(session.token, session.expiresAt) } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
