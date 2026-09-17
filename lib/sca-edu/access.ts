import { AuthError, getSessionUser } from "../auth";
import { getMemberSession } from "../member-auth";
import { resolveEduViewer, type EduViewer } from "./catalog";

/** 관리자(운영자 세션) 또는 승인 수강생(회원 세션)만 교육자료를 볼 수 있다. */
export async function requireEduViewer(request: Request): Promise<EduViewer> {
  const staff = await getSessionUser(request);
  const member = staff?.role === "admin" ? null : await getMemberSession(request);
  const viewer = resolveEduViewer(staff, member);
  if (!viewer) throw new AuthError("관리자 또는 승인된 수강생 로그인이 필요합니다.", 401);
  return viewer;
}
