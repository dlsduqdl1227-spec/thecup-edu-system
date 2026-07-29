import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../lib/blob-response.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const blobs = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("returns browser-safe image bytes from D1 ArrayBuffers", () => {
  const sourceBuffer = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]).buffer;
  const result = blobs.blobResponseBody(sourceBuffer);

  assert.ok(result instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(result)], [0xff, 0xd8, 0xff, 0xe0]);
});

test("normalizes D1 byte arrays without turning them into text", () => {
  const result = blobs.blobResponseBody([0x89, 0x50, 0x4e, 0x47]);

  assert.deepEqual([...new Uint8Array(result)], [0x89, 0x50, 0x4e, 0x47]);
  assert.throws(() => blobs.blobResponseBody([999]), /이미지 데이터를 읽을 수 없습니다/);
});
