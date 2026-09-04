"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

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
type PublicSlot = Pick<Slot, "stationType" | "stationName" | "startAt" | "endAt">;
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
type PracticeLog = { id: number; reservationId: number; stationType: string; recipeData: string; sensoryNote: string; reflection: string; updatedAt: string };
type BookingData = {
  member: Member;
  month: string;
  slots: Slot[];
  reservations: Reservation[];
  payments: Array<{ id: number; amount: number; status: string }>;
  feedback: Array<{ id: number; reservationId: number; message: string; status: string; adminReply: string }>;
  practiceLogs: PracticeLog[];
  settings: { cancelHours: number };
};
type PublicAvailability = { month: string; updatedAt: string; slots: PublicSlot[]; consultationUrl: string };
type Entry = "student" | "visitor" | "consultation" | null;
type MemberTab = "schedule" | "reservations" | "practice";

const stationLabels: Record<string, string> = { ESPRESSO: "에스프레소", BREWING: "브루잉", ROASTING: "로스팅" };
const slotLabels: Record<Slot["displayStatus"], string> = { AVAILABLE: "예약 가능", REQUESTED: "승인 대기", CONFIRMED: "내 예약", RESERVED: "예약 완료", BLOCKED: "이용 불가" };
const reservationLabels: Record<Reservation["status"], string> = { REQUESTED: "승인 대기", CONFIRMED: "예약 확정", COMPLETED: "이용 완료", CANCELLED: "취소", REJECTED: "거절", NO_SHOW: "노쇼" };

export function BookingPortal({ initialEntry = null, initialShowHome = false }: { initialEntry?: Entry; initialShowHome?: boolean }) {
  const [member, setMember] = useState<Member | null>(null);
  const [showHome, setShowHome] = useState(initialShowHome);
  const [authLoading, setAuthLoading] = useState(true);
  const [entry, setEntry] = useState<Entry>(initialEntry);
  const [memberTab, setMemberTab] = useState<MemberTab>("schedule");
  const [month, setMonth] = useState(currentMonth());
  const [memberData, setMemberData] = useState<BookingData | null>(null);
  const [availability, setAvailability] = useState<PublicAvailability | null>(null);
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

  const loadMemberData = useCallback(async () => {
    if (!member) return;
    try {
      setMemberData(await requestJson<BookingData>(`/api/booking/member?month=${encodeURIComponent(month)}`));
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    }
  }, [member, month]);

  const loadAvailability = useCallback(async () => {
    try {
      setAvailability(await requestJson<PublicAvailability>(`/api/booking/public/availability?month=${encodeURIComponent(month)}`));
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    }
  }, [month]);

  useEffect(() => {
    // Initial remote session lookup; state changes after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMember();
  }, [loadMember]);
  useEffect(() => {
    // Refresh signed-in member data when the selected month changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMemberData();
  }, [loadMemberData]);
  useEffect(() => {
    // Public availability is safe to preload and stays synchronized with administrator changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAvailability();
    const refresh = window.setInterval(() => void loadAvailability(), 30_000);
    return () => window.clearInterval(refresh);
  }, [loadAvailability]);
  useEffect(() => {
    if (authLoading || !entry) return;
    const target = document.getElementById("portal-entry-content");
    if (!target) return;
    const frame = window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [authLoading, entry]);

  async function submitPublic(event: FormEvent<HTMLFormElement>, endpoint: string) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      const result = await requestJson<{ message?: string; member?: Member }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      if (result.member) {
        setMember(result.member);
        setShowHome(false);
        setMemberTab("schedule");
      } else {
        form.reset();
        setEntry("visitor");
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
      setMemberData(null);
      setShowHome(false);
      setEntry("student");
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) return <main className="portal-loading"><Brand /><p>예약 시스템을 불러오고 있습니다.</p></main>;

  if (member && !showHome) {
    return (
      <main className="portal-member">
        <header className="portal-member-header">
          <div className="portal-member-home">
            <Brand compact />
            <button type="button" onClick={() => { setEntry(null); setShowHome(true); }}>스테이션 홈</button>
          </div>
          <nav aria-label="수강생 메뉴">
            <button className={memberTab === "schedule" ? "active" : ""} onClick={() => setMemberTab("schedule")}>스케줄</button>
            <button className={memberTab === "reservations" ? "active" : ""} onClick={() => setMemberTab("reservations")}>내 예약</button>
            <button className={memberTab === "practice" ? "active" : ""} onClick={() => setMemberTab("practice")}>실습 기록</button>
          </nav>
          <div className="portal-member-account"><span><b>{member.name}</b><small>승인 수강생</small></span><button onClick={() => void logout()} disabled={busy}>로그아웃</button></div>
        </header>
        <section className="portal-member-main">
          {!memberData ? <Empty>수강생 예약 정보를 불러오는 중입니다.</Empty> : <>
            {memberTab === "schedule" && <MemberSchedule data={memberData} month={month} setMonth={setMonth} reload={loadMemberData} notify={setMessage} />}
            {memberTab === "reservations" && <MemberReservations data={memberData} reload={loadMemberData} notify={setMessage} />}
            {memberTab === "practice" && <MemberPractice data={memberData} reload={loadMemberData} notify={setMessage} />}
          </>}
        </section>
        <nav className="portal-mobile-nav" aria-label="모바일 수강생 메뉴">
          <button onClick={() => { setEntry(null); setShowHome(true); }}>홈</button>
          <button className={memberTab === "schedule" ? "active" : ""} onClick={() => setMemberTab("schedule")}>스케줄</button>
          <button className={memberTab === "reservations" ? "active" : ""} onClick={() => setMemberTab("reservations")}>내 예약</button>
          <button className={memberTab === "practice" ? "active" : ""} onClick={() => setMemberTab("practice")}>기록</button>
        </nav>
        {message && <Toast value={message} close={() => setMessage(null)} />}
      </main>
    );
  }

  return (
    <main className="portal-public">
      <header className="portal-header"><Link href="/?home=1" aria-label="스테이션 처음 화면"><Brand compact /></Link><div className="portal-header-actions">{member && <button type="button" onClick={() => setShowHome(false)}>내 수강 화면</button>}<span>STATION RESERVATION</span></div></header>
      <section className="portal-intro">
        <div><span>THE CUP EDU · COFFEE STATION</span><h1>필요한 스테이션을<br />간단하게 확인하고 예약하세요.</h1><p>계정 유형에 따라 필요한 기능만 보여드립니다.</p></div>
        <div className="portal-role-grid">
          <Link href="/?view=visitor#portal-entry-content" className={entry === "visitor" ? "active" : ""} aria-current={entry === "visitor" ? "page" : undefined} onClick={(event) => { if (!member) return; event.preventDefault(); setEntry("visitor"); setShowHome(true); }}><span>01</span><h2>수업 예정자</h2><p>로그인 없이 월별로 남은 스테이션을 확인합니다.</p><b>빈자리 보기 →</b></Link>
          <Link href="/?view=student#portal-entry-content" className={entry === "student" ? "active" : ""} aria-current={entry === "student" ? "page" : undefined} onClick={(event) => { if (!member) return; event.preventDefault(); setShowHome(false); }}><span>02</span><h2>수강생</h2><p>승인된 본인 이름과 연락처로 로그인하고 예약합니다.</p><b>{member ? "내 수강 화면 →" : "수강생 로그인 →"}</b></Link>
          <Link href="/admin"><span>03</span><h2>운영자</h2><p>상담, 회원, 스테이션과 예약을 관리합니다.</p><b>운영자 로그인 →</b></Link>
        </div>
      </section>

      {entry === "student" && <section id="portal-entry-content" className="portal-entry-panel"><div className="portal-panel-copy"><span>STUDENT LOGIN</span><h2>수강생 로그인</h2><p>승인받은 본인 이름과 등록된 휴대폰 번호를 입력하세요.</p></div><form onSubmit={(event) => void submitPublic(event, "/api/member-auth/login")}><label>이름<input name="name" autoComplete="name" placeholder="본인 이름" maxLength={40} required /></label><label>등록된 휴대폰 번호<input name="phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="010-0000-0000" required /></label><button disabled={busy}>{busy ? "확인 중…" : "로그인"}</button></form></section>}

      {entry === "visitor" && <VisitorSchedule month={month} setMonth={setMonth} availability={availability} />}

      {entry === "consultation" && <section id="portal-entry-content" className="portal-entry-panel portal-consultation"><div className="portal-panel-copy"><span>CONSULTATION</span><h2>이용 상담 신청</h2><p>신청 후 관리자가 승인하면 본인 이름과 연락처로 바로 이용할 수 있습니다.</p></div><form onSubmit={(event) => void submitPublic(event, "/api/booking/public/consultations")}><label>이름<input name="name" required maxLength={40} /></label><label>휴대폰 번호<input name="phone" type="tel" inputMode="numeric" required /></label><label>관심 스테이션<select name="desiredStationType" defaultValue="ESPRESSO"><option value="ESPRESSO">에스프레소</option><option value="BREWING">브루잉</option><option value="ROASTING">로스팅</option><option value="OTHER">상담 후 결정</option></select></label><label className="wide">상담 내용<textarea name="consultationMemo" rows={3} maxLength={500} required /></label><button className="wide" disabled={busy}>{busy ? "접수 중…" : "상담 신청"}</button></form></section>}

      {!entry && <section className="portal-quick-guide"><span>운영 시간</span><strong>09:00–17:30</strong><p>09:00–11:30 · 12:00–14:30 · 15:00–17:30</p></section>}
      <footer className="portal-footer"><Brand compact /><p>예약은 운영자 승인 후 확정됩니다.</p></footer>
      {message && <Toast value={message} close={() => setMessage(null)} />}
    </main>
  );
}

function VisitorSchedule({ month, setMonth, availability }: { month: string; setMonth: (value: string) => void; availability: PublicAvailability | null }) {
  const slots = useMemo(
    () => availability?.month === month ? availability.slots : [],
    [availability, month],
  );
  const dates = useMemo(() => [...new Set(slots.map((slot) => slot.startAt.slice(0, 10)))], [slots]);
  const [picked, setPicked] = useState("");
  const selected = dates.includes(picked) ? picked : dates[0] ?? `${month}-01`;
  return <section id="portal-entry-content" className="portal-schedule-section"><SectionHeading eyebrow="AVAILABLE STATIONS" title="월별 남은 스테이션" text="예약이 가능한 날짜와 시간만 표시됩니다."><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></SectionHeading><CalendarBoard month={month} slots={slots} selected={selected} setSelected={setPicked} renderSlot={(slot) => <article className="portal-slot available" key={`${slot.stationName}-${slot.startAt}`}><div><span>{stationLabels[slot.stationType] ?? slot.stationType}</span><h3>{slot.stationName}</h3><p>{timeRange(slot)}</p></div><b>예약 가능</b></article>} /><div className="portal-guest-action"><div><strong>예약을 원하시나요?</strong><p>{availability?.consultationUrl ? "더컵에듀 카카오톡에서 바로 상담해 주세요." : "상담 후 승인을 받으면 본인 이름과 연락처로 직접 예약할 수 있습니다."}</p></div>{availability?.consultationUrl ? <a href={availability.consultationUrl}>카카오톡 상담</a> : <Link href="/?view=consultation#portal-entry-content">이용 상담 신청</Link>}</div></section>;
}

function MemberSchedule({ data, month, setMonth, reload, notify }: { data: BookingData; month: string; setMonth: (value: string) => void; reload: () => Promise<void>; notify: Notify }) {
  const [filter, setFilter] = useState("ALL");
  const [picked, setPicked] = useState("");
  const [requestSlot, setRequestSlot] = useState<Slot | null>(null);
  const slots = data.slots.filter((slot) => filter === "ALL" || slot.stationType === filter);
  const dates = useMemo(() => [...new Set(slots.map((slot) => slot.startAt.slice(0, 10)))], [slots]);
  const selected = dates.includes(picked) ? picked : dates[0] ?? `${month}-01`;
  async function reserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestSlot) return;
    const values = new FormData(event.currentTarget);
    try {
      await requestJson("/api/booking/member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "requestReservation", slotId: requestSlot.id, purpose: values.get("purpose"), materialPlan: values.get("materialPlan"), openToPeerPractice: values.get("openToPeerPractice") === "YES", userMemo: values.get("userMemo") }) });
      setRequestSlot(null); await reload(); notify({ kind: "ok", text: "예약 요청을 접수했습니다. 운영자 승인 후 확정되며 이용 당일 현장에서 결제합니다." });
    } catch (error) { notify({ kind: "error", text: errorText(error) }); }
  }
  return <><SectionHeading eyebrow="STUDENT SCHEDULE" title="스테이션 예약" text="승인된 수강생은 원하는 시간을 바로 예약할 수 있습니다."><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></SectionHeading><div className="portal-schedule-toolbar"><div>{["ALL","ESPRESSO","BREWING","ROASTING"].map((type) => <button key={type} className={filter === type ? "active" : ""} onClick={() => setFilter(type)}>{type === "ALL" ? "전체" : stationLabels[type]}</button>)}</div><span>이용 당일 현장결제</span></div><CalendarBoard month={month} slots={slots} selected={selected} setSelected={setPicked} available={(slot) => (slot as Slot).displayStatus === "AVAILABLE"} renderSlot={(value) => { const slot = value as Slot; return <article className={`portal-slot ${slot.displayStatus.toLowerCase()}`} key={slot.id}><div><span>{stationLabels[slot.stationType] ?? slot.stationType}</span><h3>{slot.stationName}</h3><p>{timeRange(slot)}</p></div><b>{slotLabels[slot.displayStatus]}</b>{slot.displayStatus === "AVAILABLE" && <button onClick={() => setRequestSlot(slot)}>예약 요청</button>}</article>; }} />{requestSlot && <div className="portal-modal-backdrop"><form className="portal-modal" onSubmit={reserve}><button type="button" className="close" onClick={() => setRequestSlot(null)}>×</button><span>RESERVATION REQUEST</span><h2>{shortDate(requestSlot.startAt)} · {timeRange(requestSlot)}</h2><p>{requestSlot.stationName}</p><label>실습 목적<select name="purpose" defaultValue="ESPRESSO"><option value="ESPRESSO">에스프레소</option><option value="STEAMING">스티밍</option><option value="BREWING">브루잉</option><option value="ROASTING">로스팅</option><option value="OTHER">기타</option></select></label><label>재료 사용<select name="materialPlan"><option value="SELF">본인 지참</option><option value="CENTER">센터 재료 사용 · 이용 금액 포함</option></select></label><label>함께 연습<select name="openToPeerPractice"><option value="NO">혼자 연습</option><option value="YES">함께 연습 가능</option></select></label><label>전달 메모<textarea name="userMemo" rows={3} maxLength={500} /></label><button className="submit">예약 요청</button></form></div>}</>;
}

function CalendarBoard<T extends PublicSlot>({ month, slots, selected, setSelected, renderSlot, available = () => true }: { month: string; slots: T[]; selected: string; setSelected: (date: string) => void; renderSlot: (slot: T) => ReactNode; available?: (slot: T) => boolean }) {
  const days = calendarCells(month);
  const dates = [...new Set(slots.map((slot) => slot.startAt.slice(0, 10)))];
  const daySlots = slots.filter((slot) => slot.startAt.startsWith(selected));
  const countForDate = (date: string) => slots.filter((slot) => slot.startAt.startsWith(date) && available(slot)).length;
  const availableCount = slots.filter(available).length;
  return (
    <>
      <div className={availableCount ? "portal-availability-summary has-availability" : "portal-availability-summary"} aria-live="polite">
        <span>현재 예약 가능</span>
        <strong>{availableCount}개 시간</strong>
        <small>{availableCount ? "초록색 날짜를 선택하면 가능한 시간대를 확인할 수 있습니다." : "현재 선택한 월에는 예약 가능한 시간이 없습니다."}</small>
      </div>
      <div className="portal-mobile-dates">
        {dates.map((date) => {
          const count = countForDate(date);
          return <button key={date} className={[selected === date ? "active" : "", count ? "has-availability" : ""].filter(Boolean).join(" ")} onClick={() => setSelected(date)}><b>{date.slice(8)}</b><span>{weekday(date)}</span><small>{count ? `${count}개` : "마감"}</small></button>;
        })}
      </div>
      <div className="portal-calendar-layout">
        <div className="portal-calendar">
          <div className="weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="days">
            {days.map((day, index) => day === null ? <span key={`blank-${index}`} /> : (() => {
              const date = `${month}-${String(day).padStart(2, "0")}`;
              const count = countForDate(date);
              return <button key={day} className={[selected === date ? "active" : "", count ? "has-availability" : ""].filter(Boolean).join(" ")} onClick={() => setSelected(date)}><b>{day}</b>{count > 0 && <small>{count}개 가능</small>}</button>;
            })())}
          </div>
        </div>
        <aside className="portal-day-panel"><header><span>선택일</span><h2>{longDate(selected)}</h2></header><div>{daySlots.length ? daySlots.map(renderSlot) : <Empty>이 날짜에는 남아 있는 스테이션이 없습니다.</Empty>}</div></aside>
      </div>
    </>
  );
}

function MemberReservations({ data, reload, notify }: { data: BookingData; reload: () => Promise<void>; notify: Notify }) {
  const [filter, setFilter] = useState("ACTIVE");
  const rows = data.reservations.filter((row) => filter === "ACTIVE" ? ["REQUESTED","CONFIRMED"].includes(row.status) : row.status === filter);
  async function cancel(id: number) { try { await requestJson("/api/booking/member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancelReservation", reservationId: id }) }); await reload(); notify({ kind: "ok", text: "예약을 취소했습니다." }); } catch (error) { notify({ kind: "error", text: errorText(error) }); } }
  async function feedback(id: number) { const value = window.prompt("운영자에게 요청할 피드백을 입력해 주세요."); if (!value) return; try { await requestJson("/api/booking/member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "requestFeedback", reservationId: id, message: value }) }); await reload(); notify({ kind: "ok", text: "피드백을 요청했습니다." }); } catch (error) { notify({ kind: "error", text: errorText(error) }); } }
  return <><SectionHeading eyebrow="MY RESERVATIONS" title="내 예약" text="본인의 예약 상태와 운영자 안내만 표시됩니다." /><div className="portal-filter">{[["ACTIVE","대기·확정"],["COMPLETED","완료"],["CANCELLED","취소"],["REJECTED","거절"]].map(([value,label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div><div className="portal-reservations">{rows.length ? rows.map((row) => <article key={row.id}><div><span>{reservationLabels[row.status]}</span><h2>{shortDate(row.startAt)} · {timeRange(row)}</h2><p>{row.stationName} · {row.purpose}</p><small>{row.materialPlan === "SELF" ? "재료 본인 지참" : "센터 재료 사용 · 이용 금액 포함"} · 이용 당일 현장결제</small>{row.adminMemo && <small>운영자 안내 · {row.adminMemo}</small>}{row.rejectionReason && <small>거절 사유 · {row.rejectionReason}</small>}</div><div>{["REQUESTED","CONFIRMED"].includes(row.status) && <button onClick={() => void cancel(row.id)}>예약 취소</button>}{["CONFIRMED","COMPLETED"].includes(row.status) && <button onClick={() => void feedback(row.id)}>피드백 요청</button>}</div></article>) : <Empty>해당 상태의 예약이 없습니다.</Empty>}</div></>;
}

function MemberPractice({ data, reload, notify }: { data: BookingData; reload: () => Promise<void>; notify: Notify }) {
  const completed = data.reservations.filter((row) => row.status === "COMPLETED");
  const [picked, setPicked] = useState(0);
  const selected = completed.some((row) => row.id === picked) ? picked : completed[0]?.id ?? 0;
  const existing = data.practiceLogs.find((row) => row.reservationId === selected);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { await requestJson("/api/booking/member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "savePracticeLog", reservationId: selected, ...Object.fromEntries(new FormData(event.currentTarget).entries()) }) }); await reload(); notify({ kind: "ok", text: "실습 기록을 저장했습니다." }); } catch (error) { notify({ kind: "error", text: errorText(error) }); } }
  return <><SectionHeading eyebrow="PRACTICE LOG" title="실습 기록" text="완료된 예약에 레시피와 개선 내용을 기록합니다." /><div className="portal-practice"><aside>{completed.map((row) => <button key={row.id} className={selected === row.id ? "active" : ""} onClick={() => setPicked(row.id)}><b>{shortDate(row.startAt)}</b><span>{row.stationName}</span></button>)}{!completed.length && <p>완료된 예약이 없습니다.</p>}</aside>{selected ? <form key={`${selected}-${existing?.updatedAt ?? "new"}`} onSubmit={save}><label>레시피·프로파일<textarea name="recipeData" rows={4} defaultValue={existing?.recipeData ?? ""} /></label><label>관능 기록<textarea name="sensoryNote" rows={4} defaultValue={existing?.sensoryNote ?? ""} /></label><label>개선 메모<textarea name="reflection" rows={4} defaultValue={existing?.reflection ?? ""} /></label><button>기록 저장</button></form> : <Empty>기록할 완료 예약을 선택해 주세요.</Empty>}</div></>;
}

function SectionHeading({ eyebrow, title, text, children }: { eyebrow: string; title: string; text: string; children?: ReactNode }) { return <header className="portal-section-heading"><div><span>{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{children}</header>; }
function Brand({ compact = false }: { compact?: boolean }) { return <span className={`portal-brand${compact ? " compact" : ""}`}><b>THE CUP EDU</b><small>COFFEE STATION</small></span>; }
function Empty({ children }: { children: ReactNode }) { return <div className="portal-empty">{children}</div>; }
function Toast({ value, close }: { value: { kind: "ok" | "error"; text: string }; close: () => void }) { return <button className={`portal-toast ${value.kind}`} onClick={close}>{value.text}</button>; }
type Notify = (value: { kind: "ok" | "error"; text: string }) => void;
function currentMonth() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date()).slice(0,7); }
function timeRange(value: { startAt: string; endAt: string }) { return `${value.startAt.slice(11,16)}–${value.endAt.slice(11,16)}`; }
function shortDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(new Date(value)); }
function weekday(date: string) { return ["일","월","화","수","목","금","토"][new Date(`${date}T00:00:00+09:00`).getDay()]; }
function longDate(date: string) { const [year,month,day] = date.split("-").map(Number); return `${year}년 ${month}월 ${day}일 ${weekday(date)}요일`; }
function calendarCells(month: string): Array<number | null> { const [year,value] = month.split("-").map(Number); const first = new Date(Date.UTC(year,value-1,1)).getUTCDay(); const days = new Date(Date.UTC(year,value,0)).getUTCDate(); return [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_,index) => index+1)]; }
function errorText(error: unknown) { return error instanceof Error ? error.message : "요청을 처리하지 못했습니다."; }
async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } }); const result = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(result.error ?? "요청을 처리하지 못했습니다."); return result; }
