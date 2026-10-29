"use client";

import Link from "next/link";
import { requestJson } from "../../lib/api-client";
import { useRequestGuard } from "../../lib/use-request-guard";
import { AccessibleDialog } from "./AccessibleDialog";
import { ScaEducation } from "./ScaEducation";
import { MobileNavigation } from "./MobileNavigation";
import { CourseLanding } from "./CourseLanding";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  enrollmentId: number | null;
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
  instructorConflicts: Array<{ enrollmentId: number; startAt: string; endAt: string }>;
  courseBookingRequired: boolean;
  enrollments: Array<{ id: number; courseName: string; stationType: string; instructorName: string; sessionMinutes: number; totalSessions: number; usedSessions: number; pendingSessions: number; confirmedSessions: number; completedSessions: number; status: string }>;
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
type MemberTab = "schedule" | "reservations" | "practice" | "education";

const stationLabels: Record<string, string> = { ESPRESSO: "에스프레소", BREWING: "브루잉", ROASTING: "로스팅" };
const purposeLabels: Record<string, string> = { ...stationLabels, STEAMING: "스티밍", OTHER: "기타" };
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
  const [memberDataError, setMemberDataError] = useState("");
  const [availability, setAvailability] = useState<PublicAvailability | null>(null);
  const [availabilityError, setAvailabilityError] = useState("");
  const [beginMemberLoad, cancelMemberLoad] = useRequestGuard();
  const [beginAvailabilityLoad, cancelAvailabilityLoad] = useRequestGuard();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (message?.kind !== "ok") return;
    const timer = window.setTimeout(() => setMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);

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
    const isCurrent = beginMemberLoad();
    setMemberDataError("");
    try {
      const next = await requestJson<BookingData>(`/api/booking/member?month=${encodeURIComponent(month)}`);
      if (isCurrent()) setMemberData(next);
    } catch (error) {
      if (!isCurrent()) return;
      setMemberDataError(errorText(error));
      setMessage({ kind: "error", text: errorText(error) });
    }
  }, [member, month, beginMemberLoad]);

  const loadAvailability = useCallback(async () => {
    const isCurrent = beginAvailabilityLoad();
    try {
      const next = await requestJson<PublicAvailability>(`/api/booking/public/availability?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      if (!isCurrent()) return;
      setAvailability(next);
      setAvailabilityError("");
    } catch (error) {
      if (isCurrent()) setAvailabilityError(errorText(error));
    }
  }, [month, beginAvailabilityLoad]);

  useEffect(() => {
    // Initial remote session lookup; state changes after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMember();
  }, [loadMember]);
  useEffect(() => {
    // Refresh signed-in member data when the selected month changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMemberData();
    const refresh = window.setInterval(() => void loadMemberData(), 30_000);
    window.addEventListener("focus", loadMemberData);
    return () => { window.clearInterval(refresh); window.removeEventListener("focus", loadMemberData); cancelMemberLoad(); };
  }, [loadMemberData, cancelMemberLoad]);
  useEffect(() => {
    if (entry !== "visitor") return;
    // Only the optional timetable preview needs the public availability poll.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAvailability();
    const refresh = window.setInterval(() => void loadAvailability(), 30_000);
    window.addEventListener("focus", loadAvailability);
    return () => { window.clearInterval(refresh); window.removeEventListener("focus", loadAvailability); cancelAvailabilityLoad(); };
  }, [entry, loadAvailability, cancelAvailabilityLoad]);
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
      setMessage({ kind: "ok", text: result.message ?? (result.member ? `${result.member.name}님, 로그인되었습니다.` : "상담 신청을 접수했습니다.") });
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
      cancelMemberLoad();
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

  if (authLoading && initialEntry === "student") return <main className="portal-loading" id="main-content" aria-live="polite"><Brand /><p>수강 정보를 불러오고 있습니다.</p></main>;

  if (member && !showHome) {
    return (
      <main className="portal-member" id="main-content">
        <header className="portal-member-header">
          <div className="portal-member-home">
            <Brand compact />
            <button type="button" onClick={() => { setEntry(null); setShowHome(true); }}>교육 홈</button>
          </div>
          <nav aria-label="수강생 메뉴">
            <button className={memberTab === "schedule" ? "active" : ""} onClick={() => setMemberTab("schedule")}>스케줄</button>
            <button className={memberTab === "reservations" ? "active" : ""} onClick={() => setMemberTab("reservations")}>내 예약</button>
            <button className={memberTab === "practice" ? "active" : ""} onClick={() => setMemberTab("practice")}>실습 기록</button>
            <button className={memberTab === "education" ? "active" : ""} onClick={() => setMemberTab("education")}>교육자료</button>
          </nav>
          <div className="portal-member-account"><span><b>{member.name}</b><small>승인 수강생</small></span><button onClick={() => void logout()} disabled={busy}>로그아웃</button></div>
        </header>
        <section className="portal-member-main">
          {memberTab === "education" ? <ScaEducation /> : !memberData ? <Empty>{memberDataError ? <><p role="alert">{memberDataError}</p><button type="button" onClick={() => void loadMemberData()}>다시 불러오기</button></> : "수강생 예약 정보를 불러오는 중입니다."}</Empty> : <>
            {memberTab === "schedule" && <MemberSchedule data={memberData} month={month} setMonth={setMonth} reload={loadMemberData} notify={setMessage} />}
            {memberTab === "reservations" && <MemberReservations data={memberData} reload={loadMemberData} notify={setMessage} />}
            {memberTab === "practice" && <MemberPractice data={memberData} reload={loadMemberData} notify={setMessage} />}
          </>}
        </section>
        <MobileNavigation
          className="portal-mobile-nav"
          label="모바일 수강생 메뉴"
          items={[
            { key: "home", label: "홈" },
            { key: "schedule", label: "스케줄" },
            { key: "reservations", label: "내 예약" },
            { key: "practice", label: "실습 기록" },
            { key: "education", label: "교육자료" },
          ]}
          activeKey={memberTab}
          onSelect={key => { if (key === "home") { setEntry(null); setShowHome(true); } else setMemberTab(key as MemberTab); }}
        />
        {message && <Toast value={message} close={() => setMessage(null)} />}
      </main>
    );
  }

  return (
    <main id="main-content">
      <CourseLanding entry={entry} member={Boolean(member)} onStudent={() => setShowHome(false)}>
      {entry === "student" && <section id="portal-entry-content" className="portal-entry-panel"><div className="portal-panel-copy"><span>STUDENT LOGIN</span><h2>수강생 로그인</h2><p>승인받은 이름, 휴대폰 번호와 수강생 보안코드를 입력하세요.</p></div><form onSubmit={(event) => void submitPublic(event, "/api/member-auth/login")}><label>이름<input name="name" autoComplete="name" placeholder="본인 이름" maxLength={40} required /></label><label>등록된 휴대폰 번호<input name="phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="010-0000-0000" required /></label><label>보안코드<input name="securityCode" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{4,32}" minLength={4} maxLength={32} placeholder="수강생 보안코드" required /></label><button disabled={busy}>{busy ? "확인 중…" : "로그인"}</button></form></section>}
      {entry === "visitor" && <><VisitorSchedule month={month} setMonth={setMonth} availability={availability} />{availabilityError && <p className="portal-load-notice" role="alert">{availabilityError} 기존 일정은 유지됩니다. <button onClick={() => void loadAvailability()}>다시 불러오기</button></p>}</>}
      </CourseLanding>
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
  return <section id="portal-entry-content" className="portal-schedule-section"><SectionHeading eyebrow="AVAILABLE STATIONS" title="월별 남은 스테이션" text="예약이 가능한 날짜와 시간만 표시됩니다."><input type="month" aria-label="조회 월" value={month} onChange={(event) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value); }} /></SectionHeading>{availability?.month !== month && <p role="status">선택한 월의 일정을 불러오는 중입니다.</p>}<CalendarBoard month={month} slots={slots} selected={selected} setSelected={setPicked} renderSlot={(slot) => <article className="portal-slot available" key={`${slot.stationName}-${slot.startAt}`}><div><span>{stationLabels[slot.stationType] ?? slot.stationType}</span><h3>{slot.stationName}</h3><p>{timeRange(slot)}</p></div><b>예약 가능</b></article>} /><div className="portal-guest-action"><div><strong>예약을 원하시나요?</strong><p>{availability?.consultationUrl ? "더컵에듀 카카오톡에서 바로 상담해 주세요." : "상담 후 승인을 받으면 본인 이름과 연락처로 직접 예약할 수 있습니다."}</p></div>{availability?.consultationUrl ? <a href={availability.consultationUrl}>카카오톡 상담</a> : <Link href="/?view=consultation#portal-entry-content">이용 상담 신청</Link>}</div></section>;
}

function MemberSchedule({ data, month, setMonth, reload, notify }: { data: BookingData; month: string; setMonth: (value: string) => void; reload: () => Promise<void>; notify: Notify }) {
  const [courseId, setCourseId] = useState<number | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [picked, setPicked] = useState("");
  const [requestSlot, setRequestSlot] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const submitting = useRef(false);
  const courses = data.enrollments ?? [];
  const course = courseId === 0 && !data.courseBookingRequired ? null : courses.find(row => row.id === courseId) ?? courses.find(row => row.status === "ACTIVE") ?? null;
  const remaining = course ? Math.max(0, course.totalSessions - course.usedSessions) : 0;
  const canRequest = course ? course.status === "ACTIVE" && remaining > 0 : !data.courseBookingRequired;
  const compatibleSlots = (data.month === month ? data.slots : []).filter(slot => course
    ? slot.stationType === course.stationType && (new Date(slot.endAt).getTime() - new Date(slot.startAt).getTime()) / 60000 >= course.sessionMinutes
      && (["REQUESTED", "CONFIRMED"].includes(slot.displayStatus) || !(data.instructorConflicts ?? []).some(conflict => conflict.enrollmentId === course.id && conflict.startAt < slot.endAt && conflict.endAt > slot.startAt))
    : !data.courseBookingRequired && (filter === "ALL" || slot.stationType === filter));
  // Equipment stays behind the scenes: one time choice per course, even with multiple identical stations.
  const slots = course ? [...new Map(compatibleSlots.slice().sort((a, b) => Number(a.displayStatus === "AVAILABLE") - Number(b.displayStatus === "AVAILABLE")).map(slot => [slot.startAt + slot.endAt, slot] as const)).values()].sort((a, b) => a.startAt.localeCompare(b.startAt)) : compatibleSlots;
  const dates = [...new Set(slots.map(slot => slot.startAt.slice(0, 10)))];
  const selected = dates.includes(picked) ? picked : dates[0] ?? `${month}-01`;
  async function reserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestSlot || !canRequest || submitting.current) return;
    submitting.current = true; setSaving(true); setSaveError("");
    const values = new FormData(event.currentTarget);
    try {
      await requestJson("/api/booking/member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action: "requestReservation", slotId: requestSlot.id, enrollmentId: course?.id,
        purpose: course?.courseName ?? values.get("purpose"), materialPlan: course ? "CENTER" : values.get("materialPlan"),
        openToPeerPractice: false, userMemo: values.get("userMemo"),
      }) });
      await reload(); setRequestSlot(null);
      notify({ kind: "ok", text: course ? "수업을 신청했습니다. 담당 강사의 최종 승인 후 일정이 확정됩니다." : "예약을 신청했습니다. 승인 후 확정되며 이용 당일 현장에서 결제합니다." });
    } catch (error) { setSaveError(errorText(error)); }
    finally { submitting.current = false; setSaving(false); }
  }
  return <>
    <SectionHeading eyebrow="MY LEARNING" title="내 수업 예약" text="수강 과정과 원하는 시간을 선택하세요. 담당 강사가 확인한 뒤 일정을 확정합니다.">
      <input type="month" aria-label="조회 월" value={month} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value); }} />
    </SectionHeading>
    <div className="learning-my-courses">
      {courses.map(row => <button key={row.id} className={course?.id === row.id ? "active" : ""} aria-pressed={course?.id === row.id} onClick={() => { setCourseId(row.id); setRequestSlot(null); }}>
        <strong>{row.courseName}</strong><span>{row.status === "PAUSED" ? "수강 일시 중지" : `예약할 수 있는 회차 ${Math.max(0, row.totalSessions - row.usedSessions)} / ${row.totalSessions}회`}</span>
        <small>신청 {row.pendingSessions} · 확정 {row.confirmedSessions} · 소진 {row.completedSessions}회</small><small>담당 {row.instructorName} · 회당 {row.sessionMinutes}분</small>
      </button>)}
      {!data.courseBookingRequired && <button className={!course ? "active" : ""} aria-pressed={!course} onClick={() => { setCourseId(0); setRequestSlot(null); }}><strong>기존 실습 예약</strong><span>기존 수강생 예약 권한 유지</span><small>이용 당일 현장결제</small></button>}
    </div>
    {data.courseBookingRequired && !courses.length ? <Empty><h2>상담과 결제 확인 후 수업을 등록해 드립니다.</h2><p>회원 승인은 완료되었습니다. 담당자가 과정·회차를 등록하면 여기에서 시간을 선택할 수 있습니다.</p><a href="http://pf.kakao.com/_XRQdn/chat" target="_blank" rel="noreferrer">카카오톡 문의 →</a></Empty> : <>
      {course ? <div className="portal-schedule-toolbar"><strong>{course.courseName}</strong><span>{course.status === "PAUSED" ? "중지된 과정입니다. 담당자에게 문의해 주세요." : remaining ? `${remaining}회 더 신청할 수 있습니다. 장비는 과목에 맞게 배정됩니다.` : "등록된 회차를 모두 신청했습니다. 내 예약에서 일정을 확인하세요."}</span></div> : <div className="portal-schedule-toolbar"><div>{["ALL","ESPRESSO","BREWING","ROASTING"].map(type => <button key={type} className={filter === type ? "active" : ""} onClick={() => setFilter(type)}>{type === "ALL" ? "전체" : stationLabels[type]}</button>)}</div><span>기존 예약 · 이용 당일 현장결제</span></div>}
      {data.month !== month && <p role="status">선택한 월의 일정을 불러오는 중입니다.</p>}
      <CalendarBoard month={month} slots={slots} selected={selected} setSelected={setPicked} available={slot => canRequest && slot.displayStatus === "AVAILABLE"} renderSlot={slot => <article className={`portal-slot ${slot.displayStatus.toLowerCase()}`} key={slot.id}><div><span>{course ? "수업 시간" : stationLabels[slot.stationType]}</span><h3>{timeRange(slot)}</h3><p>{course ? course.courseName : slot.stationName}</p></div><b>{slotLabels[slot.displayStatus]}</b>{canRequest && slot.displayStatus === "AVAILABLE" && <button onClick={() => { setSaveError(""); setRequestSlot(slot); }}>이 시간 신청</button>}</article>} />
      {course && <p className="learning-footnote">승인 대기 중인 신청도 회차에 포함합니다. 취소·거절 시 회차가 복구되며, 완료·노쇼는 소진 처리됩니다. 수업 시간·취소 규정은 상담 시 안내를 확인해 주세요.</p>}
    </>}
    {requestSlot && <AccessibleDialog label="수업 예약 신청" busy={saving} onClose={() => setRequestSlot(null)}><form className="portal-modal" onSubmit={reserve}>
      <button type="button" className="close" aria-label="예약창 닫기" disabled={saving} onClick={() => setRequestSlot(null)}>×</button>
      <span>LESSON REQUEST</span><h2>{shortDate(requestSlot.startAt)} · {timeRange(requestSlot)}</h2><p>{course ? `${course.courseName} · 담당 ${course.instructorName}` : requestSlot.stationName}</p>
      {course ? <p>1회 신청 · 강사 승인 후 확정<br />신청 후 남은 회차 {remaining - 1}회</p> : <>
        <label>실습 목적<select name="purpose" defaultValue={requestSlot.stationType}>{Object.entries(purposeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>재료 사용<select name="materialPlan"><option value="SELF">본인 지참</option><option value="CENTER">센터 재료 사용 · 이용 금액 포함</option></select></label>
      </>}
      <label>강사에게 전달할 내용 <small>선택</small><textarea name="userMemo" rows={3} maxLength={500} /></label>
      <p>취소는 수업 {data.settings.cancelHours}시간 전까지 가능합니다. 이후 변경은 담당자에게 문의해 주세요.</p>
      {saveError && <p role="alert" className="portal-form-error">{saveError}</p>}
      <button className="submit" disabled={saving}>{saving ? "신청 중…" : "수업 신청하기"}</button>
    </form></AccessibleDialog>}
  </>;
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
          return <button key={date} className={[selected === date ? "active" : "", count ? "has-availability" : ""].filter(Boolean).join(" ")} aria-pressed={selected === date} aria-label={`${longDate(date)}, 예약 가능 ${count}개`} onClick={() => setSelected(date)}><b>{date.slice(8)}</b><span>{weekday(date)}</span><small>{count ? `${count}개` : "마감"}</small></button>;
        })}
      </div>
      <div className="portal-calendar-layout">
        <div className="portal-calendar">
          <div className="weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="days">
            {days.map((day, index) => day === null ? <span key={`blank-${index}`} /> : (() => {
              const date = `${month}-${String(day).padStart(2, "0")}`;
              const count = countForDate(date);
              return <button key={day} className={[selected === date ? "active" : "", count ? "has-availability" : ""].filter(Boolean).join(" ")} aria-pressed={selected === date} aria-label={`${longDate(date)}, 예약 가능 ${count}개`} onClick={() => setSelected(date)}><b>{day}</b>{count > 0 && <small>{count}개</small>}</button>;
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
  return <><SectionHeading eyebrow="MY RESERVATIONS" title="내 예약" text="본인의 예약 상태와 운영자 안내만 표시됩니다." /><div className="portal-filter">{[["ACTIVE","대기·확정"],["COMPLETED","완료"],["CANCELLED","취소"],["REJECTED","거절"]].map(([value,label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div><div className="portal-reservations">{rows.length ? rows.map((row) => <article key={row.id}><div><span>{reservationLabels[row.status]}</span><h2>{shortDate(row.startAt)} · {timeRange(row)}</h2><p>{row.stationName} · {purposeLabels[row.purpose] ?? row.purpose}</p><small>{row.enrollmentId ? "결제 확인된 교육 과정 · 등록 회차에서 1회 사용" : `${row.materialPlan === "SELF" ? "재료 본인 지참" : "센터 재료 사용 · 이용 금액 포함"} · 이용 당일 현장결제`}</small>{row.adminMemo && <small>운영자 안내 · {row.adminMemo}</small>}{row.rejectionReason && <small>거절 사유 · {row.rejectionReason}</small>}</div><div>{["REQUESTED","CONFIRMED"].includes(row.status) && <button onClick={() => void cancel(row.id)}>예약 취소</button>}{["CONFIRMED","COMPLETED"].includes(row.status) && <button onClick={() => void feedback(row.id)}>피드백 요청</button>}</div></article>) : <Empty>해당 상태의 예약이 없습니다.</Empty>}</div></>;
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
function Toast({ value, close }: { value: { kind: "ok" | "error"; text: string }; close: () => void }) { return <button role={value.kind === "error" ? "alert" : "status"} aria-label={`${value.text} · 알림 닫기`} className={`portal-toast ${value.kind}`} onClick={close}>{value.text}</button>; }
type Notify = (value: { kind: "ok" | "error"; text: string }) => void;
function currentMonth() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date()).slice(0,7); }
function timeRange(value: { startAt: string; endAt: string }) { return `${value.startAt.slice(11,16)}–${value.endAt.slice(11,16)}`; }
function shortDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(new Date(value)); }
function weekday(date: string) { return ["일","월","화","수","목","금","토"][new Date(`${date}T00:00:00Z`).getUTCDay()]; }
function longDate(date: string) { const [year,month,day] = date.split("-").map(Number); return `${year}년 ${month}월 ${day}일 ${weekday(date)}요일`; }
function calendarCells(month: string): Array<number | null> { const [year,value] = month.split("-").map(Number); const first = new Date(Date.UTC(year,value-1,1)).getUTCDay(); const days = new Date(Date.UTC(year,value,0)).getUTCDate(); return [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_,index) => index+1)]; }
function errorText(error: unknown) { return error instanceof Error ? error.message : "요청을 처리하지 못했습니다."; }
