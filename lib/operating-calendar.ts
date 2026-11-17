// KASI calendar data and KASA's 2027 calendar announcement (2026-06-29).
// Review this list when an additional temporary public holiday is announced.
export const holidaySources = [
  "https://astro.kasi.re.kr/kor/life/post/calendarData?year=2026",
  "https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431",
];
export const operatingHolidays: Record<string, string> = {
  "2026-01-01":"신정", "2026-02-16":"설날 연휴", "2026-02-17":"설날", "2026-02-18":"설날 연휴",
  "2026-03-01":"삼일절", "2026-03-02":"대체공휴일", "2026-05-01":"노동절", "2026-05-05":"어린이날",
  "2026-05-24":"부처님오신날", "2026-05-25":"대체공휴일", "2026-06-03":"지방선거", "2026-06-06":"현충일",
  "2026-07-17":"제헌절", "2026-08-15":"광복절", "2026-08-17":"대체공휴일",
  "2026-09-24":"추석 연휴", "2026-09-25":"추석", "2026-09-26":"추석 연휴",
  "2026-10-03":"개천절", "2026-10-05":"대체공휴일", "2026-10-09":"한글날", "2026-12-25":"성탄절",
  "2027-01-01":"신정", "2027-02-06":"설날 연휴", "2027-02-07":"설날", "2027-02-08":"설날 연휴", "2027-02-09":"대체공휴일",
  "2027-03-01":"삼일절", "2027-05-01":"노동절", "2027-05-03":"대체공휴일", "2027-05-05":"어린이날", "2027-05-13":"부처님오신날",
  "2027-06-06":"현충일", "2027-07-17":"제헌절", "2027-07-19":"대체공휴일", "2027-08-15":"광복절", "2027-08-16":"대체공휴일",
  "2027-09-14":"추석 연휴", "2027-09-15":"추석", "2027-09-16":"추석 연휴",
  "2027-10-03":"개천절", "2027-10-04":"대체공휴일", "2027-10-09":"한글날", "2027-10-11":"대체공휴일",
  "2027-12-25":"성탄절", "2027-12-27":"대체공휴일",
};
export const automaticTimes = [
  { key: "MORNING", label: "오전", start: "09:00", end: "11:30" },
  { key: "MIDDAY", label: "오후 1", start: "12:30", end: "15:00" },
  { key: "AFTERNOON", label: "오후 2", start: "15:30", end: "18:00" },
] as const;
export function koreanToday(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
export function operatingDayReason(date: string): string {
  if (!/^(2026|2027)-\d{2}-\d{2}$/.test(date)) return "공휴일 정보 미확인";
  if (operatingHolidays[date]) return operatingHolidays[date];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6 ? "주말 휴무" : "";
}
export function operatingTimeReason(startAt: string, endAt: string): string {
  const reason = operatingDayReason(startAt.slice(0, 10));
  if (reason) return reason;
  const start = startAt.slice(11, 16), end = endAt.slice(11, 16);
  if (startAt.slice(0, 10) !== endAt.slice(0, 10) || start < "09:00" || end > "18:00" || start >= end) return "운영시간 외";
  return start < "12:30" && end > "11:30" ? "점심시간 포함 · 11:30–12:30" : "";
}
export function rollingMonths(now = new Date()): string[] {
  const today = koreanToday(now), year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
  return [0, 1, 2].map(offset => new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7));
}
