"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { requestJson } from "../../lib/api-client";
import { useRequestGuard } from "../../lib/use-request-guard";
import { adjacentMonth, initialScheduleDate, pageItems, scheduleSlotState } from "../../lib/admin-schedule";
import { flowTimeLabel, monthDates, type FlowCalendarEvent } from "../../lib/flow-calendar-view";
import { koreanToday, operatingDayReason } from "../../lib/operating-calendar";
import { AccessibleDialog } from "./AccessibleDialog";
import type { Slot, Reservation, AdminProps } from "./BookingAdmin";

type Opening = { id: number; name: string; currentApplicants: number; openingMinimum: number; capacity: number | null; statusOverride: string; isPublic: number };
type CalendarData = { month: string; syncedAt: string | null; warning: string; detailsWarning: string; flowEvents: FlowCalendarEvent[]; conflicts: { id: number; memberName: string; startAt: string; stationName: string }[] };
type Props = AdminProps & {
  month: string; onMonthChange: (month: string) => void;
  selectedDate?: string; onDateChange?: (date: string) => void;
  renderOpenings: (id?: number | "create", onBusyChange?: (busy: boolean) => void) => ReactNode;
  renderTools: () => ReactNode;
  renderReservations: (rows: Reservation[]) => ReactNode;
};
const dateLabel = (date: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(new Date(date + "T12:00:00+09:00"));
const timeLabel = (slot: Slot) => `${slot.startAt.slice(11, 16)}–${slot.endAt.slice(11, 16)}`;

export function AdminSchedule({ data, month, busy, act, onMonthChange, selectedDate, onDateChange, renderOpenings, renderTools, renderReservations }: Props) {
  const today = koreanToday();
  const dates = monthDates(month);
  const [selected, setSelected] = useState(() => dates.includes(selectedDate ?? "") ? selectedDate! : initialScheduleDate(month, today));
  const [station, setStation] = useState("all");
  const [list, setList] = useState<"slots" | "reservations" | "flow">("slots");
  const [page, setPage] = useState(0);
  const [coursePage, setCoursePage] = useState(0);
  const [courses, setCourses] = useState<Opening[]>([]);
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  const [courseError, setCourseError] = useState("");
  const [flowError, setFlowError] = useState("");
  const [loadedCourses, setLoadedCourses] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dialog, setDialog] = useState<null | { type: "tools" } | { type: "openings"; id?: number | "create" } | { type: "slot"; id: number } | { type: "day" }>(null);
  const [openingBusy, setOpeningBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [beginCourses, cancelCourses] = useRequestGuard();
  const [beginFlow, cancelFlow] = useRequestGuard();
  const syncLock = useRef(false);
  const dayPanel = useRef<HTMLElement>(null);

  const loadCourses = useCallback(async () => {
    const isCurrent = beginCourses();
    try {
      const result = await requestJson<{ courses: Opening[] }>(`/api/course-openings?month=${month}`, { cache: "no-store" });
      if (isCurrent()) { setCourses(result.courses); setLoadedCourses(true); setCourseError(""); }
    } catch (error) { if (isCurrent()) setCourseError(error instanceof Error ? error.message : "개강 정보를 불러오지 못했습니다."); }
  }, [month, beginCourses]);
  const loadFlow = useCallback(async (force = false) => {
    if (syncLock.current && !force) return;
    if (force && syncLock.current) return;
    if (force) { syncLock.current = true; setSyncing(true); }
    const isCurrent = beginFlow();
    try {
      const result = await requestJson<CalendarData>(`/api/booking/calendar?month=${month}`, { method: force ? "POST" : "GET", cache: "no-store" });
      if (isCurrent()) { setCalendar(result); setFlowError(""); }
      if (force && isCurrent()) window.dispatchEvent(new Event("thecup:booking-updated"));
    } catch (error) { if (isCurrent()) setFlowError(error instanceof Error ? error.message : "FLOW 연동을 확인하지 못했습니다."); }
    finally { if (force) { syncLock.current = false; if (isCurrent()) setSyncing(false); } }
  }, [month, beginFlow]);
  useEffect(() => {
    const refresh = () => { void loadCourses(); void loadFlow(); };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("thecup:booking-updated", refresh);
    return () => { cancelCourses(); cancelFlow(); window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("thecup:booking-updated", refresh); };
  }, [loadCourses, loadFlow, cancelCourses, cancelFlow]);

  const slots = data.slots.filter(slot => station === "all" || String(slot.stationId) === station);
  const reservations = data.reservations.filter(row => station === "all" || data.slots.some(slot => slot.id === row.slotId && String(slot.stationId) === station));
  const daySlots = slots.filter(slot => slot.startAt.startsWith(selected));
  const dayReservations = reservations.filter(row => row.startAt.startsWith(selected));
  const events = calendar?.month === month ? calendar.flowEvents ?? [] : [];
  const dayEvents = events.filter(event => event.startDate <= selected && event.endDate >= selected);
  const slotPage = pageItems(daySlots, page);
  const reservationPage = pageItems(dayReservations, page);
  const eventPage = pageItems(dayEvents, page);
  const courseRows = pageItems(courses, coursePage, 4);
  const activePage = list === "slots" ? slotPage : list === "reservations" ? reservationPage : eventPage;
  const editingSlot = dialog?.type === "slot" ? data.slots.find(slot => slot.id === dialog.id) : undefined;
  const dateSlots = data.slots.filter(slot => slot.startAt.startsWith(selected));
  const canBlockDay = dateSlots.length > 0 && !dateSlots.some(slot => slot.hasConfirmed || slot.calendarBlocked);
  const wholeDayBlocked = dateSlots.length > 0 && dateSlots.every(slot => slot.status === "BLOCKED");

  function chooseDate(date: string, scroll = false) {
    setSelected(date); onDateChange?.(date); setPage(0);
    if (scroll && window.matchMedia("(max-width: 760px)").matches) dayPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function openDialog(next: NonNullable<typeof dialog>) { setActionError(""); setReason(""); setDialog(next); }
  async function saveBlock(slot?: Slot) {
    const blocked = slot ? slot.status !== "BLOCKED" : !wholeDayBlocked;
    const saved = await act(slot ? { action: "setSlotBlock", slotId: slot.id, blocked, reason } : { action: "setDateBlock", date: selected, blocked, reason }, blocked ? "예약을 마감했습니다." : "예약을 다시 열었습니다.", setActionError);
    if (saved) setDialog(null);
  }
  function pagination(total: number, current: { page: number; pages: number } = activePage, change = setPage) {
    if (current.pages <= 1) return null;
    return <nav className="schedule-pagination" aria-label="일정 목록 페이지"><button type="button" disabled={current.page === 0} onClick={() => change(current.page - 1)}>이전</button><span>{current.page + 1} / {current.pages} · {total}건</span><button type="button" disabled={current.page + 1 >= current.pages} onClick={() => change(current.page + 1)}>다음</button></nav>;
  }

  return <div className="schedule-workbench">
    <header className="schedule-topbar"><div><span className="schedule-eyebrow">SCHEDULE</span><h2>일정 · 개강</h2><p>날짜를 선택하고 시간표와 예약을 바로 관리하세요.</p></div><div className="schedule-top-actions"><button type="button" onClick={() => openDialog({ type: "openings" })}>개강 관리</button><button type="button" className="schedule-primary" onClick={() => openDialog({ type: "tools" })}>일정 추가</button></div></header>
    <div className="schedule-monthbar"><div className="schedule-month-controls"><button type="button" aria-label="이전 달" onClick={() => onMonthChange(adjacentMonth(month, -1))}>‹</button><label><span className="sr-only">일정 조회 월</span><input type="month" aria-label="일정 조회 월" value={month} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) onMonthChange(event.target.value); }} /></label><button type="button" aria-label="다음 달" onClick={() => onMonthChange(adjacentMonth(month, 1))}>›</button><button type="button" onClick={() => { onMonthChange(today.slice(0, 7)); chooseDate(today); }}>오늘</button></div><label className="schedule-station-filter"><span>스테이션</span><select aria-label="스테이션 필터" value={station} onChange={event => { setStation(event.target.value); setPage(0); }}><option value="all">전체 스테이션</option>{data.stations.map(row => <option key={row.id} value={row.id}>{row.name}{!row.active ? " (운영 중지)" : ""}</option>)}</select></label></div>
    <div className="schedule-calendar-layout"><section className="schedule-month-grid" aria-label={`${month} 운영 달력`}><div className="schedule-weekdays">{["일", "월", "화", "수", "목", "금", "토"].map(day => <span key={day}>{day}</span>)}</div><div className="schedule-days">{Array.from({ length: new Date(dates[0] + "T00:00:00Z").getUTCDay() }, (_, index) => <span key={`blank-${index}`} />)}{dates.map(date => {
      const dateRows = slots.filter(slot => slot.startAt.startsWith(date));
      const available = dateRows.filter(slot => scheduleSlotState(slot).code === "available" || scheduleSlotState(slot).code === "pending").length;
      const closed = dateRows.filter(slot => scheduleSlotState(slot).code === "closed").length;
      const requested = reservations.filter(row => row.startAt.startsWith(date) && row.status === "REQUESTED").length;
      const confirmed = reservations.filter(row => row.startAt.startsWith(date) && row.status === "CONFIRMED").length;
      const hasFlow = events.some(event => event.startDate <= date && event.endDate >= date);
      const holiday = operatingDayReason(date);
      return <button type="button" key={date} data-date={date} className={[selected === date ? "selected" : "", holiday ? "holiday" : ""].join(" ")} aria-pressed={selected === date} aria-current={date === today ? "date" : undefined} aria-label={`${dateLabel(date)}${holiday ? `, ${holiday}` : ""}, 예약 가능 ${available}개, 마감 ${closed}개, 승인 대기 ${requested}건, 확정 ${confirmed}건${hasFlow ? ", FLOW 일정" : ""}`} onClick={() => chooseDate(date, true)} onKeyDown={event => {
        const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (!(event.key in offsets)) return;
        event.preventDefault(); const next = dates[dates.indexOf(date) + offsets[event.key]];
        if (next) { chooseDate(next); event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus(); }
      }}><b>{Number(date.slice(8))}{hasFlow && <i aria-hidden="true" />}</b><small>{requested ? `대기 ${requested}` : confirmed ? `확정 ${confirmed}` : available ? `가능 ${available}` : closed ? "마감" : holiday ? "휴무" : "일정 없음"}</small></button>;
    })}</div><p className="schedule-legend"><i /> FLOW 연동 · 날짜를 누르면 상세 목록이 열립니다.</p></section>
    <section ref={dayPanel} className="schedule-day" aria-label="선택 날짜 일정"><header><div><span>선택한 날짜</span><h3>{dateLabel(selected)}</h3></div><button type="button" disabled={busy || !canBlockDay} title={!canBlockDay ? "예약 확정·자동 휴무는 개별 확인이 필요합니다." : undefined} onClick={() => openDialog({ type: "day" })}>{wholeDayBlocked ? "하루 다시 열기" : "하루 마감"}</button></header>
      <nav className="schedule-day-tabs" aria-label="선택일 보기"><button type="button" aria-pressed={list === "slots"} onClick={() => { setList("slots"); setPage(0); }}>시간표 {daySlots.length}</button><button type="button" aria-pressed={list === "reservations"} onClick={() => { setList("reservations"); setPage(0); }}>예약 {dayReservations.length}</button><button type="button" aria-pressed={list === "flow"} onClick={() => { setList("flow"); setPage(0); }}>FLOW {dayEvents.length}</button></nav>
      <div className="schedule-day-content" aria-live="polite">{list === "slots" ? slotPage.items.length ? slotPage.items.map(slot => { const state = scheduleSlotState(slot); return <button type="button" className="schedule-slot-row" key={slot.id} onClick={() => openDialog({ type: "slot", id: slot.id })}><time>{timeLabel(slot)}</time><span><strong>{slot.stationName}</strong><small>{slot.flowBlocked ? "FLOW 연동" : slot.blockReason || "상세 · 수정"}</small></span><b className={`schedule-status ${state.code}`}>{state.label}</b></button>; }) : <p className="schedule-empty">{operatingDayReason(selected) || "등록된 시간이 없습니다."}</p> : list === "reservations" ? reservationPage.items.length ? renderReservations(reservationPage.items) : <p className="schedule-empty">이 날짜의 예약이 없습니다.</p> : <>{!calendar && !flowError ? <p role="status">FLOW 일정을 확인하고 있습니다.</p> : eventPage.items.length ? eventPage.items.map(event => <article className="schedule-flow-row" key={event.id}><span>{flowTimeLabel(event)}</span><h4>{event.title}</h4>{event.location && <p>{event.location}</p>}<a href="https://monthlycoffee-flow.pages.dev/" target="_blank" rel="noreferrer">FLOW에서 수정</a></article>) : <p className="schedule-empty">연동된 FLOW 일정이 없습니다.</p>}<small className="schedule-muted">실제 일정 내용은 관리자에게만 표시됩니다.</small></>}</div>
      {pagination(list === "slots" ? daySlots.length : list === "reservations" ? dayReservations.length : dayEvents.length)}
    </section></div>
    <details className="schedule-openings" aria-label="이달의 개강 모집"><summary>이달의 개강 모집 · {courses.length}개 과정</summary><header><div><h3>이달의 개강 모집 <span>{courses.length}</span></h3><p>모집 과정은 월 단위로 관리합니다.</p></div><div><button type="button" onClick={() => openDialog({ type: "openings" })}>전체 관리</button><button type="button" onClick={() => openDialog({ type: "openings", id: "create" })}>과정 추가</button></div></header>
      {courseError && <p role="alert">{courseError} <button type="button" onClick={() => void loadCourses()}>다시 시도</button></p>}
      {!loadedCourses ? <p role="status">개강 정보를 불러오는 중입니다.</p> : courses.length ? <div className="schedule-course-cards">{courseRows.items.map(course => <button type="button" key={course.id} onClick={() => openDialog({ type: "openings", id: course.id })}><strong>{course.name}</strong><span>{course.currentApplicants}명 · 개강 기준 {course.openingMinimum}명{course.capacity !== null ? ` · 정원 ${course.capacity}명` : ""}</span><b>{course.statusOverride === "CLOSED" ? "접수 종료" : course.capacity !== null && course.currentApplicants >= course.capacity ? "모집 마감" : course.currentApplicants >= course.openingMinimum ? "개강 가능" : "모집 중"} · 수정</b></button>)}</div> : <p className="schedule-muted">등록된 모집 과정이 없습니다. 필요한 과정을 추가해 주세요.</p>}
      {pagination(courses.length, courseRows, setCoursePage)}
    </details>
    <footer className="schedule-sync"><div><strong>{calendar?.syncedAt ? "FLOW 연동 중" : "FLOW 연결 확인 중"}</strong><span>{calendar?.syncedAt ? new Date(calendar.syncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : ""}</span></div><button type="button" disabled={syncing} onClick={() => void loadFlow(true)}>{syncing ? "동기화 중…" : "지금 동기화"}</button><p>평일 09:00–18:00 · 점심 11:30–12:30 · 주말·공휴일 휴무. FLOW와 겹치는 시간만 마감합니다.</p>{(flowError || calendar?.warning || calendar?.detailsWarning) && <p role="alert">{flowError || calendar?.warning || calendar?.detailsWarning} <button type="button" onClick={() => void loadFlow()}>다시 확인</button></p>}{!!calendar?.conflicts?.length && <div role="alert"><strong>일정과 겹친 예약 {calendar.conflicts.length}건</strong><p>기존 예약은 유지했습니다. 해당 날짜를 선택해 일정을 조정해 주세요.</p>{calendar.conflicts.map(row => <button type="button" key={row.id} onClick={() => { onMonthChange(row.startAt.slice(0, 7)); chooseDate(row.startAt.slice(0, 10), true); setList("reservations"); }}>{row.memberName} · {row.startAt.slice(0, 16).replace("T", " ")} · {row.stationName}</button>)}</div>}</footer>
    {dialog && <AccessibleDialog label={dialog.type === "openings" ? "개강 모집 관리" : dialog.type === "tools" ? "추가 일정과 스테이션 관리" : "일정 상세 수정"} busy={busy || openingBusy} onClose={() => setDialog(null)}><div className="schedule-editor"><header><h2>{dialog.type === "openings" ? "개강 모집 관리" : dialog.type === "tools" ? "추가 일정과 스테이션" : "일정 상세"}</h2><button type="button" disabled={busy || openingBusy} onClick={() => setDialog(null)}>닫기</button></header>
      {dialog.type === "openings" ? renderOpenings(dialog.id, setOpeningBusy) : dialog.type === "tools" ? renderTools() : <>{actionError && <p role="alert">{actionError}</p>}{dialog.type === "slot" && !editingSlot ? <p role="alert">이 일정이 변경되었습니다. 목록을 다시 확인해 주세요.</p> : <><h3>{dateLabel(selected)}{editingSlot && ` · ${timeLabel(editingSlot)}`}</h3>{editingSlot && <p>{editingSlot.stationName} · {scheduleSlotState(editingSlot).label}</p>}{editingSlot?.flowBlocked ? <p>FLOW 일정과 겹치는 시간입니다. FLOW에서 변경하면 자동으로 다시 반영됩니다.</p> : editingSlot?.calendarBlocked ? <p>기본 운영 정책에 따른 휴무 시간입니다.</p> : <form className="schedule-block-form" onSubmit={event => { event.preventDefault(); void saveBlock(editingSlot); }}><label>마감 사유{((editingSlot ? editingSlot.status : wholeDayBlocked ? "BLOCKED" : "OPEN") !== "BLOCKED") && " (필수)"}<input value={reason} onChange={event => setReason(event.target.value)} maxLength={200} required={(editingSlot ? editingSlot.status !== "BLOCKED" : !wholeDayBlocked)} placeholder="예: 센터 행사, 장비 점검" /></label><p>기존 확정 예약은 이 화면에서 차단할 수 없습니다.</p><button type="submit" className="schedule-primary" disabled={busy || Boolean(editingSlot?.hasConfirmed) || (!editingSlot && !canBlockDay)}>{busy ? "저장 중…" : (editingSlot ? editingSlot.status === "BLOCKED" : wholeDayBlocked) ? "예약 다시 열기" : "마감 저장"}</button></form>}{editingSlot && renderReservations(data.reservations.filter(row => row.slotId === editingSlot.id))}</>}</>}
    </div></AccessibleDialog>}
  </div>;
}
