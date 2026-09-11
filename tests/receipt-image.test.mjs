import assert from "node:assert/strict";
import test from "node:test";
import { optimizeReceipt, validateReceiptSource } from "../lib/receipt-image.ts";

test("album photos without MIME metadata are accepted; empty, oversized and document files are rejected", () => {
  assert.doesNotThrow(() => validateReceiptSource(new File(["photo"], "album.JPG")));
  assert.doesNotThrow(() => validateReceiptSource(new File(["photo"], "camera.heic", { type: "image/heic" })));
  assert.throws(() => validateReceiptSource(new File([], "empty.jpg", { type: "image/jpeg" })), /내용이 없는/);
  assert.throws(() => validateReceiptSource(new File(["%PDF"], "receipt.pdf", { type: "application/pdf" })), /사진을 선택/);
  assert.throws(() => validateReceiptSource(new File(["<svg/>"], "receipt.svg", { type: "image/svg+xml" })), /사진을 선택/);
  assert.throws(() => validateReceiptSource({ size: 20_000_001, type: "image/jpeg" }), /20MB/);
});

function mockCanvas(t, { bytes = 20_000, broken = false, contextMissing = false } = {}) {
  const draws = [];
  let closed = false;
  const context = { fillRect() {}, drawImage(_source, _x, _y, width, height) { draws.push([width, height]); } };
  const canvas = { width: 0, height: 0, getContext: () => contextMissing ? null : context, toBlob(callback) { callback(broken ? null : new Blob([new Uint8Array(bytes)], { type: "image/jpeg" })); } };
  t.mock.method(globalThis, "fetch", () => { throw new Error("Image processing must remain on the device"); });
  const originalBitmap = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: async (_file, options) => {
    assert.equal(options.imageOrientation, "from-image");
    return { width: 2400, height: 4800, close() { closed = true; } };
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
  t.after(() => {
    if (originalBitmap) Object.defineProperty(globalThis, "createImageBitmap", originalBitmap); else delete globalThis.createImageBitmap;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else delete globalThis.document;
  });
  return { canvas, draws, closed: () => closed };
}

test("receipt compression preserves aspect ratio, produces a bounded JPEG and releases memory", async (t) => {
  const environment = mockCanvas(t);
  const file = await optimizeReceipt(new File(["photo"], "album.png", { type: "image/png" }));
  assert.equal(file.type, "image/jpeg");
  assert.ok(file.size <= 400_000);
  assert.deepEqual(environment.draws, [[900, 1800]]);
  assert.equal(environment.closed(), true);
  assert.equal(environment.canvas.width, 0);
});

test("conversion failure still releases the decoded image", async (t) => {
  const environment = mockCanvas(t, { broken: true });
  await assert.rejects(optimizeReceipt(new File(["photo"], "photo.jpg", { type: "image/jpeg" })), /변환에 실패/);
  assert.equal(environment.closed(), true);
  assert.equal(environment.canvas.height, 0);
});

test("canvas initialization failure also releases the decoded image", async (t) => {
  const environment = mockCanvas(t, { contextMissing: true });
  await assert.rejects(optimizeReceipt(new File(["photo"], "photo.jpg", { type: "image/jpeg" })), /최적화할 수 없습니다/);
  assert.equal(environment.closed(), true);
});

test("oversized output never reaches upload and compression attempts stay bounded", async (t) => {
  const environment = mockCanvas(t, { bytes: 450_000 });
  await assert.rejects(optimizeReceipt(new File(["photo"], "photo.jpg", { type: "image/jpeg" })), /400KB/);
  assert.equal(environment.draws.length, 8);
  assert.equal(environment.closed(), true);
});
