import {
  ensureDatabase,
  getD1,
  type SessionUser,
  type StaffPermission,
  type StaffRole,
} from "./db";

const SESSION_COOKIE = "thecup_session";
const SESSION_DAYS = 30;
const LOGIN_WINDOW_MINUTES = 15;
const MAX_LOGIN_ATTEMPTS = 5;

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 11 || !digits.startsWith("01")) {
    throw new Error("휴대폰 번호를 정확히 입력해 주세요.");
  }
  return digits;
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function phoneHash(phone: string): Promise<string> {
  return sha256(`${getSessionSecret()}:${normalizePhone(phone)}`);
}

export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

export async function createSession(staffId: number): Promise<{ token: string; expiresAt: string }> {
  const token = createSessionToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  const db = getD1();
  await db
    .prepare(
      "INSERT INTO sessions (token_hash, staff_id, expires_at) VALUES (?, ?, ?)",
    )
    .bind(tokenHash, staffId, expiresAt)
    .run();
  return { token, expiresAt };
}

export async function destroySession(request: Request): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;
  await ensureDatabase();
  await getD1()
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(await sha256(token))
    .run();
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  await ensureDatabase();
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await getD1()
    .prepare(
      `SELECT s.id, s.name, s.role,
              s.can_finance AS canFinance,
              s.can_inventory AS canInventory,
              s.can_roasting AS canRoasting
       FROM sessions x
       JOIN staff s ON s.id = x.staff_id
       WHERE x.token_hash = ? AND x.expires_at > ?
         AND s.active = 1 AND s.deleted_at IS NULL`,
    )
    .bind(await sha256(token), new Date().toISOString())
    .first<{
      id: number;
      name: string;
      role: StaffRole;
      canFinance: number;
      canInventory: number;
      canRoasting: number;
    }>();
  return row ? normalizeSessionUser(row) : null;
}

export async function requirePermission(
  request: Request,
  permission: StaffPermission,
): Promise<SessionUser> {
  const user = await requireUser(request);
  const allowed =
    permission === "finance"
      ? user.canFinance
      : permission === "inventory"
        ? user.canInventory
        : user.canRoasting;
  if (!allowed) throw new AuthError("이 메뉴를 사용할 권한이 없습니다.", 403);
  return user;
}

export function normalizeSessionUser(row: {
  id: number;
  name: string;
  role: StaffRole;
  canFinance: number | boolean;
  canInventory: number | boolean;
  canRoasting: number | boolean;
}): SessionUser {
  const administrator = row.role === "admin";
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    canFinance: administrator || Boolean(row.canFinance),
    canInventory: administrator || Boolean(row.canInventory),
    canRoasting: administrator || Boolean(row.canRoasting),
  };
}

export async function requireUser(
  request: Request,
  roles?: StaffRole[],
): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw new AuthError("로그인이 필요합니다.", 401);
  if (roles && !roles.includes(user.role)) {
    throw new AuthError("이 기능을 사용할 권한이 없습니다.", 403);
  }
  return user;
}

export function sessionCookie(token: string, expiresAt: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${new Date(
    expiresAt,
  ).toUTCString()}${secure}`;
}

export function expiredSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function getBootstrapCode(): string {
  const value = process.env.BOOTSTRAP_CODE?.trim();
  if (!value) throw new Error("초기 관리자 코드가 설정되지 않았습니다.");
  return value;
}

function getSessionSecret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value || value.length < 24) {
    throw new Error("세션 보안 키가 올바르게 설정되지 않았습니다.");
  }
  return value;
}

export function verifyCode(input: string, expected: string): boolean {
  if (input.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < input.length; index += 1) {
    mismatch |= input.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function assertLoginAllowed(identifierHash: string): Promise<void> {
  const db = getD1();
  const now = Date.now();
  const row = await db
    .prepare("SELECT window_start, attempt_count FROM login_attempts WHERE identifier_hash = ?")
    .bind(identifierHash)
    .first<{ window_start: string; attempt_count: number }>();
  if (!row) return;
  const age = now - new Date(row.window_start).getTime();
  if (age < LOGIN_WINDOW_MINUTES * 60000 && row.attempt_count >= MAX_LOGIN_ATTEMPTS) {
    throw new AuthError("로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.", 429);
  }
}

export async function recordLoginFailure(identifierHash: string): Promise<void> {
  const db = getD1();
  const now = new Date();
  const row = await db
    .prepare("SELECT window_start, attempt_count FROM login_attempts WHERE identifier_hash = ?")
    .bind(identifierHash)
    .first<{ window_start: string; attempt_count: number }>();
  const expired =
    !row || now.getTime() - new Date(row.window_start).getTime() >= LOGIN_WINDOW_MINUTES * 60000;
  if (expired) {
    await db
      .prepare(
        `INSERT INTO login_attempts (identifier_hash, window_start, attempt_count)
         VALUES (?, ?, 1)
         ON CONFLICT(identifier_hash) DO UPDATE SET window_start = excluded.window_start, attempt_count = 1`,
      )
      .bind(identifierHash, now.toISOString())
      .run();
  } else {
    await db
      .prepare(
        "UPDATE login_attempts SET attempt_count = attempt_count + 1 WHERE identifier_hash = ?",
      )
      .bind(identifierHash)
      .run();
  }
}

export async function clearLoginFailures(identifierHash: string): Promise<void> {
  await getD1()
    .prepare("DELETE FROM login_attempts WHERE identifier_hash = ?")
    .bind(identifierHash)
    .run();
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
