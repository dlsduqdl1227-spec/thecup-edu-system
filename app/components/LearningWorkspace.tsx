"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { requestJson } from "../../lib/api-client";
import { courseOptions, getLearningCourse, interestOptions } from "../../lib/learning-catalog";
import { AccessibleDialog } from "./AccessibleDialog";

type Enrollment = { id: number; courseName: string; totalSessions: number; usedSessions: number; pendingSessions: number; completedSessions: number; confirmedSessions: number; instructorName: string; sessionMinutes: number; status: string };
type Consultation = { id: number; name: string; phone: string; ageRange: string; discovery: string; interests: string; contactChannel: string; message: string; status: string; instructorId: number | null; staffNote: string; createdAt: string };
type LessonRequest = { id: number; memberName: string; courseName: string; startAt: string; endAt: string; status: string; instructorName: string; userMemo: string };
type LearningData = {
  isAdmin: boolean; members: Array<{ id: number; name: string; phoneLast4: string; approvalStatus: string; needsConsultation: number }>;
  total: number; page: number; instructors: Array<{ id: number; name: string }>; requests: LessonRequest[]; requestTotal: number;
  detail: null | { member: { id: number; name: string; approvalStatus: string }; consultations: Consultation[]; enrollments: Enrollment[]; courseBookingRequired: boolean };
};
type Act = (body: Record<string, unknown>, message: string) => Promise<boolean>;
const consultationLabels: Record<string, string> = { NEW: "새 상담", CONTACTED: "상담 진행·완료", ENROLLED: "수강 등록", CLOSED: "상담 종료" };
export function LearningWorkspace() {
  const [tab, setTab] = useState<"members" | "requests">("members");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [data, setData] = useState<LearningData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [decision, setDecision] = useState<{ row: LessonRequest; value: string } | null>(null);
  const saving = useRef(false);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    // Each search/selection gets an independent response boundary; contacts never leak between selections.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    requestJson<LearningData>(`/api/learning/admin?page=${page}&q=${encodeURIComponent(query)}${memberId ? `&memberId=${memberId}` : ""}`, { cache: "no-store" })
      .then(value => { if (active) { setData(value); setError(""); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, query, memberId, revision]);
  useEffect(() => {
    if (tab !== "requests" || decision) return;
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [tab, decision, refresh]);
  const act: Act = async (body, message) => {
    if (saving.current) return false;
    saving.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await requestJson("/api/learning/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setNotice(message); refresh(); window.dispatchEvent(new Event("thecup:booking-updated")); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했습니다."); return false; }
    finally { setBusy(false); saving.current = false; }
  };
  const selected = !loading && data?.detail?.member.id === memberId ? data.detail : null;
  const total = tab === "members" ? data?.total ?? 0 : data?.requestTotal ?? 0;
  return <section className="learning-workspace">
    <header><span className="learning-eyebrow">CONSULT → LEARN → BOOK</span><h1>상담부터 수업 확정까지.</h1><p>{data?.isAdmin === false ? "내게 배정된 수강생과 수업만 확인할 수 있습니다." : "신청 내용을 확인하고, 결제한 과정과 회차를 등록하세요. 수강생의 시간 신청은 담당 강사가 최종 확정합니다."}</p></header>
    <nav className="learning-toolbar" aria-label="교육 운영 메뉴"><button className={tab === "members" ? "active" : ""} onClick={() => { setTab("members"); setPage(1); }}>상담·수강 등록</button><button className={tab === "requests" ? "active" : ""} onClick={() => { setTab("requests"); setMemberId(null); setPage(1); }}>수업 승인·완료</button><button onClick={refresh} disabled={busy || loading}>새로고침</button></nav>
    {notice && <p role="status">{notice}</p>}{error && <p className="learning-error" role="alert">{error} <button onClick={refresh}>다시 확인</button></p>}
    {tab === "members" ? <>
      <form className="learning-toolbar" onSubmit={event => { event.preventDefault(); setQuery(search); setPage(1); setMemberId(null); }}><input aria-label="수강생 검색" placeholder="이름 또는 연락처 끝 4자리" value={search} onChange={event => setSearch(event.target.value)} maxLength={80} /><button>검색</button><span>총 {data?.total ?? 0}명</span></form>
      <div className="learning-admin-grid"><div><div className="learning-member-list" aria-label="상담·수강생 목록">{data?.members.map(row => <button key={row.id} className={memberId === row.id ? "active" : ""} onClick={() => { setMemberId(row.id); setNotice(""); }}><strong>{row.name}</strong><small>연락처 끝 {row.phoneLast4} · {row.needsConsultation ? "새 상담" : row.approvalStatus === "APPROVED" ? "승인 회원" : "승인 필요"}</small></button>)}</div>{!loading && !data?.members.length && <p>검색된 수강생이 없습니다.</p>}</div>
      <div className="learning-member-detail">{loading ? <p role="status">정보를 불러오고 있습니다.</p> : selected ? <>
        <h3>{selected.member.name}님의 상담·수강 정보</h3><p>{selected.courseBookingRequired ? "새 수강생 · 결제한 과정의 남은 회차로 예약합니다." : "기존 수강생 · 기존 예약 권한을 유지합니다. 등록한 과정은 회차별로 관리됩니다."}</p>
        {selected.consultations.length ? selected.consultations.map(consultation => <ConsultationCard key={`${selected.member.id}-${consultation.id}`} row={consultation} data={data!} busy={busy} act={act} />) : <p>온라인 상담 접수 내역이 없습니다. 기존에 저장하지 않은 전체 연락처는 복원하지 않습니다.</p>}
        {data?.isAdmin && <EnrollmentForm key={selected.member.id} memberId={selected.member.id} instructors={data.instructors} busy={busy} act={act} />}
        <h3>등록된 과정 {selected.enrollments.length}개</h3>{selected.enrollments.map(row => <article className="learning-enrollment" key={row.id}><h3>{row.courseName}</h3><p>총 {row.totalSessions}회 · 남은 신청 {Math.max(0, row.totalSessions - row.usedSessions)}회 · {row.status === "PAUSED" ? "일시 중지" : "수강 중"}</p><div className="learning-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, row.usedSessions / row.totalSessions * 100)}%` }} /></div><p>신청 {row.pendingSessions} · 확정 {row.confirmedSessions} · 소진 {row.completedSessions}회</p><p>담당 {row.instructorName} · 회당 {row.sessionMinutes}분</p>{data?.isAdmin && <button disabled={busy} onClick={() => { if (window.confirm(row.status === "ACTIVE" ? "새 신청과 대기 건의 확정을 중지합니다. 이미 확정된 예약은 유지됩니다. 중지할까요?" : "다시 수업을 신청할 수 있게 할까요?")) void act({ action: "enrollmentStatus", id: row.id, status: row.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }, "수강 상태를 변경했습니다."); }}>{row.status === "ACTIVE" ? "신규 예약 일시 중지" : "수강 재개"}</button>}</article>)}
      </> : <p>목록에서 수강생을 선택하면 상담 내용, 연락처와 수강 회차를 확인할 수 있습니다.</p>}</div></div>
    </> : <div>{loading && <p role="status">예약을 확인하고 있습니다.</p>}{data?.requests.map(row => <article className="learning-request" key={row.id}><span>{row.status === "REQUESTED" ? "승인 대기" : "확정된 수업"}</span><h3>{row.startAt.slice(0,10)} · {row.startAt.slice(11,16)}–{row.endAt.slice(11,16)}</h3><strong>{row.memberName} · {row.courseName}</strong><p>담당 {row.instructorName}{row.userMemo ? ` · ${row.userMemo}` : ""}</p><div className="learning-toolbar">{(row.status === "REQUESTED" ? [["CONFIRMED", "수업 확정"], ["REJECTED", "신청 거절"]] : [["COMPLETED", "수업 완료"], ["CANCELLED", "예약 취소"], ["NO_SHOW", "노쇼 처리"]]).map(([value,label]) => <button key={value} disabled={busy || loading} onClick={() => setDecision({ row, value })}>{label}</button>)}</div></article>)}{!loading && !data?.requests.length && <p>신청 또는 확정된 수업이 없습니다.</p>}</div>}
    <div className="learning-pagination"><button disabled={page <= 1 || loading} onClick={() => { setPage(value => value - 1); setMemberId(null); }}>이전</button><span>{page} / {Math.max(1, Math.ceil(total / 25))}</span><button disabled={page * 25 >= total || loading} onClick={() => { setPage(value => value + 1); setMemberId(null); }}>다음</button></div>
    {decision && <AccessibleDialog label="수업 처리 확인" onClose={() => setDecision(null)} busy={busy}><form className="portal-modal" onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); if (await act({ action: "decideReservation", reservationId: decision.row.id, decision: decision.value, adminMemo: form.get("note"), rejectionReason: form.get("note") }, "수업 상태를 변경했습니다.")) setDecision(null); }}><h2>수업 상태를 변경할까요?</h2><p>{decision.row.memberName} · {decision.row.courseName}<br />{decision.row.startAt.slice(0,16).replace("T", " ")}</p><p>{decision.value === "NO_SHOW" ? "노쇼는 1회를 소진합니다." : ["CANCELLED", "REJECTED"].includes(decision.value) ? "취소·거절하면 신청 가능 회차가 복구됩니다." : decision.value === "CONFIRMED" ? "담당 강사와 장비의 중복 시간을 확인한 뒤 확정합니다." : "수업 완료로 기록합니다."}</p><label>수강생에게 안내할 내용<textarea name="note" required={decision.value === "REJECTED"} maxLength={200} /></label>{error && <p role="alert" className="learning-error">{error}</p>}<button className="submit" disabled={busy}>{busy ? "처리 중…" : "확인하여 처리"}</button><button type="button" disabled={busy} onClick={() => setDecision(null)}>돌아가기</button></form></AccessibleDialog>}
  </section>;
}
function ConsultationCard({ row, data, busy, act }: { row: Consultation; data: LearningData; busy: boolean; act: Act }) {
  let interests: string[] = [];
  try { interests = JSON.parse(row.interests) as string[]; } catch { /* Historical display only. */ }
  return <article className="learning-contact"><strong>{consultationLabels[row.status]} · {row.createdAt.slice(0,10)}</strong><p>{row.ageRange} · 유입 {row.discovery} · 선호 상담 {row.contactChannel}</p><a href={`tel:${row.phone}`}>{row.phone} · 전화</a>　<a href={`sms:${row.phone}`}>문자 작성</a><p>{interests.map(id => interestOptions.find(option => option.id === id)?.name ?? id).join(" / ")}</p>{row.message && <p>{row.message}</p>}{(data.isAdmin || data.instructors.some(instructor => instructor.id === row.instructorId)) ? <form onSubmit={async event => { event.preventDefault(); const values = new FormData(event.currentTarget); await act({ action: "consultation", id: row.id, status: values.get("status"), note: values.get("note"), instructorId: values.get("instructorId") }, "상담 기록을 저장했습니다."); }}><div className="learning-form-grid"><label>상담 상태<select name="status" defaultValue={row.status}>{Object.entries(consultationLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>{data.isAdmin && <label>담당 강사<select name="instructorId" defaultValue={row.instructorId ?? ""}><option value="">관리자만 확인</option>{data.instructors.map(instructor => <option key={instructor.id} value={instructor.id}>{instructor.name}</option>)}</select></label>}</div><label>내부 상담 메모<textarea name="note" rows={2} maxLength={1000} defaultValue={row.staffNote} /></label><button disabled={busy}>상담 기록 저장</button></form> : <p>상담 기록 수정은 지정된 상담 담당자에게 문의해 주세요.</p>}</article>;
}
function EnrollmentForm({ memberId, instructors, busy, act }: { memberId: number; instructors: LearningData["instructors"]; busy: boolean; act: Act }) {
  const [open, setOpen] = useState(false);
  const [courseKey, setCourseKey] = useState(courseOptions[0].id);
  const [sessions, setSessions] = useState("3");
  const [priceType, setPriceType] = useState("REGULAR");
  const [amount, setAmount] = useState("360000");
  const requestKey = useRef("");
  function changeCourse(key: string) {
    if (key === "q-grader:course") { setCourseKey(key); setSessions(""); setPriceType("CUSTOM"); setAmount(""); }
    else suggest(key, String(getLearningCourse(key).sessions), priceType === "CUSTOM" ? "REGULAR" : priceType);
  }
  function suggest(key: string, count: string, type: string) {
    setCourseKey(key); setSessions(count); setPriceType(type);
    if (["SUBSCRIBER", "REGULAR"].includes(type)) setAmount(String(Number(count) * (type === "SUBSCRIBER" ? 80000 : 120000)));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    const values = new FormData(event.currentTarget);
    const ok = await act({ action: "enroll", memberId, requestKey: requestKey.current, courseKey, totalSessions: Number(sessions), paidAmount: Number(amount), priceType, instructorId: values.get("instructorId"), sessionMinutes: values.get("sessionMinutes"), paymentConfirmed: values.get("paymentConfirmed") === "on", qOpeningConfirmed: values.get("qOpeningConfirmed") === "on" }, "수강 등록과 회원 승인을 완료했습니다. 수강생이 로그인하여 시간을 신청할 수 있습니다.");
    if (ok) { requestKey.current = ""; setOpen(false); }
  }
  return <div><button type="button" disabled={busy} onClick={() => setOpen(value => !value)}>{open ? "등록 양식 닫기" : "+ 결제 확인 · 수강 과정 등록"}</button>{open && <form className="learning-enroll-form" onSubmit={submit}><h3>과정과 회차 등록</h3><p>등록하면 회원도 승인됩니다. 교육자료 열람 권한은 별도로 유지되며 자동 공개하지 않습니다.</p><label>수강 과정<select aria-label="수강 과정" value={courseKey} onChange={event => changeCourse(event.target.value)}>{courseOptions.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><div className="learning-form-grid"><label>총 수강 회차<input type="number" min={1} max={100} required value={sessions} onChange={event => suggest(courseKey, event.target.value, priceType)} /></label><label>회당 수업 시간(분)<input name="sessionMinutes" type="number" min={30} max={480} defaultValue={150} required /></label></div><label>담당 강사<select aria-label="담당 강사" name="instructorId" defaultValue="" required><option value="" disabled>강사를 선택해 주세요</option>{instructors.map(instructor => <option key={instructor.id} value={instructor.id}>{instructor.name}</option>)}</select></label><div className="learning-form-grid"><label>요금 구분<select aria-label="요금 구분" value={priceType} onChange={event => suggest(courseKey, sessions, event.target.value)}><option value="REGULAR">비구독자</option><option value="SUBSCRIBER">구독자</option><option value="PACKAGE">디플로마·통합 패키지</option><option value="CUSTOM">개별 협의</option></select></label><label>이 과정 결제 확인 금액(원)<input type="number" min={0} max={100000000} required value={amount} onChange={event => setAmount(event.target.value)} /></label></div><p className="learning-footnote">일반 모듈 금액은 회차 × 기본 단가로 제안합니다. Q Grader·패키지는 상담한 실제 금액으로 수정하세요. 패키지는 과목별로 나눠 등록하며 시험비는 제외합니다. 이 금액은 수강 관리용이며 매출 장부에 중복 자동 등록하지 않습니다.</p>{courseKey === "q-grader:course" && <label className="learning-check"><input name="qOpeningConfirmed" type="checkbox" required />Q Grader 수강 희망자 6인 모집 및 개강 일정을 확인했습니다.</label>}<label className="learning-check"><input name="paymentConfirmed" type="checkbox" required />결제와 선수 자격을 확인했습니다. 이 과정의 회차를 부여합니다.</label><button disabled={busy} className="learning-primary">{busy ? "등록 중…" : "수강 등록 · 회원 승인"}</button></form>}</div>;
}
