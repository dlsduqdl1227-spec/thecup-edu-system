import { getD1 } from '../db';
import type { Deck } from './catalog';

export async function slideSourceHash(slide: Deck['slides'][number]) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(slide)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Same source-hash and revision behavior as the deployed 2026-09-30 editor. */
export async function deckWithEdits(deck: Deck, course: string, level: string): Promise<Deck> {
  const rows = await getD1().prepare(`SELECT slide_id AS slideId, source_hash AS sourceHash, slide_json AS slideJson, revision
    FROM edu_slide_edits WHERE course_id = ? AND level = ?`).bind(course, level)
    .all<{ slideId: string; sourceHash: string; slideJson: string; revision: number }>();
  const edits = new Map(rows.results.map(row => [row.slideId, row]));
  const editing: NonNullable<Deck['editing']> = {};
  const slides = await Promise.all(deck.slides.map(async slide => {
    const id = String(slide.slideId), sourceHash = await slideSourceHash(slide), row = edits.get(id);
    const needsReview = Boolean(row && row.sourceHash !== sourceHash);
    editing[id] = { sourceHash, revision: row?.revision ?? 0,
      customized: Boolean(row && row.slideJson !== JSON.stringify(slide)), needsReview,
      ...(needsReview && row ? { previousSlide: JSON.parse(row.slideJson) } : {}) };
    return row && !needsReview ? JSON.parse(row.slideJson) : slide;
  }));
  return { ...deck, slides, editing };
}
