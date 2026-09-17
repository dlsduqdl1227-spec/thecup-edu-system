import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  deckForViewer,
  deckKey,
  resolveEduViewer,
  visibleCatalog,
} from "../lib/sca-edu/catalog.ts";
import { LAYOUTS, layoutDeck } from "../lib/sca-edu/layouts.js";

const root = new URL("../lib/sca-edu/", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const catalog = readJson("decks/catalog.json");
const decks = {};
for (const course of catalog.courses) {
  for (const entry of course.levels) {
    if (entry.deck) decks[deckKey(course.id, entry.level)] = readJson(`decks/${entry.deck}`);
  }
}

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
