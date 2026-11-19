import { monthDates } from "./flow-calendar-view";

export function adjacentMonth(month: string, offset: number) {
  monthDates(month); // Validate before using calendar arithmetic.
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function initialScheduleDate(month: string, today: string) {
  const dates = monthDates(month);
  return dates.includes(today) ? today : dates[0];
}

export function scheduleSlotState(slot: { status: string; calendarBlocked?: boolean; hasConfirmed: number; requestCount: number; endAt: string }, now = Date.now()) {
  if (slot.hasConfirmed) return { code: "confirmed", label: "예약 확정" };
  if (slot.status === "BLOCKED" || slot.calendarBlocked) return { code: "closed", label: "마감" };
  if (new Date(slot.endAt).getTime() <= now) return { code: "past", label: "지난 일정" };
  if (slot.requestCount) return { code: "pending", label: `승인 대기 ${slot.requestCount}` };
  return { code: "available", label: "예약 가능" };
}

export function pageItems<T>(items: readonly T[], page: number, size = 8) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.max(0, Math.min(page, pages - 1));
  return { page: current, pages, items: items.slice(current * size, (current + 1) * size) };
}
