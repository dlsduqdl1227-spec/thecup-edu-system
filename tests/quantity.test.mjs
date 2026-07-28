import assert from "node:assert/strict";
import test from "node:test";

import {
  formatBeanAmount,
  formatBeanQuantity,
  formatInventoryAmount,
  formatInventoryQuantity,
  formatSignedInventoryQuantity,
  inventoryQuantityInKilograms,
  kilogramsToInventoryQuantity,
} from "../lib/quantity.ts";
import { inventoryQuantitySortValue } from "../lib/inventory-sort.ts";

test("large gram quantities are presented as readable kilograms everywhere", () => {
  assert.deepEqual(formatInventoryAmount(46_000, "g"), { value: "46", unit: "kg" });
  assert.equal(formatInventoryQuantity(46_000, "g"), "46kg");
  assert.equal(formatSignedInventoryQuantity(-4_000, "g"), "-4kg");
  assert.equal(formatInventoryQuantity(950, "g"), "950g");
  assert.equal(formatInventoryQuantity(15, "kg"), "15kg");
});

test("roasted bean usage is entered and displayed consistently in kilograms", () => {
  assert.equal(kilogramsToInventoryQuantity(0.5, "g"), 500);
  assert.equal(kilogramsToInventoryQuantity(1, "kg"), 1);
  assert.equal(inventoryQuantityInKilograms(500, "g"), 0.5);
  assert.deepEqual(formatBeanAmount(500, "g"), { value: "0.5", unit: "kg" });
  assert.equal(formatBeanQuantity(-500, "g", true), "-0.5kg");
  assert.equal(formatBeanQuantity(1, "kg"), "1kg");
});

test("inventory quantity sorting compares equivalent units consistently", () => {
  assert.equal(inventoryQuantitySortValue(46, "kg"), 46_000);
  assert.equal(inventoryQuantitySortValue(900, "g"), 900);
  assert.equal(inventoryQuantitySortValue(1.5, "L"), 1_500);
  assert.equal(inventoryQuantitySortValue(12, "개"), 12);
});
