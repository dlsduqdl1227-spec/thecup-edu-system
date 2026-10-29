// Encryption is purpose-separated from login hashing; never log plaintext contacts.
async function key() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 24) throw new Error("상담 연락처 보안 설정을 확인해 주세요.");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`thecup-consultation-v1:${secret}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptContact(phone: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(phone)));
  return `v1.${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...bytes))}`;
}
export async function decryptContact(value: string) {
  const [version, nonce, content] = value.split(".");
  if (version !== "v1" || !nonce || !content) throw new Error("상담 연락처를 복호화하지 못했습니다.");
  const iv = Uint8Array.from(atob(nonce), c => c.charCodeAt(0));
  const bytes = Uint8Array.from(atob(content), c => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await key(), bytes));
}
