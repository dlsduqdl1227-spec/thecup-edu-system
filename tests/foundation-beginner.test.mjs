import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { layoutDeck } from '../lib/sca-edu/layouts.js';

const read = course => JSON.parse(readFileSync(new URL(`../lib/sca-edu/decks/${course}/foundation.json`, import.meta.url), 'utf8'));
const water = read('water-maintenance'), sustainability = read('sustainability');

test('beginner explanations pair every term with a plain meaning and visible everyday example', () => {
  for (const [deck, count, rowCount] of [[water,24,91],[sustainability,19,74]]) {
    const guides = deck.slides.filter(s => s.beginnerGuide);
    assert.equal(guides.length, count);
    assert.equal(guides.reduce((n,s) => n+s.rows.length, 0), rowCount);
    assert.equal(deck.level, 'Foundation');
    assert.equal(deck.status, 'review');
    assert.equal(deck.caseStudies.length, 6);
    assert.equal(deck.version, '1.3');
    for (const slide of guides) {
      assert.equal(slide.layout, 'table');
      assert.deepEqual(slide.columns, ['수업 용어','쉬운 뜻','생활 속 예시']);
      assert.ok(slide.rows.length >= 3 && slide.rows.length <= 4);
      assert.ok(slide.guideFor);
      assert.match(slide.notes, /개념 출처:/);
      for (const row of slide.rows) {
        assert.equal(row.length, 3);
        assert.ok(row[0].length > 1 && row[1].length > 6);
        assert.match(row[2], /^예: .{10,}$/u);
      }
      const index = deck.slides.indexOf(slide);
      const nextLesson = deck.slides.slice(index+1).find(s => !s.beginnerGuide);
      assert.equal(nextLesson.title ?? nextLesson.q, slide.guideFor);
    }
  }
});

test('key unfamiliar words have explanations in slide content, not presenter notes only', () => {
  for (const [deck, terms] of [
    [water, ['카트리지','하우징','가스켓','플러싱','잔압','알칼리도','TDS','RO','도징량']],
    [sustainability, ['SDGs','ESG','거버넌스','이해관계자','형평성','프리미엄','증분','원단위','%p']],
  ]) {
    const rows = deck.slides.filter(s => s.beginnerGuide).flatMap(s => s.rows);
    for (const term of terms) assert.ok(rows.some(row => row[0].includes(term)), term);
  }
  const cartridge = water.slides.filter(s=>s.beginnerGuide).flatMap(s=>s.rows).find(r=>r[0]==='카트리지');
  assert.match(cartridge[1], /갈아 끼우는 필터/);
  assert.match(cartridge[2], /정수기.*속심/);
});

test('all new glossary tables remain native, readable and identical between web and PPTX layouts', () => {
  for (const deck of [water,sustainability]) {
    for (const [index, laid] of layoutDeck(deck).entries()) {
      const source = deck.slides[index];
      if (!source.beginnerGuide) continue;
      const table = laid.shapes.find(s=>s.t==='table');
      assert.ok(table);
      assert.ok(table.size>=18, source.title);
      assert.deepEqual(table.rows, source.rows);
      assert.equal(laid.title, source.title);
      assert.ok(table.y+(table.rows.length+1)*table.rowH<6.85, source.title);
    }
  }
});
