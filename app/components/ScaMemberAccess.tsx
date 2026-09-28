"use client";

import { useEffect, useRef, useState } from "react";
import { requestJson } from "../../lib/api-client";
import { MAX_BULK_MEMBERS } from "../../lib/sca-edu/bulk-access";
import { deckKey, type EduMemberAccess, type EduMemberList, type PublicCatalog } from "../../lib/sca-edu/catalog";
import { ListPagination } from "./ListPagination";

export function ScaMemberAccess({ catalog }: { catalog: PublicCatalog }) {
  const [members, setMembers] = useState<EduMemberAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("APPROVED");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const busy = useRef(false), levelPanel = useRef<HTMLElement>(null);
  const available = catalog.courses.flatMap(course => course.levels.filter(l => l.deck && ["review", "ready"].includes(l.status))
    .map(l => ({ courseId: course.id, level: l.level, name: `${course.ko} ${l.level}`, key: deckKey(course.id, l.level) })));
  useEffect(() => {
    let cancelled = false;
    requestJson<EduMemberList>("/api/edu/members").then(data => {
      if (!cancelled) { setMembers(data.members); setLoadError(""); }
    }).catch(e => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "수강생 목록을 불러오지 못했습니다."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);
  const disabled = loading || saving || Boolean(loadError);
  const matched = members.filter(m => (filter === "ALL" || m.approvalStatus === filter)
    && `${m.name} ${m.phoneLast4}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matched.length / pageSize) - 1));
  const visible = matched.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selectedMembers = members.filter(m => selectedIds.has(m.id));
  const targets = available.filter(l => selectedLevels.has(l.key));
  const selectedOnPage = visible.filter(m => selectedIds.has(m.id)).length;
  const invalidForApproval = selectedMembers.some(m => m.approvalStatus !== "APPROVED");
  const ready = !disabled && selectedMembers.length > 0 && targets.length > 0;

  function clearPeople() { setSelectedIds(new Set()); setExpandedId(null); setPage(0); }
  function refresh() { clearPeople(); setLoading(true); setRevision(n => n + 1); }
  function selectPeople(ids: number[], checked: boolean) {
    const next = new Set(selectedIds);
    for (const id of ids) { if (checked) next.add(id); else next.delete(id); }
    if (next.size > MAX_BULK_MEMBERS) { setActionError(`한 번에 ${MAX_BULK_MEMBERS}명까지 처리할 수 있습니다. 현재 선택을 먼저 적용해 주세요.`); return; }
    setActionError(""); setSelectedIds(next);
  }
  function selectLevels(keys: string[], checked: boolean) {
    setSelectedLevels(current => { const next = new Set(current); for (const key of keys) { if (checked) next.add(key); else next.delete(key); } return next; });
  }
  async function apply(enabled: boolean) {
    if (busy.current || !ready || (enabled && invalidForApproval)) return;
    const names = selectedMembers.slice(0, 8).map(m => `${m.name} (${m.phoneLast4})`).join(", ") + (selectedMembers.length > 8 ? ` 외 ${selectedMembers.length - 8}명` : "");
    const verb = enabled ? "승인" : "해제";
    if (!window.confirm(`교육자료 ${verb}\n수강생 ${selectedMembers.length}명: ${names}\n레벨 ${targets.length}개: ${targets.map(l => l.name).join(", ")}\n\n선택한 모든 수강생에게 선택한 모든 레벨을 ${verb}합니다.\n예약 승인과 선택하지 않은 자료는 바뀌지 않습니다. 계속할까요?`)) return;
    busy.current = true; setSaving(true); setNotice(""); setActionError("");
    try {
      await requestJson("/api/edu/members/bulk", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: [...selectedIds], levels: targets.map(({ courseId, level }) => ({ courseId, level })), enabled }) });
      setMembers(rows => rows.map(m => !selectedIds.has(m.id) ? m : { ...m,
        levels: [...m.levels.filter(l => !selectedLevels.has(deckKey(l.courseId, l.level))), ...(enabled ? targets.map(({ courseId, level }) => ({ courseId, level })) : [])],
      }));
      setNotice(`${selectedMembers.length}명의 교육자료 ${targets.length}개 레벨을 일괄 ${verb}했습니다. 예약 권한과 다른 레벨은 유지했습니다.`);
      setSelectedIds(new Set()); setSelectedLevels(new Set());
    } catch (e) {
      setActionError(`${e instanceof Error ? e.message : "처리 결과를 확인하지 못했습니다."} 최신 목록을 확인한 후 다시 선택해 주세요.`);
      refresh();
    } finally { busy.current = false; setSaving(false); }
  }
  return <section className="sca-member-access" aria-label="수강생별 교육자료 권한">
    <h2>교육자료 일괄 권한 관리</h2>
    <p className="sca-access-hint">수강생과 과목의 레벨을 체크한 뒤 한 번에 승인하거나 해제하세요. 예약 이용 승인은 변경하지 않습니다.</p>
    <div className="sca-access-tools">
      <label>수강생 찾기<input type="search" value={search} disabled={saving} placeholder="이름 또는 연락처 뒤 4자리" onChange={e => { setSearch(e.target.value); clearPeople(); }} /></label>
      <label>회원 상태<select value={filter} disabled={saving} onChange={e => { setFilter(e.target.value); clearPeople(); }}><option value="APPROVED">승인된 수강생</option><option value="ALL">전체 회원</option><option value="PENDING">승인 대기</option><option value="REVOKED">권한 회수</option></select></label>
      <button type="button" disabled={loading || saving} onClick={refresh}>목록 새로고침</button>
    </div>
    {notice && <p role="status" className="sca-access-notice">{notice}</p>}
    {(loadError || actionError) && <p role="alert" className="sca-bulk-error">{loadError || actionError}</p>}
    <div className="sca-bulk-layout">
      <section aria-label="일괄 처리 수강생 선택">
        <h3>1. 수강생 선택 <small>{selectedIds.size}명 선택</small></h3>
        <div className="sca-bulk-selection">
          <Check label="현재 페이지 전체 선택" checked={visible.length > 0 && selectedOnPage === visible.length} mixed={selectedOnPage > 0 && selectedOnPage < visible.length}
            disabled={disabled || !visible.length} onChange={checked => selectPeople(visible.map(m => m.id), checked)} />
          <button type="button" disabled={disabled || !selectedIds.size} onClick={() => setSelectedIds(new Set())}>선택 초기화</button>
        </div>
        <p className="sca-bulk-help">페이지를 옮겨도 선택은 유지됩니다. 검색·상태 변경 시 선택이 초기화됩니다. 한 번에 최대 {MAX_BULK_MEMBERS}명.</p>
        {selectedMembers.length > 0 && <details className="sca-selected-preview"><summary>선택한 수강생 {selectedMembers.length}명 확인</summary><p>{selectedMembers.map(m => `${m.name} (${m.phoneLast4})`).join(", ")}</p></details>}
        {loading ? <p role="status">수강생 목록을 불러오는 중입니다.</p> : !matched.length ? <p className="sca-access-empty">{search ? "검색된 수강생이 없습니다." : "해당 상태의 수강생이 없습니다."}</p> :
          <div className="sca-access-list sca-compact-list">{visible.map(member => <article key={member.id} data-member-id={member.id} className={selectedIds.has(member.id) ? "selected" : ""}>
            <Check compact label={`${member.name} (${member.phoneLast4}) 선택`} checked={selectedIds.has(member.id)} disabled={disabled}
              onChange={checked => selectPeople([member.id], checked)} />
            <div className="sca-access-person"><h4>{member.name}</h4><span>연락처 끝 {member.phoneLast4} · {member.approvalStatus === "APPROVED" ? "승인" : member.approvalStatus === "PENDING" ? "승인 대기" : "권한 회수"}</span></div>
            <button type="button" disabled={saving} aria-expanded={expandedId === member.id} onClick={() => setExpandedId(expandedId === member.id ? null : member.id)}>권한 보기 <b>{member.levels.length}</b></button>
            {expandedId === member.id && <div className="sca-current-levels"><strong>현재 열람 중</strong>{member.levels.length ? <ul>{member.levels.map(l => <li key={deckKey(l.courseId, l.level)}>{catalog.courses.find(c => c.id === l.courseId)?.ko ?? l.courseId} · {l.level}</li>)}</ul> : <p>열람 중인 교육자료가 없습니다.</p>}</div>}
          </article>)}</div>}
        <ListPagination total={matched.length} page={currentPage} pageSize={pageSize} label="교육자료 수강생 목록 페이지" disabled={disabled}
          onPageChange={n => { setPage(n); setExpandedId(null); }} onPageSizeChange={n => { setPageSize(n); setPage(0); }} />
        <button type="button" className="sca-level-jump" disabled={!selectedIds.size} onClick={() => { levelPanel.current?.scrollIntoView({ block: "start" }); levelPanel.current?.focus({ preventScroll: true }); }}>선택한 {selectedIds.size}명에게 적용할 과목 선택 ↓</button>
      </section>
      <section className="sca-bulk-level-panel" aria-label="일괄 처리 과목과 레벨 선택" ref={levelPanel} tabIndex={-1}>
        <h3>2. 과목·레벨 선택 <small>{targets.length}개 선택</small></h3>
        <p className="sca-bulk-help">체크는 이번 작업의 대상입니다. 현재 권한은 ‘권한 보기’에서 확인하세요.</p>
        <Check label="모든 과목·레벨 선택" checked={available.length > 0 && targets.length === available.length} mixed={targets.length > 0 && targets.length < available.length} disabled={disabled}
          onChange={checked => selectLevels(available.map(l => l.key), checked)} />
        <div className="sca-bulk-courses">{catalog.courses.map(course => {
          const choices = available.filter(l => l.courseId === course.id), count = choices.filter(l => selectedLevels.has(l.key)).length;
          if (!choices.length) return null;
          return <fieldset key={course.id}><legend>{course.ko}</legend>
            {choices.length > 1 && <Check label={`${course.ko} 전체 레벨`} checked={count === choices.length} mixed={count > 0 && count < choices.length} disabled={disabled} onChange={checked => selectLevels(choices.map(l => l.key), checked)} />}
            {choices.map(choice => <div key={choice.key} className="sca-bulk-level-choice"><Check label={choice.name} shortLabel={choice.level} checked={selectedLevels.has(choice.key)} disabled={disabled} onChange={checked => selectLevels([choice.key], checked)} />
              {selectedMembers.length > 0 && <small>{selectedMembers.filter(m => m.levels.some(l => deckKey(l.courseId, l.level) === choice.key)).length}/{selectedMembers.length}명 열람 중</small>}
            </div>)}
          </fieldset>;
        })}</div>
        <div className="sca-bulk-apply" aria-busy={saving}>
          <strong>선택한 {selectedIds.size}명 × {targets.length}개 레벨</strong>
          {invalidForApproval && <p>승인 대기·권한 회수 수강생은 먼저 수강생 목록에서 예약 이용 승인이 필요합니다. 교육자료 해제는 가능합니다.</p>}
          <div><button type="button" className="solid" disabled={!ready || invalidForApproval} onClick={() => void apply(true)}>{saving ? "처리 중…" : "선택 레벨 일괄 승인"}</button>
            <button type="button" disabled={!ready} onClick={() => void apply(false)}>선택 레벨 일괄 해제</button></div>
          <small>선택하지 않은 레벨과 다른 수강생의 권한은 유지됩니다.</small>
        </div>
      </section>
    </div>
  </section>;
}

function Check({ label, shortLabel, checked, mixed = false, disabled, onChange, compact = false }: {
  label: string; shortLabel?: string; checked: boolean; mixed?: boolean; disabled: boolean; compact?: boolean; onChange: (checked: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
  return <label className={`bulk-check${compact ? " compact" : ""}`}><input ref={input} type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} /><span>{shortLabel ?? label}</span></label>;
}
