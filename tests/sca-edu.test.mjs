import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  deckForViewer,
  applyStatusOverrides,
  applyMemberCourseAccess,
  deckKey,
  resolveEduViewer,
  visibleCatalog,
} from "../lib/sca-edu/catalog.ts";
import { LAYOUTS, layoutDeck } from "../lib/sca-edu/layouts.js";
import { withVisuals } from "../lib/sca-edu/with-visuals.js";
import { chartSvg, addPptxChart } from "../lib/sca-edu/charts.js";
import { pruneMissingContentTypes } from "../lib/sca-edu/export-pptx.js";

const root = new URL("../lib/sca-edu/", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const catalog = readJson("decks/catalog.json");
const decks = {};
for (const course of catalog.courses) {
  for (const entry of course.levels) {
    if (entry.deck) decks[deckKey(course.id, entry.level)] = readJson(`decks/${entry.deck}`);
  }
}

test("visibility overrides take precedence without mutating catalog or publishing missing decks", () => {
  const updated = applyStatusOverrides(catalog, [
    { courseId: "brewing", level: "Foundation", status: "ready" },
    { courseId: "unknown", level: "Foundation", status: "ready" },
  ]);
  assert.equal(catalog.courses.find(c => c.id === "brewing").levels[0].status, "review");
  assert.equal(updated.courses.find(c => c.id === "brewing").levels[0].status, "ready");
  assert.equal(visibleCatalog(updated, decks, "student").courses.flatMap(c => c.levels).filter(l => l.deck).length, 1);
  const closed = applyStatusOverrides(updated, [{ courseId: "brewing", level: "Foundation", status: "review" }]);
  assert.equal(deckForViewer(closed, decks, "student", "brewing", "Foundation"), null);
  const missing = { program: "test", courses: [{ id: "empty", name: "Empty", ko: "", levels: [{ level: "Foundation", deck: null, status: "planned" }] }] };
  assert.equal(applyStatusOverrides(missing, [{ courseId: "empty", level: "Foundation", status: "ready" }]).courses[0].levels[0].status, "planned");
  assert.equal(Object.keys(decks).length, 16);
  assert.ok(Object.values(decks).every(d => d.status === "review"));
});

test("member course grants deny all by default and never expose drafts or mutate review status", () => {
  assert.equal(applyMemberCourseAccess(catalog, []).courses.length, 0);
  const opened = applyMemberCourseAccess(catalog, ['brewing', 'unknown']);
  assert.deepEqual(opened.courses.map(c => c.id), ['brewing']);
  assert.ok(opened.courses[0].levels.every(l => l.status === 'ready'));
  assert.ok(catalog.courses[2].levels.every(l => l.status === 'review'));
  const drafts = structuredClone(catalog);
  drafts.courses.find(c => c.id === 'brewing').levels.forEach(l => l.status = 'draft');
  assert.equal(applyMemberCourseAccess(drafts, ['brewing']).courses.length, 0);
});

test("only administrators and approved students can view education materials", () => {
  assert.deepEqual(resolveEduViewer({ name: "관리자", role: "admin" }, null), { name: "관리자", role: "admin" });
  assert.deepEqual(resolveEduViewer({ name: "관리자", role: "admin" }, { name: "수강생" }), { name: "관리자", role: "admin" });
  assert.deepEqual(resolveEduViewer({ name: "강사", role: "instructor" }, { name: "수강생" }), { name: "수강생", role: "student" });
  assert.equal(resolveEduViewer({ name: "직원", role: "employee" }, null), null);
  assert.equal(resolveEduViewer(null, null), null);
});

test("students see only ready decks while administrators see drafts and reviews", () => {
  const withReady = structuredClone(catalog);
  withReady.courses.find((course) => course.id === "barista-skills").levels[0].status = "ready";

  const admin = visibleCatalog(withReady, decks, "admin");
  const student = visibleCatalog(withReady, decks, "student");
  const adminLevels = admin.courses.find((course) => course.id === "barista-skills").levels;
  const studentLevels = student.courses.find((course) => course.id === "barista-skills").levels;

  assert.ok(adminLevels.every((entry) => entry.deck));
  assert.deepEqual(studentLevels.map((entry) => entry.deck), [true, false, false]);
  assert.ok(studentLevels.slice(1).every((entry) => entry.status === "planned"));
  assert.ok(!JSON.stringify(student).includes(".json"), "file paths are not exposed");
});

test("student deck responses drop speaker notes and source memos", () => {
  const withReady = structuredClone(catalog);
  withReady.courses.find((course) => course.id === "barista-skills").levels[0].status = "ready";

  const adminDeck = deckForViewer(withReady, decks, "admin", "barista-skills", "Foundation");
  const studentDeck = deckForViewer(withReady, decks, "student", "barista-skills", "Foundation");
  assert.ok(adminDeck.slides.some((slide) => slide.notes));
  assert.ok(adminDeck.sourceNote);
  assert.ok(studentDeck);
  assert.equal(studentDeck.sourceNote, undefined);
  assert.equal(studentDeck.sources, undefined);
  assert.ok(studentDeck.slides.every((slide) => !("notes" in slide)));
  assert.equal(studentDeck.slides.length, adminDeck.slides.length);

  assert.equal(deckForViewer(withReady, decks, "student", "barista-skills", "Intermediate"), null);
  assert.equal(deckForViewer(withReady, decks, "admin", "barista-skills", "Unknown"), null);
  assert.equal(deckForViewer(withReady, decks, "admin", "../catalog", "Foundation"), null);
});

test("every catalog deck is registered on the server, valid and renderable", () => {
  const registry = readFileSync(new URL("decks.ts", root), "utf8");
  const known = new Set([...LAYOUTS, "quiz"]);
  for (const course of catalog.courses) {
    for (const entry of course.levels) {
      if (!entry.deck) {
        assert.equal(entry.status, "planned");
        continue;
      }
      assert.ok(existsSync(new URL(`decks/${entry.deck}`, root)), entry.deck);
      assert.ok(registry.includes(`./decks/${entry.deck}`), `${entry.deck} is imported in decks.ts`);
      const deck = decks[deckKey(course.id, entry.level)];
      assert.equal(deck.level, entry.level);
      assert.equal(deck.course, course.name);
      for (const slide of deck.slides) {
        assert.ok(known.has(slide.layout), `${entry.deck}: unknown layout ${slide.layout}`);
        if (slide.layout === "quiz") assert.ok(slide.questions.every((item) => item.q && item.a));
      }
      const laid = layoutDeck(deck);
      assert.ok(laid.length >= deck.slides.length);
      for (const slide of laid) {
        for (const shape of slide.shapes) {
          assert.ok(shape.t !== "text" || shape.size >= 10, `${entry.deck}: text too small on "${slide.title}"`);
          if (shape.t !== "line") assert.ok(shape.y >= 0 && shape.x >= 0, `${entry.deck}: shape outside slide on "${slide.title}"`);
        }
      }
    }
  }
});

test("deck JSON stays out of public assets and client components", () => {
  assert.ok(!existsSync(new URL("../public/decks", import.meta.url)));
  const componentDir = new URL("../app/components/", import.meta.url);
  for (const file of readdirSync(componentDir)) {
    const source = readFileSync(new URL(file, componentDir), "utf8");
    assert.ok(!source.includes("sca-edu/decks"), `${file} must not import deck data`);
  }
});

test("16 teaching charts preserve original slides, review state, numbers and editable exports", () => {
  const visuals = readJson('decks/visuals.json');
  assert.equal(visuals.length, 16);
  const composed = withVisuals(decks, visuals);
  for (const addition of visuals) {
    const original = decks[addition.deckKey], output = composed[addition.deckKey];
    assert.equal(output.status, 'review');
    assert.equal(output.slides.length, original.slides.length + 1);
    assert.deepEqual(output.slides.filter(s => s.layout !== 'chart'), original.slides);
    assert.match(addition.slide.note, /예시|예제|가상|교재|우연|산술 연습/);
    const laid = layoutDeck(output).find(s => s.layout === 'chart');
    const chart = laid.shapes.find(s => s.t === 'chart');
    assert.ok(chartSvg(chart.chart).includes('role="img"'));
    assert.ok(!chartSvg(chart.chart).includes('NaN'));
    for(const sh of laid.shapes){
      if(sh.t === 'line') continue;
      assert.ok(sh.x >= 0 && sh.y >= 0 && sh.x + sh.w <= 13.334 && sh.y + sh.h <= 7.5);
      if(sh.t === 'text') assert.ok(sh.size >= 14 || sh.y > 6.9);
    }
    let native;
    addPptxChart({ addChart: (type,data,opts) => native = {type,data,opts} }, { ChartType:{bar:'bar',line:'line',scatter:'scatter',radar:'radar'} }, chart, 'Pretendard');
    assert.equal(native.type, chart.chart.kind);
    const actual = chart.chart.kind === 'scatter' ? native.data.slice(1) : native.data;
    assert.deepEqual(actual.map(s => s.values), chart.chart.series.map(s => s.values));
    assert.equal(native.opts.valAxisMaxVal, chart.chart.max);
  }
  const byId = key => visuals.find(v => v.deckKey === key).slide.chart;
  assert.equal(byId('barista-skills/Professional').series[0].values.reduce((a,b)=>a+b), 1300);
  assert.equal(byId('roasting/Professional').series[0].values.reduce((a,b)=>a+b), 16368);
  assert.equal(byId('green-coffee/Foundation').series[0].values.reduce((a,b)=>a+b), 100);
  assert.equal(byId('brewing/Intermediate').xValues[0], 320 * 1.28 / 20);
});

test('PowerPoint export removes dangling master declarations without removing valid parts',()=>{
  const xml='<Types><Default Extension="xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="master"/><Override PartName="/ppt/slideMasters/slideMaster2.xml" ContentType="master"/><Override PartName="/ppt/slides/slide2.xml" ContentType="slide"/></Types>';
  const result=pruneMissingContentTypes(xml,new Set(['ppt/slideMasters/slideMaster1.xml','ppt/slides/slide2.xml']));
  assert.ok(result.includes('slideMaster1.xml'));
  assert.ok(result.includes('slide2.xml'));
  assert.ok(result.includes('<Default'));
  assert.ok(!result.includes('slideMaster2.xml'));
});
