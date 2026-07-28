import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";

import { createXlsxWorkbook, xlsxResponse } from "../lib/xlsx.ts";

test("creates a real multi-sheet Excel workbook with safe inline values", async () => {
  const workbook = createXlsxWorkbook([
    {
      name: "월별 매출",
      columns: ["연도", "매출"],
      rows: [[2026, 25_069_000]],
    },
    {
      name: "재고 기록",
      columns: ["품목", "수량"],
      rows: [["=위험한 수식", 0.5]],
    },
  ]);
  const files = unzipSync(workbook);
  assert.ok(files["[Content_Types].xml"]);
  assert.ok(files["xl/workbook.xml"]);
  assert.ok(files["xl/worksheets/sheet1.xml"]);
  assert.ok(files["xl/worksheets/sheet2.xml"]);
  assert.match(strFromU8(files["xl/workbook.xml"]), /월별 매출/);
  assert.match(strFromU8(files["xl/worksheets/sheet2.xml"]), /t="inlineStr"/);
  assert.match(strFromU8(files["xl/worksheets/sheet2.xml"]), /=위험한 수식/);

  const response = xlsxResponse("테스트.xlsx", [{ name: "자료", columns: ["값"], rows: [[1]] }]);
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assert.match(response.headers.get("content-disposition") ?? "", /attachment/);
  assert.ok((await response.arrayBuffer()).byteLength > 500);
});
