import { jsonError } from "../../../../lib/http";
import { requireEduViewer } from "../../../../lib/sca-edu/access";
import { visibleCatalog } from "../../../../lib/sca-edu/catalog";
import { EDU_CATALOG, EDU_DECKS } from "../../../../lib/sca-edu/decks";

export async function GET(request: Request) {
  try {
    const viewer = await requireEduViewer(request);
    return Response.json(visibleCatalog(EDU_CATALOG, EDU_DECKS, viewer.role));
  } catch (error) {
    return jsonError(error);
  }
}
