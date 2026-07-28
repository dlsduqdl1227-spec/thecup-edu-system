import assert from "node:assert/strict";
import test from "node:test";

import { compareInventoryItems } from "../lib/inventory-sort.ts";

function item(overrides) {
  return {
    name: "품목",
    expiryDate: null,
    unit: "g",
    quantity: 0,
    reorderLevel: 0,
    lowStock: 0,
    ...overrides,
  };
}

test("expiry sorting shows the nearest dated stock first and undated stock last", () => {
  const rows = [
    item({ name: "날짜 없음" }),
    item({ name: "나중", expiryDate: "2027-03-09T01:32:10Z" }),
    item({ name: "먼저", expiryDate: "2026-12-01" }),
  ];
  rows.sort((left, right) => compareInventoryItems(left, right, "expiry"));
  assert.deepEqual(rows.map((row) => row.name), ["먼저", "나중", "날짜 없음"]);
});

test("quantity sorting normalizes grams and kilograms in both directions", () => {
  const rows = [
    item({ name: "46kg", unit: "kg", quantity: 46 }),
    item({ name: "900g", unit: "g", quantity: 900 }),
  ];
  assert.deepEqual(
    [...rows].sort((left, right) => compareInventoryItems(left, right, "quantityAsc")).map((row) => row.name),
    ["900g", "46kg"],
  );
  assert.deepEqual(
    [...rows].sort((left, right) => compareInventoryItems(left, right, "quantityDesc")).map((row) => row.name),
    ["46kg", "900g"],
  );
});

test("attention sorting prioritizes low stock and the smallest reorder ratio", () => {
  const rows = [
    item({ name: "정상", quantity: 20, reorderLevel: 5, lowStock: 0 }),
    item({ name: "부족2", quantity: 4, reorderLevel: 5, lowStock: 1 }),
    item({ name: "부족1", quantity: 1, reorderLevel: 5, lowStock: 1 }),
  ];
  rows.sort((left, right) => compareInventoryItems(left, right, "attention"));
  assert.deepEqual(rows.map((row) => row.name), ["부족1", "부족2", "정상"]);
});
