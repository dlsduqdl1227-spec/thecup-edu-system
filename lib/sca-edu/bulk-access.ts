export const MAX_BULK_MEMBERS = 100;
export const MAX_BULK_LEVELS = 24;
export type LevelSelection = { courseId: string; level: string };
export type BulkAccessInput = { memberIds: number[]; levels: LevelSelection[]; enabled: boolean };

export function parseBulkAccess(value: unknown): BulkAccessInput {
  if (!value || typeof value !== "object") throw new Error("선택한 수강생과 레벨을 확인해 주세요.");
  const input = value as Record<string, unknown>;
  if (typeof input.enabled !== "boolean") throw new Error("승인 또는 해제를 선택해 주세요.");
  if (!Array.isArray(input.memberIds) || !input.memberIds.length || input.memberIds.length > MAX_BULK_MEMBERS
    || input.memberIds.some(id => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error(`수강생을 1~${MAX_BULK_MEMBERS}명 선택해 주세요.`);
  }
  if (!Array.isArray(input.levels) || !input.levels.length || input.levels.length > MAX_BULK_LEVELS) {
    throw new Error("과목의 레벨을 하나 이상 선택해 주세요.");
  }
  const levels = new Map<string, LevelSelection>();
  for (const row of input.levels) {
    if (!row || typeof row !== "object" || typeof row.courseId !== "string" || typeof row.level !== "string"
      || !/^[a-z0-9-]{1,40}$/.test(row.courseId) || !/^[A-Za-z]{1,20}$/.test(row.level)) {
      throw new Error("과목과 레벨 형식이 올바르지 않습니다.");
    }
    levels.set(`${row.courseId}/${row.level}`, { courseId: row.courseId, level: row.level });
  }
  return { memberIds: [...new Set(input.memberIds)], levels: [...levels.values()], enabled: input.enabled };
}
