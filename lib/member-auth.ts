import {
  AuthError,
  createSessionToken,
  sha256,
} from "./auth";
import type { MemberSession } from "./booking";
import { ensureDatabase, getD1 } from "./db";

const MEMBER_SESSION_COOKIE = "thecup_member_session";
const MEMBER_SESSION_DAYS = 30;

export async function createMemberSession(memberId: number): Promise<{ token: string; expiresAt: string }> {
  const token = createSessionToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + MEMBER_SESSION_DAYS * 86400000).toISOString();
  await getD1()
    .prepare(
      "INSERT INTO member_sessions (token_hash, member_id, expires_at) VALUES (?, ?, ?)",
    )
    .bind(tokenHash, memberId, expiresAt)
    .run();
  return { token, expiresAt };
}

export async function getMemberSession(request: Request): Promise<MemberSession | null> {
  await ensureDatabase();
  const token = readCookie(request, MEMBER_SESSION_COOKIE);
  if (!token) return null;
  const row = await getD1()
    .prepare(
      `SELECT m.id, m.name, m.approval_status AS approvalStatus
       FROM member_sessions s
       JOIN booking_members m ON m.id = s.member_id
       WHERE s.token_hash = ? AND s.expires_at > ?
         AND m.approval_status = 'APPROVED' AND m.deleted_at IS NULL`,
    )
    .bind(await sha256(token), new Date().toISOString())
    .first<MemberSession>();
  return row ?? null;
}

export async function requireMember(request: Request): Promise<MemberSession> {
  const member = await getMemberSession(request);
  if (!member) throw new AuthError("상담 후 승인된 회원 로그인이 필요합니다.", 401);
  return member;
}

export async function destroyMemberSession(request: Request): Promise<void> {
  const token = readCookie(request, MEMBER_SESSION_COOKIE);
  if (!token) return;
  await ensureDatabase();
  await getD1()
    .prepare("DELETE FROM member_sessions WHERE token_hash = ?")
    .bind(await sha256(token))
    .run();
}

export function memberSessionCookie(token: string, expiresAt: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${MEMBER_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${new Date(
    expiresAt,
  ).toUTCString()}${secure}`;
}

export function expiredMemberSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${MEMBER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}
