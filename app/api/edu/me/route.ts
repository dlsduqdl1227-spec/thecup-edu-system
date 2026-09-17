import { jsonError } from "../../../../lib/http";
import { requireEduViewer } from "../../../../lib/sca-edu/access";

export async function GET(request: Request) {
  try {
    const viewer = await requireEduViewer(request);
    return Response.json(viewer);
  } catch (error) {
    return jsonError(error);
  }
}
