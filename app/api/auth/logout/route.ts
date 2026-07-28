import { destroySession, expiredSessionCookie } from "../../../../lib/auth";
import { assertSameOrigin, jsonError } from "../../../../lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await destroySession(request);
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": expiredSessionCookie(),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
