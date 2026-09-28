import { AuthError } from "../../../../../../../../lib/auth";
import { getD1 } from "../../../../../../../../lib/db";
import { jsonError } from "../../../../../../../../lib/http";
import { requireEduViewer } from "../../../../../../../../lib/sca-edu/access";
import { deckForViewer } from "../../../../../../../../lib/sca-edu/catalog";
import { EDU_DECKS } from "../../../../../../../../lib/sca-edu/decks";
import { effectiveEduCatalog, privateEduResponse } from "../../../../../../../../lib/sca-edu/visibility";

export async function GET(request: Request, context: { params: Promise<{ course: string; level: string; asset: string }> }) {
  try {
    const viewer = await requireEduViewer(request);
    const { course, level, asset } = await context.params;
    const deck = deckForViewer(await effectiveEduCatalog(viewer), EDU_DECKS, viewer.role, course, level);
    if (!deck?.slides.some(slide => slide.layout === "image" && slide.asset === asset)) throw new AuthError("자료를 찾을 수 없습니다.", 404);
    const row = await getD1().prepare("SELECT data FROM edu_assets WHERE id = ? AND mime = 'image/png' AND length(sha256) = 64").bind(asset).first<{ data: ArrayBuffer }>();
    if (!row) throw new AuthError("이미지를 준비하고 있습니다. 잠시 후 다시 확인해 주세요.", 503);
    return privateEduResponse(new Response(new Uint8Array(row.data), { headers: { "Content-Type": "image/png", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" } }));
  } catch (error) { return privateEduResponse(jsonError(error)); }
}
