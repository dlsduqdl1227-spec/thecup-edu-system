import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../lib/legacy-inventory.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const legacy = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("restores legacy green inventory by item and lot", () => {
  const rows = [
    row({
      amount_mkg: 22000,
      type: "입고",
      expiry_date: "2027-03-09T01:32:10Z",
    }),
    row({ amount_mkg: -500, type: "로스팅" }),
    row({ amount_mkg: -500, type: "로스팅" }),
    row({ amount_mkg: -2000, type: "로스팅" }),
  ];

  const [summary] = legacy.summarizeLegacyInventory(rows);
  assert.equal(summary.name, "아마티보 라프론테라");
  assert.equal(summary.lot, "25.03.09");
  assert.equal(summary.quantity, 19);
  assert.equal(summary.unit, "kg");
  assert.equal(summary.process, "에너로빅 워시드");
  assert.equal(summary.expiryDate, "2027-03-09");
});

test("shows only valid calendar dates from legacy timestamps", () => {
  assert.equal(legacy.toDateOnly("2027-03-09T01:32:10Z"), "2027-03-09");
  assert.equal(legacy.toDateOnly("not-a-date"), null);
});

test("converts legacy Gusto millikilograms to grams", () => {
  const rows = [
    row({ item: "구스토커피 원두", lot: "26.06.04", category: "ROASTED", amount_mkg: 50000 }),
    row({ item: "구스토커피 원두", lot: "26.06.04", category: "GREEN", amount_mkg: -10000 }),
  ];

  const [summary] = legacy.summarizeLegacyInventory(rows);
  assert.equal(summary.category, "gusto");
  assert.equal(summary.quantity, 40000);
  assert.equal(summary.unit, "g");
});

function row(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    created_at: "2026-07-24T00:00:00Z",
    item: "아마티보 라프론테라",
    lot: "25.03.09",
    type: "입고",
    amount_mkg: 0,
    expiry_date: null,
    process: "에너로빅 워시드",
    category: "GREEN",
    ...overrides,
  };
}
