import { jsonError } from "../../../../../../lib/http";
import { requireEduViewer } from "../../../../../../lib/sca-edu/access";
import { deckForViewer } from "../../../../../../lib/sca-edu/catalog";
import { EDU_CATALOG, EDU_DECKS } from "../../../../../../lib/sca-edu/decks";

export async function GET(
  request: Request,
  context: { params: Promise<{ course: string; level: string }> },
) {
  try {
    const viewer = await requireEduViewer(request);
    const { course, level } = await context.params;
    const deck = deckForViewer(EDU_CATALOG, EDU_DECKS, viewer.role, course, level);
    if (!deck) return Response.json({ error: "교육자료를 찾을 수 없습니다." }, { status: 404 });
    return Response.json(deck);
  } catch (error) {
    return jsonError(error);
  }
}
