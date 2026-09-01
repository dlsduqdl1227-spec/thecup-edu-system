import assert from "node:assert/strict";
import test from "node:test";

import {
  courseStatusLabel,
  deriveCourseOpeningStatus,
  openingProgress,
  validateCourseMonth,
} from "../lib/course-openings.ts";

test("course opening status follows waiting, openable, full and closed rules", () => {
  assert.equal(deriveCourseOpeningStatus({ currentApplicants: 4, openingMinimum: 6, capacity: 12, statusOverride: "AUTO" }), "WAITING");
  assert.equal(deriveCourseOpeningStatus({ currentApplicants: 6, openingMinimum: 6, capacity: 12, statusOverride: "AUTO" }), "OPENABLE");
  assert.equal(deriveCourseOpeningStatus({ currentApplicants: 12, openingMinimum: 6, capacity: 12, statusOverride: "AUTO" }), "FULL");
  assert.equal(deriveCourseOpeningStatus({ currentApplicants: 12, openingMinimum: 6, capacity: 12, statusOverride: "CLOSED" }), "CLOSED");
});

test("course opening progress and Korean status labels are guest-friendly", () => {
  assert.equal(openingProgress(4, 6), 67);
  assert.equal(openingProgress(8, 6), 100);
  assert.equal(courseStatusLabel("WAITING", 2), "개강까지 2명");
  assert.equal(courseStatusLabel("OPENABLE", 0), "개강 가능");
  assert.equal(courseStatusLabel("FULL", 0), "모집 마감");
  assert.equal(courseStatusLabel("CLOSED", 0), "접수 종료");
});

test("course month accepts only exact year-month values", () => {
  assert.equal(validateCourseMonth("2026-09"), "2026-09");
  assert.throws(() => validateCourseMonth("2026-13"));
  assert.throws(() => validateCourseMonth("current"));
});
