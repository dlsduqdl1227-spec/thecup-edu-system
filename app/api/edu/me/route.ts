import { jsonError } from "../../../../lib/http";
import { requireEduViewer } from "../../../../lib/sca-edu/access";
import { privateEduResponse } from "../../../../lib/sca-edu/visibility";

export async function GET(request: Request) {
  try {
    const viewer = await requireEduViewer(request);
    return privateEduResponse(Response.json({ name: viewer.name, role: viewer.role }));
  } catch (error) {
    return privateEduResponse(jsonError(error));
  }
}
