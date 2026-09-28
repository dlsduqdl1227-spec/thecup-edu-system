import { jsonError } from "../../../../lib/http";
import { requireEduViewer } from "../../../../lib/sca-edu/access";
import { visibleCatalog } from "../../../../lib/sca-edu/catalog";
import { EDU_DECKS } from "../../../../lib/sca-edu/decks";
import { effectiveEduCatalog, privateEduResponse } from "../../../../lib/sca-edu/visibility";

export async function GET(request: Request) {
  try {
    const viewer = await requireEduViewer(request);
    return privateEduResponse(Response.json(visibleCatalog(await effectiveEduCatalog(viewer), EDU_DECKS, viewer.role)));
  } catch (error) {
    return privateEduResponse(jsonError(error));
  }
}
