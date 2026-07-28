const signatures = {
  "image/jpeg": (bytes: Uint8Array) =>
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes: Uint8Array) =>
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a,
  "image/webp": (bytes: Uint8Array) =>
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
} satisfies Record<string, (bytes: Uint8Array) => boolean>;

export function hasValidImageSignature(data: ArrayBuffer, contentType: string): boolean {
  const validator = signatures[contentType as keyof typeof signatures];
  return Boolean(validator?.(new Uint8Array(data)));
}
