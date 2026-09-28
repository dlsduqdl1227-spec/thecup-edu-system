import { AuthError, requireUser } from "../../../../../../../lib/auth";
import { assertSameOrigin, jsonError } from "../../../../../../../lib/http";
import { privateEduResponse } from "../../../../../../../lib/sca-edu/visibility";

// Fail closed for stale browser tabs using the former all-level switch.
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await requireUser(request, ["admin"]);
    throw new AuthError("화면을 새로고침한 후 과목의 레벨을 선택해 주세요.", 409);
  } catch (error) { return privateEduResponse(jsonError(error)); }
}
