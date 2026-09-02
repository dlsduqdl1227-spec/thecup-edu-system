import { getMemberSession } from "../../../../lib/member-auth";
import { jsonError } from "../../../../lib/http";

export async function GET(request: Request) {
  try {
    return Response.json({ member: await getMemberSession(request) });
  } catch (error) {
    return jsonError(error);
  }
}
