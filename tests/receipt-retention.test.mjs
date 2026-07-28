import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../lib/receipt-retention.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const retention = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("keeps receipts when D1 receipt storage stays at or below 250MB", () => {
  const plan = retention.planReceiptCleanup(
    [{ movementId: 1, size: 240_000_000, createdAt: "2024-01-01" }],
    10_000_000,
  );

  assert.deepEqual(plan.movementIds, []);
  assert.equal(plan.projectedBytes, 250_000_000);
});

test("archives the oldest receipts until D1 receipt storage falls below 200MB", () => {
  const receipts = Array.from({ length: 5 }, (_, index) => ({
    movementId: index + 1,
    size: 50_000_000,
    createdAt: new Date(Date.UTC(2024, index, 1)).toISOString(),
  }));
  const plan = retention.planReceiptCleanup(receipts, 10_000_000);

  assert.deepEqual(plan.movementIds, [1, 2]);
  assert.equal(plan.bytesReclaimed, 100_000_000);
  assert.equal(plan.projectedBytes, 160_000_000);
});

test("rejects invalid incoming file sizes", () => {
  assert.throws(
    () => retention.planReceiptCleanup([], Number.NaN),
    /영수증 파일 크기/,
  );
});
