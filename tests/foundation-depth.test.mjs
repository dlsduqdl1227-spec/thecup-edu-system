import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { layoutDeck } from '../lib/sca-edu/layouts.js';

const load = course => JSON.parse(readFileSync(new URL(`../lib/sca-edu/decks/${course}/foundation.json`, import.meta.url), 'utf8'));
test('expanded foundations retain their level, private status and curriculum coverage', () => {
  const water = load('water-maintenance'), sustainability = load('sustainability');
  assert.equal(water.slides.length, 95);
  assert.equal(sustainability.slides.length, 93);
  const waterTopics = new Set(water.slides.flatMap(s => s.topicRefs ?? []));
  for (const section of Array.from({ length: 11 }, (_, i) => `1.${String(i + 1).padStart(2, '0')}`)) assert.ok(waterTopics.has(section), section);
  const sustainabilityTopics = new Set(sustainability.slides.flatMap(s => s.topicRefs ?? []));
  for (const [section, count] of [[1,4],[2,4],[3,3],[4,3],[5,3],[6,3]]) {
    for (let topic = 1; topic <= count; topic++) assert.ok(sustainabilityTopics.has(`1.0${section}.0${topic}`));
  }
  for (const deck of [water, sustainability]) {
    assert.equal(deck.level, 'Foundation');
    assert.equal(deck.status, 'review');
    assert.equal(deck.version, '1.3');
    assert.ok(deck.slides.every(s => s.notes?.length > 20));
    const visible = JSON.stringify(deck.slides.map(slide => ({ ...slide, notes: undefined })));
    assert.ok(visible.includes('가상'));
    assert.ok(!visible.includes('검토 중'));
    for (const [index, slide] of layoutDeck(deck).entries()) for (const shape of slide.shapes) {
      if (deck.slides[index]?.topicRefs && shape.t === 'text' && shape.y < 6.9 && !['image','table'].includes(slide.layout)) assert.ok(shape.size >= 15, `${deck.id}: ${slide.title}`);
    }
  }
  assert.ok(water.slides.some(s => s.asset === 'sca-water'));
  assert.ok(water.slides.some(s => s.title === '블렌딩 계산과 검증'));
  assert.ok(sustainability.slides.some(s => s.title === '총량과 원단위 비교'));
});
