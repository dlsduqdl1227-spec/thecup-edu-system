import { isoDate, optionalText, textValue } from "./http";
import { validateCourseMonth, type CourseStatusOverride } from "./course-openings";

export const courseCategories = ["Q_GRADER", "BARISTA", "SCA", "ROASTING", "OTHER"] as const;

export type CoursePayload = {
  name: string;
  category: string;
  courseMonth: string;
  openingMinimum: number;
  capacity: number | null;
  recruitmentStartDate: string | null;
  recruitmentEndDate: string | null;
  isPublic: number;
  statusOverride: CourseStatusOverride;
  displayOrder: number;
  durationHours: number;
  tuition: number;
  feeNote: string;
};

function integerValue(value: unknown, label: string, minimum = 0): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label}을(를) 정확히 입력해 주세요.`);
  }
  return parsed;
}

function optionalDate(value: unknown): string | null {
  const date = optionalText(value, 10);
  return date ? isoDate(date) : null;
}

export function parseCoursePayload(payload: Record<string, unknown>): CoursePayload {
  const name = textValue(payload.name, "과정명", 80);
  const category = textValue(payload.category, "과정 유형", 40).toUpperCase();
  const courseMonth = validateCourseMonth(payload.courseMonth);
  const openingMinimum = integerValue(payload.openingMinimum, "개강 기준 인원", 1);
  const capacityText = String(payload.capacity ?? "").trim();
  const capacity = capacityText ? integerValue(capacityText, "전체 정원", 1) : null;
  const recruitmentStartDate = optionalDate(payload.recruitmentStartDate);
  const recruitmentEndDate = optionalDate(payload.recruitmentEndDate);
  const statusOverride = String(payload.statusOverride ?? "AUTO") as CourseStatusOverride;
  const displayOrder = integerValue(payload.displayOrder ?? 0, "표시 순서");
  const durationHours = integerValue(payload.durationHours ?? 0, "교육시간");
  const tuition = integerValue(payload.tuition ?? 0, "수강료");
  const feeNote = optionalText(payload.feeNote, 100);

  if (capacity !== null && capacity < openingMinimum) {
    throw new Error("전체 정원은 개강 기준 인원보다 작을 수 없습니다.");
  }
  if (recruitmentStartDate && recruitmentEndDate && recruitmentStartDate > recruitmentEndDate) {
    throw new Error("모집 종료일은 모집 시작일보다 빠를 수 없습니다.");
  }
  if (!(["AUTO", "CLOSED"] as string[]).includes(statusOverride)) {
    throw new Error("모집 상태를 선택해 주세요.");
  }

  return {
    name,
    category,
    courseMonth,
    openingMinimum,
    capacity,
    recruitmentStartDate,
    recruitmentEndDate,
    isPublic: payload.isPublic === true || payload.isPublic === 1 || payload.isPublic === "1" ? 1 : 0,
    statusOverride,
    displayOrder,
    durationHours,
    tuition,
    feeNote,
  };
}

export function buildCoursePublicId(category: string, courseMonth: string): string {
  const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "course";
  return `${slug}-${courseMonth}-${crypto.randomUUID().slice(0, 6)}`;
}
