import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { layoutDeck } from '../lib/sca-edu/layouts.js';
import { slideHtml } from '../lib/sca-edu/render-web.js';
import { exportPptx } from '../lib/sca-edu/export-pptx.js';
import { withVisuals } from '../lib/sca-edu/with-visuals.js';
import { EDU_COPYRIGHT, H, W } from '../lib/sca-edu/theme.js';

const root = new URL('../lib/sca-edu/', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const catalog = json('decks/catalog.json');
const source = Object.fromEntries(catalog.courses.flatMap(course => course.levels.filter(l => l.deck).map(l => [
  `${course.id}/${l.level}`, json(`decks/${l.deck}`),
])));
const decks = withVisuals(withVisuals(source, json('decks/visuals.json')), json('decks/required-visuals.json'));

test('all 18 education decks share the exact copyright without changing original credits', () => {
  assert.equal(EDU_COPYRIGHT, '© Inyub kim_Thecup Edu');
  assert.equal(Object.keys(decks).length, 18);
  for (const deck of Object.values(decks)) for (const slide of layoutDeck(deck)) {
    const marks = slide.shapes.filter(s => s.t === 'text' && s.paras.some(p => p.text === EDU_COPYRIGHT));
    assert.equal(marks.length, 1);
    const mark = marks[0];
    assert.ok(mark.x >= 0 && mark.y >= 0 && mark.x + mark.w <= W && mark.y + mark.h <= H);
    assert.ok(slideHtml(slide).includes(EDU_COPYRIGHT));
  }
  for (const item of json('decks/required-visuals.json').filter(v => v.slide.layout === 'image')) {
    const laid = layoutDeck(decks[item.deckKey]).find(s => s.title === item.slide.title);
    assert.ok(slideHtml(laid).includes(item.slide.caption));
  }
  const viewer = readFileSync(new URL('viewer.js', root), 'utf8');
  assert.match(viewer, /watermarkCss\(EDU_COPYRIGHT\)/);
  assert.doesNotMatch(viewer, /const wmLabel|new Date\(\)\.toISOString/);
});

test('downloaded PPTX keeps the copyright on cover, question and answer pages', async () => {
  const context = { console, setTimeout, clearTimeout, TextEncoder, TextDecoder, Blob, Uint8Array, ArrayBuffer, Promise };
  context.window = context;
  runInNewContext(readFileSync(new URL('../public/vendor/pptxgen.bundle.js', import.meta.url), 'utf8'), context);
  const deck = { course: 'Copyright QA', level: 'Foundation', slides: [
    { layout: 'cover', title: '교육자료', level: 'Foundation' },
    { layout: 'question', q: '저작권 표시는?', a: EDU_COPYRIGHT },
  ] };
  const bytes = await exportPptx({ PptxGenJS: context.PptxGenJS, JSZip: context.JSZip, deck, laid: layoutDeck(deck), outputType: 'uint8array' });
  const zip = unzipSync(bytes);
  const slides = Object.keys(zip).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  assert.equal(slides.length, 3);
  for (const file of slides) assert.ok(strFromU8(zip[file]).includes(EDU_COPYRIGHT), file);
});
