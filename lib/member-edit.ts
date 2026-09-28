// 관리자 화면의 "수강생 정보 수정"에서 쓰는 순수 함수. D1에 의존하지 않아 단위 테스트할 수 있다.

export type EditableMember = {
  name: string;
  phoneHash: string;
  phoneLast4: string;
  desiredStationType: string;
  consultationMemo: string;
  adminMemo: string;
};

/** 로그인과 같은 규칙: 앞뒤 공백 제거, 연속 공백은 한 칸. */
export function normalizeMemberName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new Error("이름을 입력해 주세요.");
  if (name.length > 40) throw new Error("이름이 너무 깁니다.");
  return name;
}

/** 희망 스테이션 유형: 비우거나, 스테이션 유형과 같은 영문 대문자 코드. */
export function normalizeStationType(value: unknown): string {
  const type = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!type) return "";
  if (type.length > 40 || !/^[A-Z][A-Z0-9_]*$/.test(type)) throw new Error("희망 스테이션 유형이 올바르지 않습니다.");
  return type;
}

/** 무엇이 바뀌었는지 한국어 항목 이름으로 돌려준다. 전체 휴대폰 번호는 절대 포함하지 않는다. */
export function describeMemberChanges(before: EditableMember, after: EditableMember): string[] {
  const changes: string[] = [];
  if (before.name !== after.name) changes.push("이름");
  if (before.phoneHash !== after.phoneHash) changes.push(`휴대폰(뒷자리 ${after.phoneLast4})`);
  if (before.desiredStationType !== after.desiredStationType) changes.push("희망 스테이션");
  if (before.consultationMemo !== after.consultationMemo) changes.push("상담 메모");
  if (before.adminMemo !== after.adminMemo) changes.push("관리자 메모");
  return changes;
}

/** 이름이나 번호가 바뀌면 기존 로그인 세션을 끊고 새 정보로 다시 로그인하게 한다. */
export function loginChanged(before: EditableMember, after: EditableMember): boolean {
  return before.name !== after.name || before.phoneHash !== after.phoneHash;
}
