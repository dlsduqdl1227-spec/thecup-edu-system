import { assertLoginAllowed, AuthError, recordLoginFailure, requireUser } from "../../../../lib/auth";
import { assertSameOrigin, jsonError } from "../../../../lib/http";
import { matchesSecurityCode, readLoginSecurity, rotateLoginSecurity, validateSecurityCode } from "../../../../lib/login-security";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request, ["admin"]);
    const payload = await request.json() as Record<string, unknown>;
    const audience = payload.audience;
    if (audience !== "operator" && audience !== "student") throw new Error("변경할 로그인 유형을 선택해 주세요.");
    const attemptKey = `security-change:${user.id}`;
    await assertLoginAllowed(attemptKey);
    const operator = await readLoginSecurity("operator");
    if (!await matchesSecurityCode("operator", payload.currentOperatorCode, operator)) {
      await recordLoginFailure(attemptKey);
      throw new AuthError("현재 운영자 보안코드가 올바르지 않습니다.", 403);
    }
    const nextCode = validateSecurityCode(payload.newCode);
    if (nextCode !== payload.confirmCode) throw new Error("새 보안코드가 일치하지 않습니다.");
    const previous = audience === "operator" ? operator : await readLoginSecurity("student");
    if (!await rotateLoginSecurity(audience, previous, nextCode, user.id)) throw new AuthError("다른 관리자가 먼저 변경했습니다. 다시 확인해 주세요.", 409);
    return Response.json({ ok: true, requiresRelogin: audience === "operator" });
  } catch (error) { return jsonError(error); }
}
