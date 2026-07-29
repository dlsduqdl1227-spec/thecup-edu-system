export function blobResponseBody(value: unknown): ArrayBuffer {
  let source: Uint8Array;
  if (value instanceof ArrayBuffer) {
    source = new Uint8Array(value);
  } else if (ArrayBuffer.isView(value)) {
    source = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  } else if (
    Array.isArray(value)
    && value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    source = Uint8Array.from(value);
  } else {
    throw new Error("저장된 이미지 데이터를 읽을 수 없습니다.");
  }

  const body = new Uint8Array(source.byteLength);
  body.set(source);
  return body.buffer;
}
