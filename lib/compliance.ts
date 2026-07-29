export const COMPLIANCE_DEFINITIONS = [
  {
    key: "self_quality",
    title: "자가품질검사",
    frequencyMonths: 9,
    initialCompletedDate: "2026-05-27",
    description: "9개월마다 검사 결과와 증빙 자료를 확인합니다.",
  },
  {
    key: "hygiene_education",
    title: "위생교육",
    frequencyMonths: 12,
    initialCompletedDate: "2026-05-20",
    description: "매년 교육 이수 여부와 수료 자료를 확인합니다.",
  },
  {
    key: "health_certificate",
    title: "보건증",
    frequencyMonths: 12,
    initialCompletedDate: null,
    description: "매년 발급일과 보건증 자료를 확인합니다.",
  },
] as const;

export type ComplianceKey = (typeof COMPLIANCE_DEFINITIONS)[number]["key"];

export const MANUAL_DOCUMENT_CATEGORIES = [
  "self_quality",
  "hygiene_education",
  "health_certificate",
  "roasting",
  "packing",
] as const;

export type ManualDocumentCategory = (typeof MANUAL_DOCUMENT_CATEGORIES)[number];

export function isComplianceKey(value: unknown): value is ComplianceKey {
  return COMPLIANCE_DEFINITIONS.some((item) => item.key === value);
}

export function isManualDocumentCategory(value: unknown): value is ManualDocumentCategory {
  return MANUAL_DOCUMENT_CATEGORIES.some((category) => category === value);
}

export function nextComplianceDueDate(completedDate: string, frequencyMonths: number): string {
  const [year, month, day] = parseDateOnly(completedDate);
  if (!Number.isInteger(frequencyMonths) || frequencyMonths <= 0) {
    throw new Error("점검 주기가 올바르지 않습니다.");
  }
  const targetMonthIndex = (month - 1) + frequencyMonths;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return formatDateOnly(targetYear, targetMonth + 1, Math.min(day, lastDay));
}

export function daysUntilDate(targetDate: string, todayDate: string): number {
  const [targetYear, targetMonth, targetDay] = parseDateOnly(targetDate);
  const [todayYear, todayMonth, todayDay] = parseDateOnly(todayDate);
  const target = Date.UTC(targetYear, targetMonth - 1, targetDay);
  const today = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.round((target - today) / 86_400_000);
}

export function formatDday(days: number): string {
  if (!Number.isInteger(days)) throw new Error("D-day 날짜 차이가 올바르지 않습니다.");
  if (days > 0) return `D-${days}`;
  if (days === 0) return "D-DAY";
  return `D+${Math.abs(days)}`;
}

function parseDateOnly(value: string): [number, number, number] {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) throw new Error("날짜 형식이 올바르지 않습니다.");
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error("존재하지 않는 날짜입니다.");
  }
  return [year, month, day];
}

function formatDateOnly(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
