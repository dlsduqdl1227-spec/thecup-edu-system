import {
  assertLoginAllowed,
  clearLoginFailures,
  createSession,
  normalizePhone,
  phoneHash,
  recordLoginFailure,
  sessionCookie,
  normalizeSessionUser,
  loginAttemptKeys,
} from "../../../../lib/auth";
import { audit, ensureDatabase, getD1, type StaffRole } from "../../../../lib/db";
import { assertSameOrigin, jsonError, textValue } from "../../../../lib/http";
import { matchesSecurityCode, readLoginSecurity } from "../../../../lib/login-security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const payload = (await request.json()) as Record<string, unknown>;
    const name = textValue(payload.name, "이름", 40).replace(/\s+/g, " ");
    const phone = normalizePhone(String(payload.phone ?? ""));
    const hashedPhone = await phoneHash(phone);
    const attemptKeys = await loginAttemptKeys(request, hashedPhone, "operator");
    await Promise.all(attemptKeys.map(assertLoginAllowed));
    const security = await readLoginSecurity("operator");
    const codeMatches = await matchesSecurityCode("operator", payload.securityCode, security);

    const row = await getD1()
      .prepare(
        `SELECT id, name, role,
                can_finance AS canFinance,
                can_inventory AS canInventory,
                can_roasting AS canRoasting
         FROM staff
         WHERE name = ? AND phone_hash = ? AND active = 1 AND deleted_at IS NULL`,
      )
      .bind(name, hashedPhone)
      .first<{
        id: number;
        name: string;
        role: StaffRole;
        canFinance: number;
        canInventory: number;
        canRoasting: number;
      }>();

    if (!row || !codeMatches) {
      await Promise.all(attemptKeys.map(recordLoginFailure));
      return Response.json(
        { error: "이름, 휴대폰 번호 또는 보안코드가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    const user = normalizeSessionUser(row);
    await Promise.all(attemptKeys.map(clearLoginFailures));
    const session = await createSession(user.id, security.version);
    await audit(user.id, "login", "session");
    return new Response(JSON.stringify({ user }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": sessionCookie(session.token, session.expiresAt),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
