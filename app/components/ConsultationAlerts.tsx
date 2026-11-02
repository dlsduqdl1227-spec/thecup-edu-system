"use client";
import { useEffect, useRef, useState } from "react";
import { requestJson } from "../../lib/api-client";

export function ConsultationAlerts({ onOpen }: { onOpen: () => void }) {
  const [counts, setCounts] = useState<{ newConsultations: number; latestId: number } | null>(null);
  const [error, setError] = useState(false);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true, pending = false;
    const controller = new AbortController();
    const load = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const result = await requestJson<{ newConsultations: number; latestId: number }>("/api/learning/notifications", { cache: "no-store", signal: controller.signal });
        if (active) { setCounts(result); setError(false); }
      } catch { if (active) setError(true); }
      finally { pending = false; }
    };
    refresh.current = () => { void load(); };
    void load();
    const timer = window.setInterval(() => { void load(); }, 30000);
    window.addEventListener("focus", refresh.current);
    document.addEventListener("visibilitychange", refresh.current);
    window.addEventListener("thecup:consultations-updated", refresh.current);
    return () => {
      active = false; controller.abort(); window.clearInterval(timer);
      window.removeEventListener("focus", refresh.current);
      document.removeEventListener("visibilitychange", refresh.current);
      window.removeEventListener("thecup:consultations-updated", refresh.current);
    };
  }, []);
  if (!counts?.newConsultations && !error) return null;
  return <aside className="consultation-alert" aria-label="상담 접수 알림">
    <div role="status" aria-live="polite"><strong>{counts?.newConsultations ? `확인할 새 상담 ${counts.newConsultations}건` : "상담 알림 연결 확인"}</strong><span>{error ? "알림 갱신이 지연되고 있습니다. 마지막 확인 결과를 표시합니다." : "다른 메뉴에서도 30초마다 새 접수를 확인합니다."}</span></div>
    <button type="button" onClick={onOpen}>상담 확인하기 <span aria-hidden="true">→</span></button>
    {error && <button type="button" onClick={() => refresh.current()}>다시 확인</button>}
  </aside>;
}
