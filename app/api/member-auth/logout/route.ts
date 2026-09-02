import {
  destroyMemberSession,
  expiredMemberSessionCookie,
} from "../../../../lib/member-auth";
import { assertSameOrigin, jsonError } from "../../../../lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await destroyMemberSession(request);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": expiredMemberSessionCookie() } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
