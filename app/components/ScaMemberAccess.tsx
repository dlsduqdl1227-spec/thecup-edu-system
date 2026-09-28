"use client";

import { useEffect, useRef, useState } from "react";
import { requestJson } from "../../lib/api-client";
import type { EduMemberAccess, EduMemberList, PublicCatalog } from "../../lib/sca-edu/catalog";

export function ScaMemberAccess({ catalog }: { catalog: PublicCatalog }) {
  const [members, setMembers] = useState<EduMemberAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("APPROVED");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState("");
  const busy = useRef(false);
  useEffect(() => {
    let cancelled = false;
    requestJson<EduMemberList>("/api/edu/members").then(data => {
      if (!cancelled) { setMembers(data.members); setError(""); }
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "수강생 목록을 불러오지 못했습니다."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);
  async function toggle(member: EduMemberAccess, course: PublicCatalog["courses"][number], level: string) {
    if (busy.current) return;
    const enabled = !member.levels.some(item => item.courseId === course.id && item.level === level);
    if (!window.confirm(`${member.name}님 (연락처 끝 ${member.phoneLast4})의 ${course.ko} ${level} 자료를 ${enabled ? "열어 줄까요?" : "닫을까요?"}\n이 레벨만 변경되며, 예약 권한과 다른 자료는 유지됩니다.`)) return;
    busy.current = true;
    setSaving(`${member.id}/${course.id}/${level}`); setNotice("");
    try {
      await requestJson(`/api/edu/members/${member.id}/courses/${encodeURIComponent(course.id)}/levels/${encodeURIComponent(level)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }),
      });
      setMembers(list => list.map(item => item.id !== member.id ? item : { ...item,
        levels: [...item.levels.filter(row => row.courseId !== course.id || row.level !== level), ...(enabled ? [{ courseId: course.id, level }] : [])],
      }));
      setNotice(`${member.name}님에게 ${course.ko} ${level} 자료를 ${enabled ? "열었습니다" : "닫았습니다"}. 예약 권한은 변경하지 않았습니다.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "열람 권한을 저장하지 못했습니다. 다시 시도해 주세요.");
      setLoading(true);
      setRevision(value => value + 1);
    } finally { busy.current = false; setSaving(""); }
  }
  const matched = members.filter(member => (filter === "ALL" || member.approvalStatus === filter)
    && `${member.name} ${member.phoneLast4}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matched.length / 20) - 1));
  return <section className="sca-member-access" aria-label="수강생별 교육자료 권한">
    <h2>수강생별 교육자료</h2>
    <p>수강생을 확인한 뒤 과목을 펼치고, 열어 줄 레벨을 선택하세요.</p>
    <p className="sca-access-hint">선택한 수강생에게 해당 레벨만 즉시 공개됩니다. 예약 승인과 교육자료 권한은 별개입니다.</p>
    <div className="sca-access-tools">
      <label>수강생 찾기<input type="search" value={search} placeholder="이름 또는 연락처 뒤 4자리" onChange={e => { setSearch(e.target.value); setPage(0); }} /></label>
      <label>회원 상태<select value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}><option value="APPROVED">승인된 수강생</option><option value="ALL">전체 회원</option><option value="PENDING">승인 대기</option><option value="REVOKED">권한 회수</option></select></label>
      <button type="button" disabled={loading || Boolean(saving)} onClick={() => { setLoading(true); setRevision(value => value + 1); }}>목록 새로고침</button>
    </div>
    <div role="status" className="sca-access-notice">{notice}</div>
    {error && <p role="alert">{error} 목록 새로고침으로 다시 시도해 주세요.</p>}
    {loading ? <p role="status">수강생 목록을 불러오는 중입니다.</p> : <>
      <p>{matched.length}명 · 검은색 버튼은 열람 중인 레벨입니다.</p>
      {!matched.length && <p className="sca-access-empty">{search ? "검색된 수강생이 없습니다." : "해당 상태의 수강생이 없습니다. 상담·회원에서 수강생을 승인해 주세요."}</p>}
      <div className="sca-access-list">{matched.slice(currentPage * 20, currentPage * 20 + 20).map(member => <article key={member.id} data-member-id={member.id}>
        <div className="sca-access-person"><h3>{member.name}</h3><span>연락처 끝 {member.phoneLast4}</span><small>{member.approvalStatus === "APPROVED" ? `열람 ${member.levels.length}개 레벨` : member.approvalStatus === "PENDING" ? "승인 후 설정 가능" : "회원 권한 회수됨"}</small></div>
        <div className="sca-access-courses">{catalog.courses.map(course => {
          const count = member.levels.filter(row => row.courseId === course.id).length;
          return <details key={course.id} className="sca-access-levels">
            <summary>{course.ko}<span>{count ? `${count}개 열람 중` : "레벨 선택"}</span></summary>
            {course.levels.map(entry => {
              const enabled = member.levels.some(row => row.courseId === course.id && row.level === entry.level);
              const available = entry.deck && ["review", "ready"].includes(entry.status);
              return <button key={entry.level} type="button" aria-pressed={enabled}
                aria-label={`${member.name} (${member.phoneLast4}) ${course.ko} ${entry.level} ${enabled ? "닫기" : "열기"}`}
                disabled={loading || Boolean(error) || Boolean(saving) || member.approvalStatus !== "APPROVED" || !available}
                onClick={() => void toggle(member, course, entry.level)}>
                <b>{entry.level}</b><span>{saving === `${member.id}/${course.id}/${entry.level}` ? "저장 중…" : !available ? "준비 중" : enabled ? "✓ 열람 중 · 닫기" : "+ 열기"}</span>
              </button>;
            })}
          </details>;
        })}</div>
      </article>)}</div>
      {matched.length > 20 && <nav className="sca-access-pagination" aria-label="수강생 목록 페이지"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</button><span>{currentPage + 1} / {Math.ceil(matched.length / 20)}</span><button disabled={(currentPage + 1) * 20 >= matched.length} onClick={() => setPage(currentPage + 1)}>다음</button></nav>}
    </>}
  </section>;
}
