"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Member = { id: number; loginId: string | null; name: string; phoneLast4: string; approvalStatus: string; consultationStatus: string; desiredStationType: string; consultationMemo: string; adminMemo: string; createdAt: string };
type Station = { id: number; type: string; name: string; active: number; displayOrder: number };
type Slot = { id: number; stationId: number; startAt: string; endAt: string; status: string; blockReason: string; stationType: string; stationName: string; hasConfirmed: number; requestCount: number };
type Reservation = { id: number; memberId: number; memberName: string; phoneLast4: string; memberApprovalStatus: string; slotId: number; status: string; purpose: string; materialPlan: string; openToPeerPractice: number; userMemo: string; adminMemo: string; rejectionReason: string; createdAt: string; startAt: string; endAt: string; stationType: string; stationName: string };
type Pass = { id: number; memberId: number; memberName: string; type: string; validMonth: string; price: number; status: string; maxActiveBookings: number | null };
type Payment = { id: number; memberId: number; memberName: string; reservationId: number | null; passId: number | null; amount: number; method: string; status: string; paidAt: string | null; createdAt: string };
type Feedback = { id: number; memberId: number; memberName: string; reservationId: number; message: string; status: string; adminReply: string; createdAt: string };
type Evaluation = { id: number; memberId: number; memberName: string; status: string; technicalScore: number | null; consistencyScore: number | null; sensoryScore: number | null; ruleScore: number | null; ethicsStatus: string; result: string; note: string };
type Candidate = { id: number; memberId: number; memberName: string; type: string; status: string; conflictNote: string };
type BookingAdminData = {
  month: string;
  members: Member[];
  stations: Station[];
  slots: Slot[];
  reservations: Reservation[];
  passes: Pass[];
  payments: Payment[];
  feedback: Feedback[];
  evaluations: Evaluation[];
  candidates: Candidate[];
  settings: { dailyPrice: number; monthlyPrice: number; cancelHours: number; maxActiveBookings: number | null };
  bookingTimes: Array<{ key: string; start: string; end: string }>;
};

type AdminTab = "requests" | "schedule" | "members" | "payments" | "growth" | "settings";
const tabs: Array<[AdminTab, string]> = [["requests", "예약 요청"], ["schedule", "스케줄"], ["members", "상담·회원"], ["payments", "이용권·결제"], ["growth", "평가·후보"], ["settings", "운영 설정"]];
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const stationLabel: Record<string, string> = { ESPRESSO: "에스프레소", BREWING: "브루잉", ROASTING: "로스팅" };
const reservationLabel: Record<string, string> = { REQUESTED: "승인 대기", CONFIRMED: "확정", COMPLETED: "완료", CANCELLED: "취소", REJECTED: "거절", NO_SHOW: "노쇼" };

export function BookingAdmin({ notify }: { notify: (message: { kind: "ok" | "error"; message: string }) => void }) {
  const [month, setMonth] = useState(koreanMonth());
  const [tab, setTab] = useState<AdminTab>("requests");
  const [data, setData] = useState<BookingAdminData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await requestJson<BookingAdminData>(`/api/booking/admin?month=${encodeURIComponent(month)}`));
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    }
  }, [month, notify]);

  useEffect(() => {
    // Initial and month-dependent remote data lookup; state changes after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      await requestJson("/api/booking/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await load();
      notify({ kind: "ok", message: success });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <section className="page-section booking-admin-loading"><div className="loading-line" /><p>예약 운영 데이터를 준비하고 있습니다.</p></section>;

  const pending = data.reservations.filter((row) => row.status === "REQUESTED").length;
  const consultations = data.members.filter((row) => row.approvalStatus === "PENDING").length;
  const confirmed = data.reservations.filter((row) => row.status === "CONFIRMED").length;

  return (
    <section className="page-section booking-admin-page">
      <header className="booking-admin-heading">
        <div><span>COFFEE STATION OPERATIONS</span><h1>예약 운영</h1><p>상담 승인부터 스케줄, 예약 확정, 현장결제와 평가까지 관리합니다.</p></div>
        <label>조회 월<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      </header>
      <div className="booking-admin-kpis"><article><span>상담 대기</span><strong>{consultations}</strong></article><article><span>예약 요청</span><strong>{pending}</strong></article><article><span>확정 예약</span><strong>{confirmed}</strong></article><article><span>운영 슬롯</span><strong>{data.slots.length}</strong></article></div>
      <nav className="booking-admin-tabs" aria-label="예약 운영 메뉴">{tabs.map(([key, label]) => <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}{key === "requests" && pending ? <b>{pending}</b> : null}</button>)}</nav>
      {tab === "requests" && <ReservationRequests data={data} busy={busy} act={act} />}
      {tab === "schedule" && <ScheduleAdmin key={month} data={data} month={month} busy={busy} act={act} />}
      {tab === "members" && <MemberAdmin data={data} month={month} busy={busy} act={act} />}
      {tab === "payments" && <PaymentAdmin data={data} busy={busy} act={act} />}
      {tab === "growth" && <GrowthAdmin data={data} busy={busy} act={act} />}
      {tab === "settings" && <SettingsAdmin data={data} busy={busy} act={act} />}
    </section>
  );
}

function ReservationRequests({ data, busy, act }: AdminProps) {
  const rows = [...data.reservations].sort((a, b) => rank(a.status) - rank(b.status) || a.startAt.localeCompare(b.startAt));
  const decide = (row: Reservation, decision: string) => {
    const adminMemo = ["CONFIRMED", "PROPOSE"].includes(decision) ? window.prompt(decision === "PROPOSE" ? "제안할 시간과 안내 내용을 입력하세요." : "회원에게 표시할 안내 메모(선택)", row.adminMemo) : row.adminMemo;
    if (adminMemo === null) return;
    const rejectionReason = decision === "REJECTED" ? window.prompt("회원에게 표시할 거절 사유를 입력하세요.") : "";
    if (decision === "REJECTED" && !rejectionReason) return;
    void act({ action: "decideReservation", reservationId: row.id, decision, adminMemo, rejectionReason }, `예약을 ${reservationLabel[decision] ?? "처리"}했습니다.`);
  };
  return <div className="booking-admin-list">{rows.length ? rows.map((row) => <article className={`booking-admin-request status-${row.status.toLowerCase()}`} key={row.id}><div className="booking-admin-request-status"><span>{reservationLabel[row.status] ?? row.status}</span><small>#{row.id}</small></div><div><h2>{dateTime(row.startAt)} · {row.stationName}</h2><p><strong>{row.memberName}</strong> · 전화 끝자리 {row.phoneLast4} · {row.purpose}</p><small>재료 {row.materialPlan === "SELF" ? "직접 준비" : "센터 구매 희망"}{row.openToPeerPractice ? " · 함께 연습 가능" : ""}</small>{row.userMemo && <blockquote>{row.userMemo}</blockquote>}{row.adminMemo && <p className="booking-admin-note">관리자 안내 · {row.adminMemo}</p>}</div><div className="booking-admin-actions">{row.status === "REQUESTED" && <><button disabled={busy} className="solid" onClick={() => decide(row, "CONFIRMED")}>승인</button><button disabled={busy} onClick={() => decide(row, "PROPOSE")}>시간 제안</button><button disabled={busy} className="danger" onClick={() => decide(row, "REJECTED")}>거절</button></>}{row.status === "CONFIRMED" && <><button disabled={busy} className="solid" onClick={() => decide(row, "COMPLETED")}>이용 완료</button><button disabled={busy} onClick={() => decide(row, "NO_SHOW")}>노쇼</button><button disabled={busy} className="danger" onClick={() => decide(row, "CANCELLED")}>예약 취소</button></>}</div></article>) : <Empty>선택한 월의 예약 요청이 없습니다.</Empty>}</div>;
}

function ScheduleAdmin({ data, month, busy, act }: AdminProps & { month: string }) {
  const monthDates = useMemo(() => datesInMonth(month), [month]);
  const firstWeekday = monthDates.length ? utcWeekday(monthDates[0]) : 0;
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set());
  const [selectedStations, setSelectedStations] = useState<Set<number>>(
    () => new Set(data.stations.filter((station) => station.active).map((station) => station.id)),
  );
  const [startTime, setStartTime] = useState(data.bookingTimes[0]?.start ?? "09:00");
  const [endTime, setEndTime] = useState(data.bookingTimes[0]?.end ?? "11:30");
  const groups = useMemo(() => {
    const grouped = new Map<string, Slot[]>();
    data.slots.forEach((slot) => {
      const date = slot.startAt.slice(0, 10);
      grouped.set(date, [...(grouped.get(date) ?? []), slot]);
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data.slots]);
  const slotCounts = useMemo(() => {
    const counts = new Map<string, number>();
    data.slots.forEach((slot) => {
      const date = slot.startAt.slice(0, 10);
      counts.set(date, (counts.get(date) ?? 0) + 1);
    });
    return counts;
  }, [data.slots]);

  function toggleDateSelection(date: string) {
    setSelectedDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function selectDatePattern(pattern: "ALL" | "WEEKDAY" | "WEEKEND" | "CLEAR") {
    if (pattern === "CLEAR") return setSelectedDates(new Set());
    setSelectedDates(new Set(monthDates.filter((date) => {
      const weekday = utcWeekday(date);
      if (pattern === "WEEKDAY") return weekday >= 1 && weekday <= 5;
      if (pattern === "WEEKEND") return weekday === 0 || weekday === 6;
      return true;
    })));
  }

  function toggleStationSelection(stationId: number) {
    setSelectedStations((current) => {
      const next = new Set(current);
      if (next.has(stationId)) next.delete(stationId);
      else next.add(stationId);
      return next;
    });
  }

  function applyTimePreset(start: string, end: string) {
    setStartTime(start);
    setEndTime(end);
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDates.size) return void window.alert("일정을 생성할 날짜를 선택해 주세요.");
    if (!selectedStations.size) return void window.alert("예약을 받을 스테이션을 선택해 주세요.");
    await act({
      action: "generateSlots",
      month,
      dates: [...selectedDates].sort(),
      times: [{ start: startTime, end: endTime }],
      stationIds: [...selectedStations],
    }, "선택한 날짜에 예약 가능 일정을 생성했습니다. 중복되거나 겹치는 시간은 자동으로 제외했습니다.");
  }
  async function copy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await act({ action: "copyDate", ...values }, "날짜 스케줄을 복사했습니다.");
  }
  function toggle(slot: Slot) {
    const blocked = slot.status !== "BLOCKED";
    const reason = blocked ? window.prompt("이용 불가 사유를 입력하세요.", slot.blockReason || "센터 운영 사정") : "";
    if (blocked && !reason) return;
    void act({ action: "setSlotBlock", slotId: slot.id, blocked, reason }, blocked ? "해당 시간을 차단했습니다." : "해당 시간을 다시 열었습니다.");
  }
  function toggleDate(date: string, slots: Slot[]) {
    const blocked = !slots.every((slot) => slot.status === "BLOCKED");
    const reason = blocked ? window.prompt("날짜 전체 차단 사유를 입력하세요.", "센터 휴무") : "";
    if (blocked && !reason) return;
    void act({ action: "setDateBlock", date, blocked, reason }, blocked ? "해당 날짜를 전체 차단했습니다." : "해당 날짜를 다시 열었습니다.");
  }
  async function createStation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await act({ action: "saveStation", ...Object.fromEntries(new FormData(form).entries()), active: true }, "스테이션을 추가했습니다.");
    form.reset();
  }
  function toggleStation(station: Station) {
    void act({ action: "saveStation", id: station.id, type: station.type, name: station.name, displayOrder: station.displayOrder, active: !Boolean(station.active) }, station.active ? "스테이션을 운영 중지했습니다." : "스테이션을 다시 활성화했습니다.");
  }
  const calendarCells: Array<string | null> = [...Array.from({ length: firstWeekday }, () => null), ...monthDates];
  const activeStations = data.stations.filter((station) => station.active);
  const totalToCreate = selectedDates.size * selectedStations.size;
  return <>
    <form className="booking-batch-builder" onSubmit={generate}>
      <header>
        <div><span>MONTHLY BATCH</span><h2>월간 일정 일괄 생성</h2><p>날짜를 여러 개 고른 뒤 동일한 시간대의 예약 가능 일정을 한 번에 만듭니다.</p></div>
        <strong>{selectedDates.size}<small>일 선택</small></strong>
      </header>
      <div className="booking-batch-quick">
        <span>빠른 날짜 선택</span>
        <div><button type="button" onClick={() => selectDatePattern("WEEKDAY")}>평일 전체</button><button type="button" onClick={() => selectDatePattern("WEEKEND")}>주말 전체</button><button type="button" onClick={() => selectDatePattern("ALL")}>이달 전체</button><button type="button" onClick={() => selectDatePattern("CLEAR")}>선택 해제</button></div>
      </div>
      <div className="booking-batch-layout">
        <section className="booking-batch-calendar" aria-label={`${month} 일정 선택 달력`}>
          <div className="weekdays">{["일","월","화","수","목","금","토"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="days">{calendarCells.map((date, index) => date ? <button type="button" key={date} className={selectedDates.has(date) ? "selected" : ""} aria-pressed={selectedDates.has(date)} onClick={() => toggleDateSelection(date)}><b>{Number(date.slice(8))}</b>{slotCounts.has(date) && <small>기존 {slotCounts.get(date)}</small>}</button> : <span key={`empty-${index}`} />)}</div>
        </section>
        <section className="booking-batch-config">
          <fieldset>
            <legend>1. 시간대 선택</legend>
            <div className="booking-time-presets">{data.bookingTimes.map((time) => <button type="button" key={time.key} className={startTime === time.start && endTime === time.end ? "active" : ""} onClick={() => applyTimePreset(time.start, time.end)}><b>{time.start}–{time.end}</b><small>{time.key === "MORNING" ? "오전" : time.key === "MIDDAY" ? "낮" : "오후"}</small></button>)}</div>
            <div className="booking-time-inputs"><label>시작<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label><span>→</span><label>종료<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label></div>
          </fieldset>
          <fieldset>
            <legend>2. 스테이션 선택</legend>
            <div className="booking-batch-stations">{activeStations.map((station) => <label key={station.id} className={selectedStations.has(station.id) ? "selected" : ""}><input type="checkbox" checked={selectedStations.has(station.id)} onChange={() => toggleStationSelection(station.id)} /><span>{stationLabel[station.type] ?? station.type}</span><b>{station.name}</b></label>)}</div>
          </fieldset>
          <div className="booking-batch-summary"><p><b>{selectedDates.size}일</b> × <b>{selectedStations.size}개 스테이션</b></p><strong>최대 {totalToCreate}개 일정</strong><small>이미 등록됐거나 기존 일정과 겹치는 시간은 생성하지 않습니다.</small></div>
          <button className="solid booking-batch-submit" disabled={busy || !selectedDates.size || !selectedStations.size}>{busy ? "생성 중…" : "선택 일정 일괄 생성"}</button>
        </section>
      </div>
    </form>
    <div className="booking-admin-tools single"><form onSubmit={copy}><div><strong>하루 스케줄 복사</strong><small>특정 날짜의 스케줄과 차단 상태를 다른 날짜로 복사합니다.</small></div><input name="sourceDate" type="date" required /><span>→</span><input name="targetDate" type="date" required /><button disabled={busy}>복사</button></form></div>
    <section className="booking-admin-stations"><div><strong>스테이션 관리</strong><span>같은 유형의 장비를 여러 대 등록할 수 있습니다.</span></div><form onSubmit={createStation}><select name="type" defaultValue="ESPRESSO"><option value="ESPRESSO">에스프레소</option><option value="BREWING">브루잉</option><option value="ROASTING">로스팅</option></select><input name="name" required maxLength={80} placeholder="예: 에스프레소 Station 2" /><input name="displayOrder" type="number" min="0" defaultValue="0" aria-label="표시 순서" /><button className="solid" disabled={busy}>추가</button></form><div>{data.stations.map((station) => <button type="button" key={station.id} className={station.active ? "active" : ""} onClick={() => toggleStation(station)} disabled={busy}><b>{station.name}</b><small>{station.active ? "운영 중 · 클릭하여 중지" : "운영 중지 · 클릭하여 활성화"}</small></button>)}</div></section>
    <div className="booking-admin-schedule">{groups.length ? groups.map(([date, slots]) => <section key={date}><header><strong>{fullDate(date)}</strong><div><span>{slots.length}개 슬롯</span><button type="button" disabled={busy || slots.some((slot) => Boolean(slot.hasConfirmed))} onClick={() => toggleDate(date, slots)}>{slots.every((slot) => slot.status === "BLOCKED") ? "날짜 열기" : "날짜 차단"}</button></div></header><div>{slots.map((slot) => <article key={slot.id} className={slot.status === "BLOCKED" ? "blocked" : slot.hasConfirmed ? "confirmed" : ""}><span>{slot.startAt.slice(11,16)}–{slot.endAt.slice(11,16)}</span><strong>{slot.stationName}</strong><small>{slot.status === "BLOCKED" ? slot.blockReason || "이용 불가" : slot.hasConfirmed ? "예약 확정" : slot.requestCount ? `요청 ${slot.requestCount}건` : "예약 가능"}</small><button type="button" disabled={busy || Boolean(slot.hasConfirmed)} onClick={() => toggle(slot)}>{slot.status === "BLOCKED" ? "차단 해제" : "차단"}</button></article>)}</div></section>) : <Empty>생성된 스케줄이 없습니다. 위에서 날짜와 시간대를 선택해 일괄 생성하세요.</Empty>}</div>
  </>;
}

function MemberAdmin({ data, month, busy, act }: AdminProps & { month: string }) {
  const approved = data.members.filter((member) => member.approvalStatus === "APPROVED");
  function approve(member: Member, approvedState: boolean) {
    const adminMemo = window.prompt(approvedState ? "상담 완료 메모(선택)" : "권한 회수 메모(선택)", member.adminMemo);
    if (adminMemo === null) return;
    void act({ action: "approveMember", memberId: member.id, approved: approvedState, adminMemo }, approvedState ? "회원을 승인했습니다." : "회원 권한을 회수했습니다.");
  }
  function editLoginId(member: Member) {
    const loginId = window.prompt("수강생 ID를 입력하세요. 영문 대문자·숫자·하이픈 4~20자", member.loginId ?? `CUP${String(member.id).padStart(5, "0")}`);
    if (!loginId) return;
    void act({ action: "setMemberLoginId", memberId: member.id, loginId }, "수강생 ID를 변경했습니다. 기존 로그인은 해제됩니다.");
  }
  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries());
    await act({ action: "createPass", ...values, validMonth: month }, "이용권을 발급했습니다."); form.reset();
  }
  return <><div className="booking-admin-split"><section><div className="booking-admin-section-title"><div><span>CONSULTATION</span><h2>상담 신청·회원 승인</h2></div><b>{data.members.length}명</b></div><div className="booking-admin-member-list">{data.members.map((member) => <article key={member.id}><div><span className={`member-state ${member.approvalStatus.toLowerCase()}`}>{member.approvalStatus === "APPROVED" ? "승인 회원" : member.approvalStatus === "PENDING" ? "승인 대기" : "권한 회수"}</span><h3>{member.name} <small>· {member.phoneLast4}</small></h3><p>{(stationLabel[member.desiredStationType] ?? member.desiredStationType) || "희망 스테이션 미정"}</p><p className="booking-member-id"><b>{member.loginId || "승인 시 ID 자동 발급"}</b>{member.approvalStatus === "APPROVED" && <button type="button" disabled={busy} onClick={() => editLoginId(member)}>ID 변경</button>}</p>{member.consultationMemo && <blockquote>{member.consultationMemo}</blockquote>}</div>{member.approvalStatus === "APPROVED" ? <button className="danger" disabled={busy} onClick={() => approve(member, false)}>권한 회수</button> : <button className="solid" disabled={busy} onClick={() => approve(member, true)}>상담 완료·승인</button>}</article>)}</div></section><section><div className="booking-admin-section-title"><div><span>PASS</span><h2>{month} 이용권 발급</h2></div></div><form className="booking-admin-stack-form" onSubmit={issue}><label>승인 회원<select name="memberId" required defaultValue=""><option value="" disabled>회원을 선택하세요</option>{approved.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.loginId ?? member.phoneLast4}</option>)}</select></label><label>이용권<select name="type" defaultValue="MONTHLY"><option value="MONTHLY">월 이용권 · {won.format(data.settings.monthlyPrice)}</option><option value="DAILY">1회 이용권 · {won.format(data.settings.dailyPrice)}</option></select></label><label>동시 확정 예약 제한<input name="maxActiveBookings" type="number" min="1" placeholder="비워두면 운영 설정 적용" /></label><button className="solid" disabled={busy || !approved.length}>이용권 발급</button></form></section></div></>;
}

function PaymentAdmin({ data, busy, act }: AdminProps) {
  const paidPasses = new Set(data.payments.filter((payment) => payment.passId && payment.status === "PAID").map((payment) => payment.passId));
  function pay(pass: Pass, status: "PAID" | "UNPAID" | "REFUNDED") {
    const method = status === "PAID" ? window.prompt("결제수단을 입력하세요: CARD 또는 CASH", "CARD")?.toUpperCase() : "CARD";
    if (!method || !["CARD", "CASH"].includes(method)) return;
    void act({ action: "recordPayment", memberId: pass.memberId, passId: pass.id, method, status }, `결제를 ${status === "PAID" ? "완료" : status === "REFUNDED" ? "환불" : "미결제"}로 기록했습니다.`);
  }
  return <div className="booking-admin-split"><section><div className="booking-admin-section-title"><div><span>PASSES</span><h2>이용권</h2></div></div><div className="booking-admin-table">{data.passes.map((pass) => <article key={pass.id}><div><span>{pass.type === "MONTHLY" ? "월 이용권" : "1회 이용권"}</span><strong>{pass.memberName}</strong><small>{pass.validMonth} · {won.format(pass.price)}</small></div><b className={paidPasses.has(pass.id) ? "paid" : "unpaid"}>{paidPasses.has(pass.id) ? "결제 완료" : "현장결제 대기"}</b><button disabled={busy} onClick={() => pay(pass, "PAID")}>결제 등록</button></article>)}{!data.passes.length && <Empty>선택한 월의 이용권이 없습니다.</Empty>}</div></section><section><div className="booking-admin-section-title"><div><span>PAYMENTS</span><h2>최근 결제 기록</h2></div></div><div className="booking-admin-table compact">{data.payments.map((payment) => <article key={payment.id}><div><span>{payment.method === "CASH" ? "현금" : "카드"}</span><strong>{payment.memberName}</strong><small>{won.format(payment.amount)} · {payment.createdAt.slice(0,16)}</small></div><b className={payment.status.toLowerCase()}>{payment.status === "PAID" ? "결제 완료" : payment.status === "REFUNDED" ? "환불" : "미결제"}</b></article>)}{!data.payments.length && <Empty>결제 기록이 없습니다.</Empty>}</div></section></div>;
}

function GrowthAdmin({ data, busy, act }: AdminProps) {
  function answer(row: Feedback) { const adminReply = window.prompt("회원에게 표시할 피드백 답변", row.adminReply); if (adminReply) void act({ action: "answerFeedback", feedbackId: row.id, adminReply }, "피드백 답변을 저장했습니다."); }
  function evaluate(row: Evaluation) {
    const value = window.prompt("기술, 일관성, 관능, 규정 점수와 결과를 쉼표로 입력하세요.\n예: 80,75,82,90,PASS", "80,80,80,80,PASS"); if (!value) return;
    const [technicalScore, consistencyScore, sensoryScore, ruleScore, result] = value.split(",").map((item) => item.trim());
    if (!result) return;
    const ethicsStatus = window.prompt("직업윤리 상태", "CLEAR") ?? ""; const note = window.prompt("평가 메모(선택)", row.note) ?? "";
    void act({ action: "saveEvaluation", evaluationId: row.id, technicalScore, consistencyScore, sensoryScore, ruleScore, result, ethicsStatus, note }, "내부평가를 완료했습니다.");
  }
  function candidate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); void act({ action: "saveCandidate", ...values }, "후보 상태를 수동으로 저장했습니다."); }
  return <><div className="booking-admin-split"><section><div className="booking-admin-section-title"><div><span>FEEDBACK</span><h2>피드백 요청</h2></div></div><div className="booking-admin-table">{data.feedback.map((row) => <article key={row.id}><div><span>{row.status === "REQUESTED" ? "답변 대기" : "답변 완료"}</span><strong>{row.memberName}</strong><small>{row.message}</small></div><button disabled={busy} onClick={() => answer(row)}>답변</button></article>)}{!data.feedback.length && <Empty>피드백 요청이 없습니다.</Empty>}</div></section><section><div className="booking-admin-section-title"><div><span>EVALUATION</span><h2>내부평가</h2></div></div><div className="booking-admin-table">{data.evaluations.map((row) => <article key={row.id}><div><span>{row.status === "COMPLETED" ? "평가 완료" : "평가 요청"}</span><strong>{row.memberName}</strong><small>{row.result || "점수 입력 대기"}</small></div><button disabled={busy} onClick={() => evaluate(row)}>{row.status === "COMPLETED" ? "재평가" : "평가"}</button></article>)}{!data.evaluations.length && <Empty>내부평가 신청이 없습니다.</Empty>}</div></section></div><section className="booking-admin-candidate"><div><span>OPPORTUNITY CANDIDATE</span><h2>활동 후보 수동 관리</h2><p>내부평가 결과는 후보 선정으로 자동 연결되지 않습니다. 관리자가 이해상충을 확인한 뒤 직접 결정합니다.</p></div><form onSubmit={candidate}><select name="memberId" required defaultValue=""><option value="" disabled>회원 선택</option>{data.members.filter((member) => member.approvalStatus === "APPROVED").map((member) => <option key={member.id} value={member.id}>{member.name} · {member.phoneLast4}</option>)}</select><select name="type"><option value="MONTHLY_COFFEE_CONTENT">월간커피 콘텐츠</option><option value="KCL_JUDGE">KCL 심사</option></select><select name="status"><option value="TRAINING">훈련 중</option><option value="ELIGIBLE">자격 검토 가능</option><option value="UNDER_REVIEW">검토 중</option><option value="SELECTED">선정</option><option value="NOT_SELECTED">미선정</option><option value="SUSPENDED">보류</option></select><input name="conflictNote" placeholder="이해상충·결정 메모" /><button className="solid" disabled={busy}>수동 저장</button></form><div className="booking-admin-candidate-list">{data.candidates.map((row) => <span key={row.id}><strong>{row.memberName}</strong> · {row.type} · {row.status}</span>)}</div></section></>;
}

function SettingsAdmin({ data, busy, act }: AdminProps) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await act({ action: "updateSettings", ...Object.fromEntries(new FormData(event.currentTarget).entries()) }, "예약 운영 설정을 저장했습니다."); }
  return <form className="booking-admin-settings" onSubmit={submit}><div><span>OPERATING POLICY</span><h2>이용권·예약 정책</h2><p>변경한 가격은 새로 발급하는 이용권과 공개 상담 화면에 반영됩니다.</p></div><label>1회 이용권 가격<input name="dailyPrice" type="number" min="1" defaultValue={data.settings.dailyPrice} required /></label><label>월 이용권 가격<input name="monthlyPrice" type="number" min="1" defaultValue={data.settings.monthlyPrice} required /></label><label>회원 취소 가능 시간<input name="cancelHours" type="number" min="0" defaultValue={data.settings.cancelHours} required /><small>예약 시작 몇 시간 전까지 취소할 수 있는지 설정합니다.</small></label><label>동시 확정 예약 제한<input name="maxActiveBookings" type="number" min="1" defaultValue={data.settings.maxActiveBookings ?? ""} placeholder="제한 없음" /><small>비워두면 제한하지 않습니다.</small></label><button className="solid" disabled={busy}>설정 저장</button></form>;
}

type AdminProps = { data: BookingAdminData; busy: boolean; act: (body: Record<string, unknown>, success: string) => Promise<void> };
function Empty({ children }: { children: React.ReactNode }) { return <div className="booking-admin-empty">{children}</div>; }
function rank(status: string) { return ["REQUESTED", "CONFIRMED", "COMPLETED", "NO_SHOW", "REJECTED", "CANCELLED"].indexOf(status); }
function koreanMonth() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7); }
function datesInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}
function utcWeekday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
function dateTime(value: string) { return `${value.slice(5, 10).replace("-", ".")} ${value.slice(11, 16)}`; }
function fullDate(date: string) { const parts = date.split("-"); return `${Number(parts[1])}월 ${Number(parts[2])}일 ${["일","월","화","수","목","금","토"][new Date(`${date}T00:00:00+09:00`).getDay()]}요일`; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "요청을 처리하지 못했습니다."; }
async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } }); const result = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(result.error ?? "요청을 처리하지 못했습니다."); return result; }
