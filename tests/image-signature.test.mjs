import assert from "node:assert/strict";
import test from "node:test";

import { hasValidImageSignature } from "../lib/image-signature.ts";

function bytes(values) {
  return Uint8Array.from(values).buffer;
}

test("receipt validation accepts real JPEG, PNG and WebP headers", () => {
  assert.equal(hasValidImageSignature(bytes([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"), true);
  assert.equal(hasValidImageSignature(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"), true);
  assert.equal(hasValidImageSignature(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), "image/webp"), true);
});

test("receipt validation rejects renamed or mismatched files", () => {
  assert.equal(hasValidImageSignature(bytes([0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74]), "image/jpeg"), false);
  assert.equal(hasValidImageSignature(bytes([0xff, 0xd8, 0xff, 0xe0]), "image/png"), false);
  assert.equal(hasValidImageSignature(bytes([0x89, 0x50, 0x4e, 0x47]), "text/plain"), false);
});
