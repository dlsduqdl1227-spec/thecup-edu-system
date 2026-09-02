"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Member = { id: number; name: string; approvalStatus: "APPROVED" };
type Slot = {
  id: number;
  stationId: number;
  stationType: string;
  stationName: string;
  startAt: string;
  endAt: string;
  blockReason: string;
  displayStatus: "AVAILABLE" | "REQUESTED" | "CONFIRMED" | "RESERVED" | "BLOCKED";
};
type Reservation = {
  id: number;
  slotId: number;
  status: "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "REJECTED" | "NO_SHOW";
  purpose: string;
  materialPlan: string;
  openToPeerPractice: number;
  userMemo: string;
  adminMemo: string;
  rejectionReason: string;
  createdAt: string;
  confirmedAt: string | null;
  startAt: string;
  endAt: string;
  stationType: string;
  stationName: string;
};
type MemberPass = {
  id: number;
  type: "DAILY" | "MONTHLY";
  validMonth: string;
  price: number;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  maxActiveBookings: number | null;
};
type Payment = {
  id: number;
  reservationId: number | null;
  passId: number | null;
  amount: number;
  method: "CARD" | "CASH";
  status: "UNPAID" | "PAID" | "REFUNDED";
  paidAt: string | null;
};
type PracticeLog = {
  id: number;
  reservationId: number;
  stationType: string;
  recipeData: string;
  sensoryNote: string;
  reflection: string;
  updatedAt: string;
};
type Evaluation = {
  id: number;
  status: "PREPARING" | "REQUESTED" | "COMPLETED";
  result: string;
  ethicsStatus: string;
  requestedAt: string;
  evaluatedAt: string | null;
};
type BookingData = {
  member: Member;
  month: string;
  slots: Slot[];
  reservations: Reservation[];
  passes: MemberPass[];
  payments: Payment[];
  feedback: Array<{ id: number; reservationId: number; message: string; status: string; adminReply: string }>;
  practiceLogs: PracticeLog[];
  evaluations: Evaluation[];
  settings: { dailyPrice: number; monthlyPrice: number; cancelHours: number; maxActiveBookings: number | null };
};

type MemberTab = "dashboard" | "schedule" | "reservations" | "practice";
type PublicTab = "consultation" | "login";
type PublicSettings = { dailyPrice: number; monthlyPrice: number };

const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const stationLabels: Record<string, string> = {
  ESPRESSO: "에스프레소",
  BREWING: "브루잉",
  ROASTING: "로스팅",
};
const statusLabels: Record<Slot["displayStatus"], string> = {
  AVAILABLE: "예약 가능",
  REQUESTED: "승인 대기",
  CONFIRMED: "내 예약 확정",
  RESERVED: "예약 완료",
  BLOCKED: "이용 불가",
};
const reservationLabels: Record<Reservation["status"], string> = {
  REQUESTED: "승인 대기",
  CONFIRMED: "확정",
  COMPLETED: "완료",
  CANCELLED: "취소",
  REJECTED: "거절",
  NO_SHOW: "노쇼",
};

export function BookingPortal() {
  const [member, setMember] = useState<Member | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [publicTab, setPublicTab] = useState<PublicTab>("consultation");
  const [memberTab, setMemberTab] = useState<MemberTab>("dashboard");
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<BookingData | null>(null);
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const loadMember = useCallback(async () => {
    try {
      const status = await requestJson<{ member: Member | null }>("/api/member-auth/status");
      setMember(status.member);
    } catch {
      setMember(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!member) return;
    try {
      setData(await requestJson<BookingData>(`/api/booking/member?month=${encodeURIComponent(month)}`));
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    }
  }, [member, month]);

  useEffect(() => {
    // Initial remote session lookup; state changes after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMember();
  }, [loadMember]);
  useEffect(() => {
    // Load the signed-in member's month whenever identity or month changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);
  useEffect(() => {
    void requestJson<PublicSettings>("/api/booking/public/consultations")
      .then(setPublicSettings)
      .catch(() => setPublicSettings(null));
  }, []);

  async function submitPublic(event: FormEvent<HTMLFormElement>, endpoint: string) {
    event.preventDefault();
    setBusy(true);
    try {
      const form = event.currentTarget;
      const result = await requestJson<{ message?: string; member?: Member }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      if (result.member) {
        setMember(result.member);
        setMemberTab("dashboard");
      } else {
        form.reset();
      }
      setMessage({ kind: "ok", text: result.message ?? "처리되었습니다." });
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await requestJson("/api/member-auth/logout", { method: "POST" });
      setMember(null);
      setData(null);
      setPublicTab("login");
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return <main className="booking-loading"><BookingBrand /><p>예약 시스템을 준비하고 있습니다.</p></main>;
  }

  if (!member) {
    return (
      <main className="booking-public-page">
        <header className="booking-public-header">
          <BookingBrand />
          <a href="/admin">운영자 로그인</a>
        </header>
        <section className="booking-hero">
          <div className="booking-hero-copy">
            <span>CONSULTATION-APPROVED COFFEE STATION</span>
            <h1>연습이 필요한 순간,<br />준비된 커피 스테이션.</h1>
            <p>상담과 승인 후 에스프레소·브루잉·로스팅 스테이션을 예약하고, 실습 기록까지 한곳에서 관리하세요.</p>
            <div className="booking-hero-actions">
              <button type="button" className="booking-primary" onClick={() => setPublicTab("consultation")}>상담 신청</button>
              <button type="button" className="booking-secondary" onClick={() => setPublicTab("login")}>승인 회원 로그인</button>
            </div>
            <small>상담 후 승인된 회원만 스케줄을 확인할 수 있습니다.</small>
          </div>
          <div className="booking-service-card" aria-label="운영 안내">
            <span>운영시간</span><strong>09:00 — 18:00</strong>
            <ol>
              <li><b>01</b><span>09:00–11:30</span></li>
              <li><b>02</b><span>12:00–14:30</span></li>
              <li><b>03</b><span>15:00–17:30</span></li>
            </ol>
            <p>각 타임 2시간 30분 · 타임 사이 30분 정리</p>
          </div>
        </section>
        <section className="booking-process" aria-label="이용 절차">
          {["상담 신청", "관리자 승인", "예약 요청", "현장 이용"].map((label, index) => (
            <article key={label}><span>0{index + 1}</span><strong>{label}</strong></article>
          ))}
        </section>
        <section className="booking-public-form-section" id="booking-access">
          <div className="booking-public-tabs" role="tablist">
            <button type="button" className={publicTab === "consultation" ? "active" : ""} onClick={() => setPublicTab("consultation")}>상담 신청</button>
            <button type="button" className={publicTab === "login" ? "active" : ""} onClick={() => setPublicTab("login")}>회원 로그인</button>
          </div>
          {publicTab === "consultation" ? (
            <form className="booking-access-form" onSubmit={(event) => void submitPublic(event, "/api/booking/public/consultations")}>
              <div><span>01</span><h2>상담 신청</h2><p>희망하는 실습과 이용 방식을 알려주시면 상담 후 회원 승인을 도와드립니다.</p></div>
              <label>이름<input name="name" required maxLength={40} /></label>
              <label>휴대폰 번호<input name="phone" type="tel" inputMode="numeric" placeholder="010-0000-0000" required /></label>
              <label>관심 스테이션<select name="desiredStationType" defaultValue="ESPRESSO"><option value="ESPRESSO">에스프레소</option><option value="BREWING">브루잉</option><option value="ROASTING">로스팅</option><option value="OTHER">상담 후 결정</option></select></label>
              <label className="wide">상담 내용<textarea name="consultationMemo" rows={4} required maxLength={500} placeholder="연습 목적과 희망 시기를 간단히 적어주세요." /></label>
              <button className="booking-primary wide" disabled={busy}>{busy ? "접수 중…" : "상담 신청 접수"}</button>
            </form>
          ) : (
            <form className="booking-access-form booking-login-form" onSubmit={(event) => void submitPublic(event, "/api/member-auth/login")}>
              <div><span>MEMBER</span><h2>승인 회원 로그인</h2><p>상담을 마치고 관리자가 승인한 회원만 이용할 수 있습니다.</p></div>
              <label>이름<input name="name" required maxLength={40} autoComplete="name" /></label>
              <label>휴대폰 번호<input name="phone" type="tel" inputMode="numeric" required autoComplete="tel" /></label>
              <button className="booking-primary wide" disabled={busy}>{busy ? "확인 중…" : "로그인"}</button>
            </form>
          )}
        </section>
        <section className="booking-pass-guide">
          <article><span>DAILY</span><strong>{publicSettings ? won.format(publicSettings.dailyPrice) : "상담 후 안내"}</strong><p>1회 · 1스테이션 · 2시간 30분</p></article>
          <article><span>MONTHLY</span><strong>{publicSettings ? won.format(publicSettings.monthlyPrice) : "상담 후 안내"}</strong><p>평일 기준 1일 1타임 · 재료비 별도</p></article>
        </section>
        {message && <BookingToast message={message} onClose={() => setMessage(null)} />}
      </main>
    );
  }

  return (
    <main className="member-app">
      <header className="member-header">
        <BookingBrand compact />
        <nav aria-label="회원 메뉴">
          <button className={memberTab === "dashboard" ? "active" : ""} onClick={() => setMemberTab("dashboard")}>홈</button>
          <button className={memberTab === "schedule" ? "active" : ""} onClick={() => setMemberTab("schedule")}>스케줄</button>
          <button className={memberTab === "reservations" ? "active" : ""} onClick={() => setMemberTab("reservations")}>내 예약</button>
          <button className={memberTab === "practice" ? "active" : ""} onClick={() => setMemberTab("practice")}>실습 기록</button>
        </nav>
        <div><span>{member.name} 회원</span><button type="button" onClick={() => void logout()} disabled={busy}>로그아웃</button></div>
      </header>
      <section className="member-content">
        {!data ? <div className="booking-empty">회원 예약 정보를 불러오는 중입니다.</div> : (
          <>
            {memberTab === "dashboard" && <MemberDashboard data={data} onNewBooking={() => setMemberTab("schedule")} />}
            {memberTab === "schedule" && <MemberSchedule data={data} month={month} onMonth={setMonth} onUpdated={loadData} notify={setMessage} />}
            {memberTab === "reservations" && <MemberReservations data={data} onUpdated={loadData} notify={setMessage} />}
            {memberTab === "practice" && <MemberPractice data={data} onUpdated={loadData} notify={setMessage} />}
          </>
        )}
      </section>
      <nav className="member-mobile-nav" aria-label="모바일 회원 메뉴">
        <button className={memberTab === "dashboard" ? "active" : ""} onClick={() => setMemberTab("dashboard")}>홈</button>
        <button className={memberTab === "schedule" ? "active" : ""} onClick={() => setMemberTab("schedule")}>스케줄</button>
        <button className={memberTab === "reservations" ? "active" : ""} onClick={() => setMemberTab("reservations")}>내 예약</button>
        <button className={memberTab === "practice" ? "active" : ""} onClick={() => setMemberTab("practice")}>기록</button>
      </nav>
      {message && <BookingToast message={message} onClose={() => setMessage(null)} />}
    </main>
  );
}

function MemberDashboard({ data, onNewBooking }: { data: BookingData; onNewBooking: () => void }) {
  const activePass = data.passes.find((pass) => pass.status === "ACTIVE" && pass.validMonth === data.month);
  const upcoming = data.reservations.filter((reservation) => reservation.status === "CONFIRMED" && new Date(reservation.startAt) > new Date()).sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  const monthReservations = data.reservations.filter((reservation) => reservation.startAt.startsWith(data.month));
  const unpaid = data.payments.filter((payment) => payment.status === "UNPAID").reduce((sum, payment) => sum + payment.amount, 0);
  return (
    <>
      <div className="member-page-heading"><span>MEMBER DASHBOARD</span><h1>{data.member.name}님, 오늘도 좋은 연습 되세요.</h1><p>예약은 관리자 승인 후 최종 확정됩니다.</p></div>
      <section className="member-kpi-grid">
        <article><span>현재 이용권</span><strong>{activePass ? activePass.type === "MONTHLY" ? "월 이용권" : "1회 이용권" : "없음"}</strong><small>{activePass ? `${activePass.validMonth} · ${won.format(activePass.price)}` : "관리자에게 이용권을 요청해 주세요."}</small></article>
        <article><span>다음 확정 일정</span><strong>{upcoming ? shortDate(upcoming.startAt) : "일정 없음"}</strong><small>{upcoming ? `${timeRange(upcoming)} · ${upcoming.stationName}` : "새 예약을 요청할 수 있습니다."}</small></article>
        <article><span>이번 달 예약</span><strong>{monthReservations.length}<small>건</small></strong><small>승인 대기 {monthReservations.filter((row) => row.status === "REQUESTED").length} · 확정 {monthReservations.filter((row) => row.status === "CONFIRMED").length}</small></article>
        <article><span>현장결제</span><strong>{unpaid ? won.format(unpaid) : "정산 완료"}</strong><small>센터에서 카드 또는 현금으로 결제합니다.</small></article>
      </section>
      <button type="button" className="booking-primary member-new-booking" onClick={onNewBooking}>새 예약 요청</button>
    </>
  );
}

function MemberSchedule({ data, month, onMonth, onUpdated, notify }: { data: BookingData; month: string; onMonth: (month: string) => void; onUpdated: () => Promise<void>; notify: (message: { kind: "ok" | "error"; text: string }) => void }) {
  const [filter, setFilter] = useState("ALL");
  const dates = useMemo(() => [...new Set(data.slots.map((slot) => slot.startAt.slice(0, 10)))], [data.slots]);
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? `${month}-01`);
  const [requestSlot, setRequestSlot] = useState<Slot | null>(null);
  const filtered = data.slots.filter((slot) => (filter === "ALL" || slot.stationType === filter));
  const daySlots = filtered.filter((slot) => slot.startAt.startsWith(selectedDate));
  const calendar = calendarCells(month);
  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestSlot) return;
    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      await requestJson("/api/booking/member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "requestReservation",
          slotId: requestSlot.id,
          purpose: formData.get("purpose"),
          materialPlan: formData.get("materialPlan"),
          openToPeerPractice: formData.get("openToPeerPractice") === "YES",
          userMemo: formData.get("userMemo"),
        }),
      });
      setRequestSlot(null);
      await onUpdated();
      notify({ kind: "ok", text: "예약 요청을 접수했습니다. 관리자 승인 후 확정됩니다." });
    } catch (error) {
      notify({ kind: "error", text: errorText(error) });
    }
  }
  return (
    <>
      <div className="member-page-heading member-heading-row"><div><span>OPEN SCHEDULE</span><h1>스테이션 예약</h1><p>예약 가능 시간을 선택해 승인 요청을 보내세요.</p></div><input type="month" value={month} onChange={(event) => onMonth(event.target.value)} /></div>
      <div className="member-filter-row">{["ALL", "ESPRESSO", "BREWING", "ROASTING"].map((type) => <button type="button" className={filter === type ? "active" : ""} key={type} onClick={() => setFilter(type)}>{type === "ALL" ? "전체" : stationLabels[type]}</button>)}</div>
      <div className="member-mobile-dates">{dates.map((date) => <button type="button" className={selectedDate === date ? "active" : ""} key={date} onClick={() => setSelectedDate(date)}><span>{date.slice(8)}</span><small>{weekday(date)}</small></button>)}</div>
      <section className="member-schedule-layout">
        <div className="member-calendar">
          <div className="member-calendar-weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="member-calendar-days">{calendar.map((day, index) => day === null ? <span className="blank" key={`blank-${index}`} /> : <button type="button" className={selectedDate === `${month}-${String(day).padStart(2, "0")}` ? "active" : ""} key={day} onClick={() => setSelectedDate(`${month}-${String(day).padStart(2, "0")}`)}><b>{day}</b><small>{filtered.filter((slot) => slot.startAt.startsWith(`${month}-${String(day).padStart(2, "0")}`) && slot.displayStatus === "AVAILABLE").length}개 가능</small></button>)}</div>
        </div>
        <div className="member-day-slots">
          <div><span>선택일</span><h2>{longDate(selectedDate)}</h2></div>
          {daySlots.length ? daySlots.map((slot) => <article className={`member-slot-card status-${slot.displayStatus.toLowerCase()}`} key={slot.id}><div><span>{stationLabels[slot.stationType] ?? slot.stationType}</span><h3>{slot.stationName}</h3><p>{timeRange(slot)}</p></div><strong>{statusLabels[slot.displayStatus]}</strong>{slot.displayStatus === "AVAILABLE" && <button type="button" onClick={() => setRequestSlot(slot)}>예약 요청</button>}{slot.displayStatus === "BLOCKED" && slot.blockReason && <small>{slot.blockReason}</small>}</article>) : <div className="booking-empty compact">선택한 날짜에 공개된 운영 시간이 없습니다.</div>}
        </div>
      </section>
      {requestSlot && <div className="booking-modal-backdrop" role="presentation"><form className="booking-request-modal" onSubmit={submitRequest}><button type="button" className="modal-close" onClick={() => setRequestSlot(null)} aria-label="닫기">×</button><span>RESERVATION REQUEST</span><h2>{shortDate(requestSlot.startAt)} · {timeRange(requestSlot)}</h2><p>{requestSlot.stationName}</p><label>실습 목적<select name="purpose" defaultValue="ESPRESSO"><option value="ESPRESSO">에스프레소</option><option value="STEAMING">스티밍</option><option value="BREWING">브루잉</option><option value="ROASTING">로스팅</option><option value="OTHER">기타</option></select></label><label>재료 준비<select name="materialPlan" defaultValue="SELF"><option value="SELF">직접 준비</option><option value="CENTER_PURCHASE">센터 구매 희망</option></select></label><label>함께 연습<select name="openToPeerPractice" defaultValue="NO"><option value="YES">다른 예약자와 함께 연습 가능</option><option value="NO">혼자 연습</option></select></label><label>관리자 전달 메모<textarea name="userMemo" rows={3} maxLength={500} /></label><div className="booking-approval-note">관리자 승인 후 예약이 확정됩니다.</div><button className="booking-primary">예약 요청 제출</button></form></div>}
    </>
  );
}

function MemberReservations({ data, onUpdated, notify }: { data: BookingData; onUpdated: () => Promise<void>; notify: (message: { kind: "ok" | "error"; text: string }) => void }) {
  const [filter, setFilter] = useState("ACTIVE");
  const visible = data.reservations.filter((row) => filter === "ACTIVE" ? ["REQUESTED", "CONFIRMED"].includes(row.status) : row.status === filter);
  async function cancel(id: number) {
    try {
      await requestJson("/api/booking/member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancelReservation", reservationId: id }) });
      await onUpdated();
      notify({ kind: "ok", text: "예약을 취소했습니다." });
    } catch (error) { notify({ kind: "error", text: errorText(error) }); }
  }
  async function feedback(id: number) {
    const message = window.prompt("관리자에게 요청할 피드백을 입력해 주세요.");
    if (!message) return;
    try {
      await requestJson("/api/booking/member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "requestFeedback", reservationId: id, message }) });
      await onUpdated();
      notify({ kind: "ok", text: "피드백을 요청했습니다." });
    } catch (error) { notify({ kind: "error", text: errorText(error) }); }
  }
  return <><div className="member-page-heading"><span>MY SCHEDULE</span><h1>내 예약</h1><p>승인 상태와 확정 일정을 본인만 확인할 수 있습니다.</p></div><div className="member-filter-row">{[["ACTIVE", "대기·확정"], ["COMPLETED", "완료"], ["CANCELLED", "취소"], ["REJECTED", "거절"]].map(([value, label]) => <button type="button" className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div><section className="member-reservation-list">{visible.length ? visible.map((row) => <article key={row.id}><div><span>{reservationLabels[row.status]}</span><h2>{shortDate(row.startAt)} · {timeRange(row)}</h2><p>{row.stationName} · {row.purpose}</p>{row.adminMemo && <small>관리자 안내 · {row.adminMemo}</small>}{row.rejectionReason && <small>거절 사유 · {row.rejectionReason}</small>}</div><div>{["REQUESTED", "CONFIRMED"].includes(row.status) && <button type="button" onClick={() => void cancel(row.id)}>취소 요청</button>}{["CONFIRMED", "COMPLETED"].includes(row.status) && <button type="button" onClick={() => void feedback(row.id)}>피드백 요청</button>}</div></article>) : <div className="booking-empty">해당 상태의 예약이 없습니다.</div>}</section></>;
}

function MemberPractice({ data, onUpdated, notify }: { data: BookingData; onUpdated: () => Promise<void>; notify: (message: { kind: "ok" | "error"; text: string }) => void }) {
  const completed = data.reservations.filter((row) => row.status === "COMPLETED");
  const [selectedId, setSelectedId] = useState(completed[0]?.id ?? 0);
  const existing = data.practiceLogs.find((log) => log.reservationId === selectedId);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      await requestJson("/api/booking/member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "savePracticeLog", reservationId: selectedId, ...values }) });
      await onUpdated(); notify({ kind: "ok", text: "실습 기록을 저장했습니다." });
    } catch (error) { notify({ kind: "error", text: errorText(error) }); }
  }
  async function evaluation() {
    try { await requestJson("/api/booking/member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "requestEvaluation" }) }); await onUpdated(); notify({ kind: "ok", text: "내부평가를 신청했습니다. 결과가 활동 선정으로 자동 연결되지는 않습니다." }); } catch (error) { notify({ kind: "error", text: errorText(error) }); }
  }
  const latestEvaluation = data.evaluations[0];
  return <><div className="member-page-heading"><span>PRACTICE LOG</span><h1>나의 실습 기록</h1><p>완료된 예약에 연결해 레시피, 관능 기록과 개선 메모를 남기세요.</p></div><section className="member-practice-layout"><aside><h2>완료 예약</h2>{completed.map((row) => <button type="button" className={selectedId === row.id ? "active" : ""} key={row.id} onClick={() => setSelectedId(row.id)}><strong>{shortDate(row.startAt)}</strong><span>{row.stationName}</span></button>)}{!completed.length && <p>완료된 예약이 없습니다.</p>}</aside>{selectedId ? <form key={`${selectedId}-${existing?.updatedAt ?? "new"}`} onSubmit={save}><label>레시피·프로파일<textarea name="recipeData" rows={5} defaultValue={existing?.recipeData ?? ""} /></label><label>관능 기록<textarea name="sensoryNote" rows={5} defaultValue={existing?.sensoryNote ?? ""} /></label><label>개선 메모<textarea name="reflection" rows={5} defaultValue={existing?.reflection ?? ""} /></label><button className="booking-primary">기록 저장</button></form> : <div className="booking-empty">기록할 완료 예약을 선택해 주세요.</div>}</section><section className="member-evaluation-card"><div><span>INTERNAL EVALUATION</span><h2>내부평가</h2><p>{latestEvaluation ? `현재 상태 · ${latestEvaluation.status === "COMPLETED" ? "평가 완료" : "평가 신청"}` : "실습 기록을 바탕으로 내부평가를 신청할 수 있습니다."}</p><small>평가 통과는 콘텐츠 출연이나 심사위원 위촉을 의미하지 않습니다.</small></div><button type="button" onClick={() => void evaluation()} disabled={!data.practiceLogs.length || (latestEvaluation && latestEvaluation.status !== "COMPLETED")}>평가 신청</button></section></>;
}

function BookingBrand({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "booking-brand compact" : "booking-brand"}><strong>THE CUP EDU</strong><span>COFFEE STATION</span></div>;
}

function BookingToast({ message, onClose }: { message: { kind: "ok" | "error"; text: string }; onClose: () => void }) {
  return <button type="button" className={`booking-toast ${message.kind}`} onClick={onClose}>{message.text}</button>;
}

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}
function shortDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(new Date(value)); }
function longDate(value: string) { const [year, month, day] = value.split("-").map(Number); return `${year}년 ${month}월 ${day}일 ${weekday(value)}요일`; }
function weekday(value: string) { return ["일", "월", "화", "수", "목", "금", "토"][new Date(`${value}T00:00:00+09:00`).getDay()]; }
function timeRange(value: { startAt: string; endAt: string }) { return `${value.startAt.slice(11, 16)}–${value.endAt.slice(11, 16)}`; }
function calendarCells(month: string): Array<number | null> { const [year, value] = month.split("-").map(Number); const first = new Date(Date.UTC(year, value - 1, 1)).getUTCDay(); const days = new Date(Date.UTC(year, value, 0)).getUTCDate(); return [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_, index) => index + 1)]; }
async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } }); const result = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(result.error ?? "요청을 처리하지 못했습니다."); return result; }
function errorText(error: unknown) { return error instanceof Error ? error.message : "처리 중 오류가 발생했습니다."; }
