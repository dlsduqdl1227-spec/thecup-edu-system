export const bookingTimes = [
  { key: "MORNING", label: "1회차", start: "09:00", end: "11:30" },
  { key: "MIDDAY", label: "2회차", start: "12:00", end: "14:30" },
  { key: "AFTERNOON", label: "3회차", start: "15:00", end: "17:30" },
] as const;

export type BookingTimeKey = (typeof bookingTimes)[number]["key"];
export type ReservationStatus =
  | "REQUESTED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "REJECTED"
  | "NO_SHOW";

export type MemberSession = {
  id: number;
  loginId: string;
  name: string;
  approvalStatus: "APPROVED";
};

export function normalizeMemberLoginId(value: unknown): string {
  const loginId = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9-]{4,20}$/.test(loginId)) {
    throw new Error("수강생 ID는 영문 대문자, 숫자, 하이픈 4~20자로 입력해 주세요.");
  }
  return loginId;
}

export function validateBookingMonth(value: unknown): string {
  const month = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("조회 월 형식이 올바르지 않습니다.");
  }
  return month;
}

export function bookingMonthRange(month: string): { start: string; end: string } {
  const [year, monthNumber] = validateBookingMonth(month).split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  const nextMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    start: `${month}-01T00:00:00+09:00`,
    end: `${nextMonth}-01T00:00:00+09:00`,
  };
}

export function bookingText(value: unknown, label: string, maxLength = 300): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label}을(를) 입력해 주세요.`);
  if (text.length > maxLength) throw new Error(`${label}이(가) 너무 깁니다.`);
  return text;
}

export function optionalBookingText(value: unknown, maxLength = 500): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > maxLength) throw new Error("입력 내용이 너무 깁니다.");
  return text;
}

export function positiveBookingInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label}이(가) 올바르지 않습니다.`);
  return parsed;
}

export function nonNegativeBookingInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label}이(가) 올바르지 않습니다.`);
  return parsed;
}

export function bookingDateTime(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("예약 일시 형식이 올바르지 않습니다.");
  }
  return `${date}T${time}:00+09:00`;
}

export function validateBookingDateInMonth(value: unknown, month: string): string {
  const date = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(`${validateBookingMonth(month)}-`)) {
    throw new Error("선택한 월에 포함된 날짜만 생성할 수 있습니다.");
  }
  const [year, monthNumber, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, monthNumber - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== monthNumber - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error("운영 날짜가 올바르지 않습니다.");
  }
  return date;
}

export function validateBookingTimeRange(startValue: unknown, endValue: unknown): { start: string; end: string } {
  const start = typeof startValue === "string" ? startValue.trim() : "";
  const end = typeof endValue === "string" ? endValue.trim() : "";
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(start) || !timePattern.test(end)) {
    throw new Error("운영 시간 형식이 올바르지 않습니다.");
  }
  const minutes = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  if (minutes(start) >= minutes(end)) throw new Error("종료 시간은 시작 시간보다 늦어야 합니다.");
  return { start, end };
}

export function getBookingTime(key: unknown) {
  const found = bookingTimes.find((time) => time.key === key);
  if (!found) throw new Error("예약 회차를 선택해 주세요.");
  return found;
}

export function currentKoreanDateTime(): Date {
  return new Date();
}

export function isFutureSlot(startAt: string): boolean {
  return new Date(startAt).getTime() > Date.now();
}

export function slotDate(startAt: string): string {
  return startAt.slice(0, 10);
}

export function slotMonth(startAt: string): string {
  return startAt.slice(0, 7);
}

export function reservationStatusLabel(status: ReservationStatus): string {
  return {
    REQUESTED: "승인 대기",
    CONFIRMED: "예약 확정",
    COMPLETED: "이용 완료",
    CANCELLED: "취소",
    REJECTED: "거절",
    NO_SHOW: "노쇼",
  }[status];
}
