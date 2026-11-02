"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { requestJson } from "../../lib/api-client";
import { ageRanges, contactChannels, discoveryChannels, interestOptions } from "../../lib/learning-catalog";
import { AccessibleDialog } from "./AccessibleDialog";

const labels: Record<string, string> = { NEW: "새 상담", CONTACTED: "상담 진행·완료", ENROLLED: "수강 등록", CLOSED: "상담 종료" };
type Row = { id: number; memberId: number; name: string; phoneLast4: string; interests: string; status: string; contactChannel: string; createdAt: string; updatedAt: string; deletedAt: string | null; revision: number; instructorName: string | null; approvalStatus: string };
type Detail = Row & { phone: string; ageRange: string; discovery: string; message: string; staffNote: string; instructorId: number | null; canEdit: boolean };
type DetailData = { detail: Detail; isAdmin: boolean; instructors: Array<{ id: number; name: string }> };
type List = { rows: Row[]; total: number; page: number; isAdmin: boolean };
const endpoint = "/api/learning/consultation-management";
function courseIds(value: string): string[] { try { const ids = JSON.parse(value); return Array.isArray(ids) ? ids.filter(id => typeof id === "string") : []; } catch { return []; } }
function courseNames(value: string) { return courseIds(value).map(id => interestOptions.find(item => item.id === id)?.name ?? id).join(" / "); }
function receivedAt(value: string) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z")); }

export function ConsultationInbox({ onMember }: { onMember: (id: number, approved: boolean) => void }) {
  const [data, setData] = useState<List | null>(null);
  const [status, setStatus] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    // A poll only updates the list; the open edit form and unsaved inputs stay intact.
    requestJson<List>(`${endpoint}?q=${encodeURIComponent(query)}&status=${status}&deleted=${deleted ? 1 : 0}&sort=${sort}&page=${page}`, { cache: "no-store", signal: controller.signal })
      .then(value => { setData(value); setPage(value.page); setError(""); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "상담 목록을 불러오지 못했습니다."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, status, deleted, sort, page, revision]);
  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    window.addEventListener("thecup:consultations-updated", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("thecup:consultations-updated", update); };
  }, [refresh]);
  function filter(change: () => void) { change(); setPage(1); setLoading(true); }
  return <div className="consultation-inbox">
    <div className="consultation-heading"><div><h2>상담 접수함</h2><p>새 신청부터 상담 종료까지. 수강생 승인 여부와 상담 상태는 별도로 표시합니다.</p></div><button type="button" onClick={() => { setLoading(true); refresh(); }} disabled={loading}>새로고침</button></div>
    <form className="consultation-filters" onSubmit={event => { event.preventDefault(); filter(() => setQuery(search)); refresh(); }}>
      <label>상담 검색<input value={search} onChange={event => setSearch(event.target.value)} placeholder="성함 또는 연락처 끝 4자리" maxLength={80} /></label><button type="submit">검색</button>
      <label>상담 상태<select aria-label="상담 상태" value={status} onChange={event => filter(() => setStatus(event.target.value))}><option value="">전체 상태</option>{Object.entries(labels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>상담 정렬<select aria-label="상담 정렬" value={sort} onChange={event => filter(() => setSort(event.target.value))}><option value="newest">최근 접수순</option><option value="oldest">오래된 접수순</option><option value="name">이름순</option><option value="updated">최근 수정순</option></select></label>
      {data?.isAdmin && <label>보관함<select aria-label="보관함" value={deleted ? "deleted" : "active"} onChange={event => filter(() => setDeleted(event.target.value === "deleted"))}><option value="active">현재 상담</option><option value="deleted">삭제한 상담</option></select></label>}
    </form>
    <div className="consultation-list-summary"><strong>{deleted ? "삭제한 상담" : "접수 내역"} {data?.total ?? 0}건</strong><span>{loading ? "확인 중…" : "30초마다 자동 갱신 · 연락처는 상세에서 확인"}</span></div>
    {notice && <p role="status">{notice}</p>}{error && <p className="learning-error" role="alert">{error} 기존 목록은 유지됩니다.</p>}
    <div className="consultation-table-wrap" aria-busy={loading}><table className="consultation-table"><caption className="sr-only">상담 접수 DB 목록</caption><thead><tr><th scope="col">접수일</th><th scope="col">신청자</th><th scope="col">관심 과정</th><th scope="col">상태·담당</th><th scope="col">관리</th></tr></thead><tbody>
      {data?.rows.map(row => <tr key={row.id}><td data-label="접수일">{receivedAt(row.createdAt)}</td><td data-label="신청자"><strong>{row.name}</strong><small>끝 {row.phoneLast4} · {row.approvalStatus === "APPROVED" ? "승인 수강생" : "수강 전·미승인"}</small></td><td data-label="관심 과정">{courseNames(row.interests)}</td><td data-label="상태·담당"><span className={row.status === "NEW" ? "consultation-badge is-new" : "consultation-badge"}>{labels[row.status]}</span><small>{row.instructorName || "담당 미지정"}</small></td><td><button type="button" aria-label={`${row.name} 상담 상세`} onClick={() => setDetailId(row.id)}>상세·수정</button></td></tr>)}
    </tbody></table>{!loading && !data?.rows.length && <p className="consultation-empty">{deleted ? "삭제한 상담이 없습니다." : "조건에 맞는 상담이 없습니다."}</p>}</div>
    <div className="learning-pagination"><button disabled={page <= 1 || loading} onClick={() => { setPage(value => value - 1); setLoading(true); }}>이전</button><span>{data?.page ?? page} / {Math.max(1, Math.ceil((data?.total ?? 0) / 25))}</span><button disabled={page * 25 >= (data?.total ?? 0) || loading} onClick={() => { setPage(value => value + 1); setLoading(true); }}>다음</button></div>
    {detailId !== null && <ConsultationEditor id={detailId} onClose={() => setDetailId(null)} onSaved={message => { setDetailId(null); setNotice(message); refresh(); window.dispatchEvent(new Event("thecup:consultations-updated")); }} onMember={onMember} />}
  </div>;
}

function ConsultationEditor({ id, onClose, onSaved, onMember }: { id: number; onClose: () => void; onSaved: (message: string) => void; onMember: (id: number, approved: boolean) => void }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const saving = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    requestJson<DetailData>(`${endpoint}?id=${id}`, { cache: "no-store", signal: controller.signal })
      .then(value => { setData(value); setError(""); setDirty(false); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "상담을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [id, revision]);
  const close = () => { if (!dirty || window.confirm("저장하지 않은 내용을 닫을까요?")) onClose(); };
  async function change(method: "PATCH" | "DELETE", body: Record<string, unknown>, message: string) {
    if (!data || saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try { await requestJson(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, id, revision: data.detail.revision }) }); onSaved(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했습니다."); }
    finally { saving.current = false; setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void change("PATCH", { ...Object.fromEntries(values.entries()), interests: values.getAll("interests") }, "상담 내용을 저장했습니다.");
  }
  const row = data?.detail;
  return <AccessibleDialog label="상담 상세·수정" onClose={close} busy={busy}><div className="learning-workspace consultation-editor">
    <header><h2>상담 상세·수정</h2><button type="button" onClick={close} disabled={busy} aria-label="상담 닫기">닫기</button></header>
    {error && <div className="learning-error" role="alert">{error}<button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm("입력 중인 내용을 버리고 최신 내용을 불러올까요?")) { setData(null); setRevision(value => value + 1); } }}>최신 내용 다시 불러오기</button></div>}
    {!row ? <p role="status">상담을 불러오고 있습니다.</p> : <>
      <p>접수 {receivedAt(row.createdAt)} · {row.approvalStatus === "APPROVED" ? "승인 수강생" : "수강 전·미승인"}</p>
      <div className="learning-toolbar"><a href={`tel:${row.phone}`}>전화하기</a><a href={`sms:${row.phone}`}>문자 작성</a>{!row.deletedAt && <button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm("입력 중인 내용을 저장하지 않고 수강 정보로 이동할까요?")) onMember(row.memberId, row.approvalStatus === "APPROVED"); }}>회원·수강 등록 보기</button>}</div>
      {row.deletedAt ? <><p>삭제된 상담입니다. 회원 계정·수강 과정·예약 기록은 유지됩니다.</p><button type="button" disabled={busy} onClick={() => void change("PATCH", { action: "restore" }, "상담을 복구했습니다.")}>상담 복구</button></> :
      <form key={row.revision} onSubmit={submit} onChange={() => setDirty(true)}>
        <fieldset disabled={busy || !row.canEdit}>
          <div className="learning-form-grid"><label>상담 신청자 성함<input name="name" defaultValue={row.name} maxLength={40} required /></label><label>상담 연락처<input name="phone" type="tel" defaultValue={row.phone} maxLength={20} required /></label></div>
          <p className="learning-footnote">이름·번호 수정은 이 상담에만 적용됩니다. 로그인용 회원 정보는 바뀌지 않습니다.</p>
          <div className="learning-form-grid"><label>연령대<select aria-label="연령대" name="ageRange" defaultValue={row.ageRange}>{ageRanges.map(item => <option key={item}>{item}</option>)}</select></label><label>알게 된 경로<select aria-label="알게 된 경로" name="discovery" defaultValue={row.discovery}>{discoveryChannels.map(item => <option key={item}>{item}</option>)}</select></label><label>선호 연락 방법<select aria-label="선호 연락 방법" name="contactChannel" defaultValue={row.contactChannel}>{contactChannels.map(item => <option key={item}>{item}</option>)}</select></label><label>상담 상태<select aria-label="상담 상태" name="status" defaultValue={row.status}>{Object.entries(labels).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></label></div>
          {data.isAdmin && <label>담당 강사<select aria-label="담당 강사" name="instructorId" defaultValue={row.instructorId ?? ""}><option value="">미지정</option>{data.instructors.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}{row.instructorId && !data.instructors.some(item => item.id === row.instructorId) && <option value={row.instructorId}>비활성 담당자 · 재배정 필요</option>}</select></label>}
          <fieldset className="consultation-interests"><legend>관심 과정 · 여러 개 선택 가능</legend><div>{interestOptions.map(item => <label key={item.id}><input type="checkbox" name="interests" value={item.id} defaultChecked={courseIds(row.interests).includes(item.id)} />{item.name}</label>)}</div></fieldset>
          <label>신청 내용<textarea aria-label="신청 내용" name="message" rows={3} maxLength={1000} defaultValue={row.message} /></label>
          <label>내부 상담 메모<textarea aria-label="내부 상담 메모" name="staffNote" rows={3} maxLength={1000} defaultValue={row.staffNote} /></label>
        </fieldset>
        {!row.canEdit && <p>수정은 관리자 또는 이 상담에 지정된 담당자만 할 수 있습니다.</p>}
        <footer><button type="button" disabled={busy} onClick={close}>닫기</button>{data.isAdmin && <button type="button" className="consultation-delete" disabled={busy} onClick={() => { if (window.confirm("이 상담을 삭제한 상담함으로 이동할까요? 회원·수강·예약은 유지되며 복구할 수 있습니다.")) void change("DELETE", {}, "상담을 삭제한 상담함으로 이동했습니다."); }}>상담 삭제</button>}{row.canEdit && <button className="learning-primary" disabled={busy}>{busy ? "저장 중…" : "변경 내용 저장"}</button>}</footer>
      </form>}
    </>}
  </div></AccessibleDialog>;
}
