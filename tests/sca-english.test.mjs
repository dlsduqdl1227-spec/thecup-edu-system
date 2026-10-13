import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { localizeDeck, canReadEducationAsset } from '../lib/sca-edu/localize.js';
import { deckForViewer, applyMemberLevelAccess, studentDeck } from '../lib/sca-edu/catalog.ts';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { layoutDeck } from '../lib/sca-edu/layouts.js';
import { pptxFileName } from '../lib/sca-edu/export-pptx.js';
import { measure } from '../lib/sca-edu/text.js';
const json = name => JSON.parse(readFileSync(new URL(`../lib/sca-edu/${name}`, import.meta.url)));
const catalog = json('decks/catalog.json'), translations = json('locales/en.json');
const built = await build({ entryPoints: [fileURLToPath(new URL('../lib/sca-edu/decks.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
const { EDU_DECKS: decks } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const numbers = obj => {
  if (typeof obj === 'number') return [obj];
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj).flatMap(([key, v]) => key === 'aspect' ? [] : numbers(v));
};
test('all 18 course levels have complete English text, identical slide structure and chart numbers', () => {
  assert.equal(Object.keys(decks).length, 18);
  for (const [key, deck] of Object.entries(decks)) {
    const original = JSON.stringify(deck), en = localizeDeck(deck, 'en', translations);
    assert.equal(en.language, 'en');
    assert.equal(en.status, deck.status);
    assert.equal(en.id, deck.id);
    assert.equal(JSON.stringify(deck), original, `${key}: Korean source unchanged`);
    assert.deepEqual(en.slides.map(s => s.layout), deck.slides.map(s => s.layout), key);
    assert.deepEqual(numbers(en), numbers(deck), `${key}: chart values and geometry unchanged`);
    assert.ok(!/[가-힣]/u.test(JSON.stringify(en)), `${key}: no untranslated text`);
    assert.equal(en.slides.filter(s => s.layout === 'quiz').flatMap(s => s.questions).length,
      deck.slides.filter(s => s.layout === 'quiz').flatMap(s => s.questions).length);
    const laid = layoutDeck(en);
    assert.equal(laid.length, layoutDeck(deck).length);
    for (const slide of laid) {
      assert.ok(!/[가-힣]/u.test(JSON.stringify(slide)), `${key}: layout defaults translated`);
      for (const shape of slide.shapes) {
        if (shape.t === 'line') continue;
        assert.ok(Number.isFinite(shape.x) && Number.isFinite(shape.y) && shape.w > 0 && shape.h !== 0, `${key}: valid geometry`);
        assert.ok(shape.x >= 0 && shape.y >= 0, `${key}: content starts on canvas`);
        if (shape.t === 'text') {
          assert.ok(shape.size >= 10, `${key}: readable minimum font`);
          assert.ok(measure(shape.paras, shape.w, shape.size, { paraAfter: shape.after, bulletIndent: shape.indent, bold: shape.bold }) <= shape.h + 0.08, `${key}: text stays within its box`);
        }
      }
    }
  }
});
test('English is subject to the same member-and-level grant and private-note stripping', () => {
  const granted = applyMemberLevelAccess(catalog, [{ courseId: 'sensory-skills', level: 'Foundation' }]);
  assert.equal(deckForViewer(granted, decks, 'student', 'sensory-skills', 'Intermediate'), null);
  const en = localizeDeck(deckForViewer(granted, decks, 'student', 'sensory-skills', 'Foundation'), 'en', translations);
  assert.equal(en.sources, undefined);
  assert.equal(en.sourceNote, undefined);
  assert.ok(en.slides.every(s => !('notes' in s)));
  assert.equal(studentDeck(en).language, 'en');
  assert.ok(en.slides.some(s => s.asset === 'flavor-wheel-en'));
  assert.ok(canReadEducationAsset(decks['sensory-skills/Foundation'], 'flavor-wheel-en'));
  assert.equal(canReadEducationAsset(null, 'flavor-wheel-en'), false);
  assert.equal(canReadEducationAsset(decks['sustainability/Foundation'], 'flavor-wheel-en'), false);
  assert.equal(canReadEducationAsset(decks['sensory-skills/Foundation'], '../flavor-wheel-en'), false);
});
test('Korean default stays intact; invalid or unfinished English fails rather than silently mixing languages', () => {
  const deck = decks['water-maintenance/Foundation'];
  assert.deepEqual(localizeDeck(deck, 'ko', {}), { ...deck, language: 'ko' });
  assert.throws(() => localizeDeck(deck, 'en', {}), /incomplete/);
  assert.throws(() => localizeDeck(deck, 'fr', translations), /Unsupported/);
  assert.match(pptxFileName(localizeDeck(deck, 'en', translations)), /_EN\.pptx$/);
  assert.ok(!pptxFileName(deck).includes('_EN'));
});
test('protected translation dictionary is never imported by a client component or viewer', () => {
  for (const path of ['app/components/ScaEducation.tsx', 'lib/sca-edu/viewer.js']) {
    const src = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.ok(!src.includes('locales/en.json'));
  }
});
