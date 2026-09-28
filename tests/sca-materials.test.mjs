import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { layoutDeck } from '../lib/sca-edu/layouts.js';
import { withVisuals } from '../lib/sca-edu/with-visuals.js';
import { slideHtml } from '../lib/sca-edu/render-web.js';
import { loadPresentationImages, eduAssetUrl } from '../lib/sca-edu/assets.js';
const read = file => JSON.parse(readFileSync(new URL(`../lib/sca-edu/decks/${file}`,import.meta.url),'utf8'));
const catalog=read('catalog.json'), decks={};
for(const c of catalog.courses) for(const l of c.levels) decks[`${c.id}/${l.level}`]=read(l.deck);
const all=withVisuals(withVisuals(decks,read('visuals.json')),read('required-visuals.json'));

test('required original visuals, new foundations and RoR are present in every relevant level',()=>{
  assert.equal(Object.keys(all).length,18);
  for(const level of ['Foundation','Intermediate','Professional']) {
    assert.ok(all[`sensory-skills/${level}`].slides.some(s=>s.asset==='flavor-wheel-ko'));
    for(const asset of ['sca-water','sca-brewing-2019']) assert.ok(all[`brewing/${level}`].slides.some(s=>s.asset===asset));
    assert.ok(all[`roasting/${level}`].slides.some(s=>s.layout==='chart' && /RoR|탐침/.test(s.title)));
  }
  for(const key of ['water-maintenance/Foundation','sustainability/Foundation']) {
    assert.equal(all[key].status,'review');
    assert.ok(all[key].slides.length>=16);
    assert.ok(all[key].slides.some(s=>s.layout==='chart'));
  }
  for(const [key,deck] of Object.entries(all)) for(const slide of layoutDeck(deck)) for(const shape of slide.shapes) {
    if(shape.t==='image') {
      assert.match(shape.src,/^\/api\/edu\/decks\//);
      assert.ok(shape.alt && !shape.data);
      assert.ok(slideHtml(slide).includes('alt='));
    }
    if(shape.t!=='line') assert.ok(shape.x>=0 && shape.y>=0 && shape.x+(shape.w??0)<=13.334 && shape.y+(shape.h??0)<=7.51, `${key}: ${slide.title}`);
  }
});

test('image export fails closed instead of downloading slides with missing required images',async()=>{
  const laid=layoutDeck(all['brewing/Foundation']);
  await assert.rejects(loadPresentationImages(laid,async()=>new Response('',{status:401})),/필수 이미지/);
  const loaded=await loadPresentationImages(laid,async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}}));
  assert.ok(loaded.flatMap(s=>s.shapes).filter(s=>s.t==='image').every(s=>s.data.startsWith('data:image/png;base64,')));
  assert.throws(()=>eduAssetUrl('../secret','Foundation','sca-water'));
});

test('course-to-level migration preserves existing access but adds no new course permissions',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE booking_members (id INTEGER PRIMARY KEY, approval_status TEXT, deleted_at TEXT, approved_at TEXT, created_at TEXT);");
    db.exec(readFileSync(new URL('../drizzle/0017_wealthy_gertrude_yorkes.sql',import.meta.url),'utf8'));
    db.exec("INSERT INTO booking_members VALUES (1,'APPROVED',NULL,'epoch','epoch'),(2,'PENDING',NULL,NULL,'epoch'); INSERT INTO edu_member_courses VALUES (1,'brewing','epoch','1','now'),(1,'barista-skills','epoch','1','now'),(2,'roasting','epoch','1','now');");
    db.exec(readFileSync(new URL('../drizzle/0018_big_dragon_man.sql',import.meta.url),'utf8'));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM edu_member_levels').get().n,6);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM edu_member_levels WHERE course_id IN ('water-maintenance','sustainability')").get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM edu_member_courses').get().n,3,'legacy rows preserved for rollback');
    db.exec("UPDATE booking_members SET approval_status='REVOKED' WHERE id=1");
    assert.equal(db.prepare('SELECT COUNT(*) n FROM edu_member_levels').get().n,0);
  } finally {db.close();}
});
