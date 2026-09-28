import { requireUser } from "../../../../../../../lib/auth";
import { assertSameOrigin, jsonError } from "../../../../../../../lib/http";
import { privateEduResponse } from "../../../../../../../lib/sca-edu/visibility";

// Old administrator tabs must not restore global publication.
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await requireUser(request, ["admin"]);
    return privateEduResponse(Response.json({ error: "수강생별 과목 열람 방식으로 변경됐습니다. 새로고침 후 수강생을 선택해 주세요." }, { status: 409 }));
  } catch (error) { return privateEduResponse(jsonError(error)); }
}
