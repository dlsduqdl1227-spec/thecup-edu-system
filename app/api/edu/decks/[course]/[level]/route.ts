import { jsonError } from "../../../../../../lib/http";
import { requireEduViewer } from "../../../../../../lib/sca-edu/access";
import { deckForViewer, studentDeck, deckKey } from "../../../../../../lib/sca-edu/catalog";
import { deckWithEdits } from "../../../../../../lib/sca-edu/edits";
import { EDU_DECKS } from "../../../../../../lib/sca-edu/decks";
import { localizeDeck } from "../../../../../../lib/sca-edu/localize";
import english from "../../../../../../lib/sca-edu/locales/en.json";
import { effectiveEduCatalog, privateEduResponse } from "../../../../../../lib/sca-edu/visibility";

export async function GET(
  request: Request,
  context: { params: Promise<{ course: string; level: string }> },
) {
  try {
    const viewer = await requireEduViewer(request);
    const { course, level } = await context.params;
    const deck = deckForViewer(await effectiveEduCatalog(viewer), EDU_DECKS, viewer.role, course, level);
    if (!deck) return privateEduResponse(Response.json({ error: "교육자료를 찾을 수 없습니다." }, { status: 404 }));
    const edited = await deckWithEdits({ ...EDU_DECKS[deckKey(course, level)], status: deck.status }, course, level);
    const language = new URL(request.url).searchParams.get("lang") ?? "ko";
    if (language !== "ko" && language !== "en") return privateEduResponse(Response.json({ error: "지원하지 않는 언어입니다." }, { status: 400 }));
    try {
      const visible = viewer.role === 'admin' ? edited : studentDeck(edited);
      return privateEduResponse(Response.json(localizeDeck(visible, language, english)));
    } catch {
      return privateEduResponse(Response.json({ error: "영문 자료를 준비하고 있습니다. 한국어 자료를 이용해 주세요. / English is temporarily unavailable. Please use Korean." }, { status: 503 }));
    }
  } catch (error) {
    return privateEduResponse(jsonError(error));
  }
}
