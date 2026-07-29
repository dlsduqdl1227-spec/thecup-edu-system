import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../lib/compliance.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const compliance = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("calculates the requested self-quality and hygiene due dates", () => {
  assert.equal(compliance.nextComplianceDueDate("2026-05-27", 9), "2027-02-27");
  assert.equal(compliance.nextComplianceDueDate("2026-05-20", 12), "2027-05-20");
  assert.equal(compliance.daysUntilDate("2027-02-27", "2026-07-29"), 213);
});

test("clamps month-end dates and formats upcoming, today and overdue D-days", () => {
  assert.equal(compliance.nextComplianceDueDate("2026-05-31", 9), "2027-02-28");
  assert.equal(compliance.formatDday(30), "D-30");
  assert.equal(compliance.formatDday(0), "D-DAY");
  assert.equal(compliance.formatDday(-3), "D+3");
});

test("rejects invalid compliance dates and intervals", () => {
  assert.throws(
    () => compliance.nextComplianceDueDate("2026-02-30", 9),
    /존재하지 않는 날짜/,
  );
  assert.throws(
    () => compliance.nextComplianceDueDate("2026-05-27", 0),
    /점검 주기/,
  );
});
