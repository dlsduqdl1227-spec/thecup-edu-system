"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "../../lib/api-client";

type Summary = {
  configured: boolean; syncedAt: string | null; warning: string; automatic: boolean; months: string[];
  blocks: { id: string; startDate: string; endDate: string }[];
  conflicts: { id: number; status: string; memberName: string; startAt: string; endAt: string; stationName: string }[];
};
export function CalendarSyncPanel() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(false);
  const version = useRef(0);
  const load = useCallback(async (force = false) => {
    const current = ++version.current;
    if (force) setBusy(true);
    try {
      const result = await requestJson<Summary>("/api/booking/calendar", { method: force ? "POST" : "GET", cache: "no-store" });
      if (!alive.current || current !== version.current) return;
      setData(result); setError("");
      if (force) window.dispatchEvent(new Event("thecup:booking-updated"));
    } catch (cause) {
      if (alive.current && current === version.current) setError(cause instanceof Error ? cause.message : "연동 상태를 불러오지 못했습니다.");
    } finally { if (alive.current && current === version.current) setBusy(false); }
  }, []);
  useEffect(() => {
    alive.current = true;
    // Initial remote lookup; load only updates state after its network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => void load(),30000);
    const focus = () => void load();
    window.addEventListener("focus",focus);
    return () => { alive.current = false; window.clearInterval(timer); window.removeEventListener("focus",focus); };
  }, [load]);
  return <section className="calendar-sync-panel" aria-label="자동 시간표와 FLOW 연동">
    <header><div><span className="calendar-sync-eyebrow">일정 자동 관리</span><h2>기본 시간표는 자동으로.</h2><p>평일 09:00–18:00 · 점심 11:30–12:30 · 주말·공휴일 휴무</p></div><button type="button" disabled={busy} onClick={() => void load(true)}>{busy ? "확인 중…" : "지금 동기화"}</button></header>
    <div className="calendar-sync-times" aria-label="자동 생성 수업 시간"><span>09:00–11:30</span><span>12:30–15:00</span><span>15:30–18:00</span></div>
    <p className="calendar-sync-caption">{data?.automatic ? `이번 달부터 3개월(${data.months.join(" · ")})의 비어 있는 시간을 자동 생성합니다.` : "자동 시간표 설정을 확인하고 있습니다."} 기존 예약과 수동 휴강은 유지합니다.</p>
    <div className="calendar-sync-status" aria-live="polite"><strong>{data?.warning ? "FLOW 연결 확인 필요" : data?.syncedAt ? "FLOW 연동 중" : data?.configured ? "FLOW 첫 연결 확인 중" : "FLOW 연결 확인 중"}</strong><span>{data?.syncedAt ? `마지막 확인 ${new Date(data.syncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })}` : ""}</span></div>
    <p className="calendar-sync-caption">FLOW의 ‘더컵 미디어센터’ 프로젝트 일정과 장소가 더컵미디어센터인 일정은 체크 없이 날짜 전체가 자동 차단됩니다. 저장 즉시 연동을 요청하며, 새 예약 신청·승인 직전에도 다시 확인합니다.</p>
    {(error || data?.warning) && <p role="alert" className="calendar-sync-warning">{error || data?.warning}</p>}
    {!!data?.conflicts.length && <div className="calendar-sync-conflicts" role="alert"><h3>휴무 일정과 겹친 예약 {data.conflicts.length}건</h3><p>자동 취소하지 않았습니다. 예약 당사자와 일정을 조정해 주세요. 휴무 날짜의 대기 건은 확정할 수 없습니다.</p><ul>{data.conflicts.map(row => <li key={row.id}><strong>{row.memberName}</strong><span>{row.startAt.slice(0,10)} {row.startAt.slice(11,16)} · {row.stationName}</span><b>{row.status === "CONFIRMED" ? "기존 확정 유지" : "승인 전 확인"}</b></li>)}</ul></div>}
    {data && <details><summary>FLOW 예약 차단 일정 {data.blocks.length}건 보기</summary>{data.blocks.length ? <ul className="calendar-sync-blocks">{data.blocks.map(row => <li key={row.id}>{row.startDate}{row.endDate !== row.startDate ? ` – ${row.endDate}` : ""}<span>날짜 전체 차단</span></li>)}</ul> : <p>차단 대상 일정이 없습니다. 센터 프로젝트·장소가 아닌 일반 일정은 수동 차단 설정이 있을 때만 적용합니다.</p>}<a href="https://monthlycoffee-flow.pages.dev/" target="_blank" rel="noopener noreferrer">FLOW에서 일정 관리 ↗</a></details>}
  </section>;
}
