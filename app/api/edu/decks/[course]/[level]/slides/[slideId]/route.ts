import { assertSameOrigin, jsonError } from '../../../../../../../../lib/http';
import { AuthError, requireUser } from '../../../../../../../../lib/auth';
import { getD1 } from '../../../../../../../../lib/db';
import { deckForViewer } from '../../../../../../../../lib/sca-edu/catalog';
import { EDU_CATALOG, EDU_DECKS } from '../../../../../../../../lib/sca-edu/decks';
import { deckWithEdits, slideSourceHash } from '../../../../../../../../lib/sca-edu/edits';
import { validateSlideEdit } from '../../../../../../../../lib/sca-edu/slide-editor';
import { layoutDeck } from '../../../../../../../../lib/sca-edu/layouts';
import { privateEduResponse } from '../../../../../../../../lib/sca-edu/visibility';

export async function PUT(request: Request, context: { params: Promise<{ course: string; level: string; slideId: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireUser(request, ['admin']);
    const { course, level, slideId } = await context.params;
    const deck = deckForViewer(EDU_CATALOG, EDU_DECKS, 'admin', course, level);
    const original = deck?.slides.find(slide => slide.slideId === slideId);
    if (!deck || !original) throw new AuthError('교육자료 페이지를 찾을 수 없습니다.', 404);
    if (Number(request.headers.get('content-length')) > 100000) throw new Error('페이지 내용이 너무 큽니다.');
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 100000) throw new Error('페이지 내용이 너무 큽니다.');
    const body = JSON.parse(raw);
    if (!body || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0 || Number(body.revision) >= Number.MAX_SAFE_INTEGER || (body.reset !== undefined && typeof body.reset !== 'boolean')) throw new Error('페이지 저장 정보가 올바르지 않습니다.');
    const sourceHash = await slideSourceHash(original);
    if (body.sourceHash !== sourceHash) throw new AuthError('원본 자료가 변경됐습니다. 페이지를 다시 불러온 뒤 수정해 주세요.', 409);
    const slide = body.reset === true ? original : validateSlideEdit(original, body.slide);
    layoutDeck({ ...deck, slides: [slide] });
    const revision = Number(body.revision), db = getD1();
    const results = await db.batch([
      db.prepare(`INSERT INTO edu_slide_edits
        (course_id, level, slide_id, source_hash, slide_json, revision, updated_by)
        SELECT ?, ?, ?, ?, ?, 1, ? WHERE ? = 0 OR EXISTS
          (SELECT 1 FROM edu_slide_edits WHERE course_id = ? AND level = ? AND slide_id = ? AND revision = ?)
        ON CONFLICT(course_id, level, slide_id) DO UPDATE SET
          source_hash = excluded.source_hash, slide_json = excluded.slide_json,
          revision = edu_slide_edits.revision + 1, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
        WHERE edu_slide_edits.revision = ?`).bind(course, level, slideId, sourceHash, JSON.stringify(slide), admin.id, revision, course, level, slideId, revision, revision),
      db.prepare(`INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail)
        SELECT ?, ?, 'edu_slide', ?, ? WHERE changes() = 1`).bind(admin.id, body.reset ? 'reset_edu_slide' : 'edit_edu_slide', `${course}/${level}/${slideId}`, `페이지 수정 버전 ${revision + 1}`),
    ]);
    if (Number(results[0].meta.changes) !== 1) throw new AuthError('다른 관리자가 이 페이지를 수정했습니다. 다시 불러온 뒤 변경 내용을 확인해 주세요.', 409);
    return privateEduResponse(Response.json(await deckWithEdits(deck, course, level)));
  } catch (error) { return privateEduResponse(jsonError(error)); }
}
