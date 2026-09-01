export const applicantStatuses = [
  "WAITING",
  "CONFIRMED",
  "CANCELLED",
  "REJECTED",
  "REFUNDED",
] as const;

export type ApplicantStatus = (typeof applicantStatuses)[number];
export type CourseOpeningStatus = "WAITING" | "OPENABLE" | "FULL" | "CLOSED";
export type CourseStatusOverride = "AUTO" | "CLOSED";

export function currentKoreanMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export function validateCourseMonth(value: unknown): string {
  const month = String(value ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("진행 월을 YYYY-MM 형식으로 입력해 주세요.");
  }
  return month;
}

export function deriveCourseOpeningStatus(input: {
  currentApplicants: number;
  openingMinimum: number;
  capacity: number | null;
  statusOverride: CourseStatusOverride;
}): CourseOpeningStatus {
  if (input.statusOverride === "CLOSED") return "CLOSED";
  if (input.capacity !== null && input.currentApplicants >= input.capacity) return "FULL";
  if (input.currentApplicants >= input.openingMinimum) return "OPENABLE";
  return "WAITING";
}

export function courseStatusLabel(
  status: CourseOpeningStatus,
  remainingToOpen: number,
): string {
  if (status === "CLOSED") return "접수 종료";
  if (status === "FULL") return "모집 마감";
  if (status === "OPENABLE") return "개강 가능";
  return `개강까지 ${remainingToOpen}명`;
}

export function openingProgress(currentApplicants: number, openingMinimum: number): number {
  if (openingMinimum <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((currentApplicants / openingMinimum) * 100)));
}

export function formatKoreanTimestamp(value: string | null | undefined, fallback = new Date()): string {
  const parsed = value ? new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`) : fallback;
  const date = Number.isNaN(parsed.getTime()) ? fallback : parsed;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`;
}

export function methodNotAllowed(): Response {
  return Response.json(
    { error: "공개 조회 API는 GET 요청만 지원합니다." },
    { status: 405, headers: { Allow: "GET" } },
  );
}
