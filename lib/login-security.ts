import { getD1 } from "./db";

export type LoginAudience = "operator" | "student";
export type LoginSecurity = { version: string; digest: string };
const settingKey = (audience: LoginAudience) => `auth_security_${audience}`;

export function validateSecurityCode(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4,32}$/.test(value)) {
    throw new Error("보안코드는 숫자 4~32자리로 입력해 주세요.");
  }
  return value; // Keep leading zeros, including an all-zero code.
}

async function digestCode(audience: LoginAudience, version: string, code: string): Promise<string> {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 24) throw new Error("로그인 보안 설정을 확인해 주세요.");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(`login-security:${audience}:${version}:${code}`));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function makeLoginSecurity(audience: LoginAudience, code: unknown): Promise<LoginSecurity> {
  const version = crypto.randomUUID();
  return { version, digest: await digestCode(audience, version, validateSecurityCode(code)) };
}

export async function readLoginSecurity(audience: LoginAudience): Promise<LoginSecurity> {
  const db = getD1();
  let row = await db.prepare("SELECT value FROM app_settings WHERE key = ?").bind(settingKey(audience)).first<{ value: string }>();
  if (!row) {
    // Initial values are deployment secrets, never client defaults or source literals.
    const initial = audience === "operator" ? process.env.OPERATOR_INITIAL_SECURITY_CODE : process.env.STUDENT_INITIAL_SECURITY_CODE;
    if (!initial) throw new Error("보안코드가 설정되지 않았습니다. 관리자에게 문의해 주세요.");
    const config = await makeLoginSecurity(audience, initial);
    await db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)").bind(settingKey(audience), JSON.stringify(config)).run();
    row = await db.prepare("SELECT value FROM app_settings WHERE key = ?").bind(settingKey(audience)).first<{ value: string }>();
  }
  const config = JSON.parse(row?.value ?? "null") as LoginSecurity | null;
  if (!config || !/^[0-9a-f-]{36}$/.test(config.version) || !/^[0-9a-f]{64}$/.test(config.digest)) {
    throw new Error("로그인 보안 설정을 확인해 주세요.");
  }
  return config;
}

export async function matchesSecurityCode(audience: LoginAudience, value: unknown, config: LoginSecurity): Promise<boolean> {
  if (typeof value !== "string" || !/^\d{4,32}$/.test(value)) return false;
  const actual = await digestCode(audience, config.version, value);
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) mismatch |= actual.charCodeAt(i) ^ config.digest.charCodeAt(i);
  return mismatch === 0;
}

export async function rotateLoginSecurity(audience: LoginAudience, previous: LoginSecurity, code: unknown, actorId?: number): Promise<boolean> {
  const next = await makeLoginSecurity(audience, code);
  const db = getD1();
  const update = db.prepare("UPDATE app_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ? AND value = ?")
    .bind(JSON.stringify(next), settingKey(audience), JSON.stringify(previous));
  if (actorId === undefined) return Number((await update.run()).meta.changes) === 1;
  // A failure must leave both the old code and audit history unchanged.
  const results = await db.batch([
    update,
    db.prepare("INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail) SELECT ?, 'change_login_security_code', 'app_setting', ?, ? WHERE EXISTS (SELECT 1 FROM app_settings WHERE key = ? AND value = ?)")
      .bind(actorId, settingKey(audience), `${audience === "operator" ? "운영자" : "수강생"} 보안코드 변경`, settingKey(audience), JSON.stringify(next)),
    db.prepare("DELETE FROM login_attempts WHERE identifier_hash = ?").bind(`security-change:${actorId}`),
  ]);
  return Number(results[0].meta.changes) === 1;
}

export async function hasCurrentSecurityVersion(audience: LoginAudience, token: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) return false;
  return token.startsWith(`${(await readLoginSecurity(audience)).version}.`);
}
