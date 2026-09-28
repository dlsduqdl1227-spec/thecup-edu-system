"use client";

import { useEffect, useRef, useState } from "react";
import { requestJson } from "../../lib/api-client";
import type { Deck, EduViewer, PublicCatalog } from "../../lib/sca-edu/catalog";
import type { PptxLib } from "../../lib/sca-edu/viewer";

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready" };

const PPTX_BUNDLE_URL = "/vendor/pptxgen.bundle.js";

declare global {
  interface Window {
    PptxGenJS?: unknown;
    JSZip?: unknown;
  }
}

function loadPptxBundle(): Promise<PptxLib> {
  if (window.PptxGenJS && window.JSZip) {
    return Promise.resolve({ PptxGenJS: window.PptxGenJS, JSZip: window.JSZip });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PPTX_BUNDLE_URL;
    script.async = true;
    script.onload = () => resolve({ PptxGenJS: window.PptxGenJS, JSZip: window.JSZip });
    script.onerror = () => reject(new Error("PPTX 라이브러리를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

/**
 * SCA 교육자료 탭. 관리자(운영 관리)와 승인 수강생(내 수강 화면) 모두 이 컴포넌트를 사용한다.
 * 볼 수 있는 과정·덱·노트는 서버(/api/edu/*)가 역할에 맞게 걸러서 보낸다.
 */
export function ScaEducation() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [adminCatalog, setAdminCatalog] = useState<PublicCatalog | null>(null);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [notice, setNotice] = useState("");

  async function changeVisibility(course: PublicCatalog["courses"][number], entry: PublicCatalog["courses"][number]["levels"][number]) {
    if (savingRef.current) return;
    const published = entry.status !== "ready";
    if (!window.confirm(`${course.name} ${entry.level}을 ${published ? "승인된 수강생에게 공개할까요?" : "공개 중지할까요?"}`)) return;
    savingRef.current = true;
    setSaving(true);
    setNotice("");
    try {
      await requestJson(`/api/edu/decks/${encodeURIComponent(course.id)}/${encodeURIComponent(entry.level)}/visibility`, {
        method: "PUT", body: JSON.stringify({ published }), headers: { "Content-Type": "application/json" },
      });
      setNotice(published ? "수강생에게 공개했습니다." : "공개를 중지했습니다.");
      setRevision(value => value + 1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "공개 설정을 저장하지 못했습니다.");
      savingRef.current = false;
      setSaving(false);
    }
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let destroy: (() => void) | null = null;

    // Load the protected catalog once, then hand the DOM node to the framework-free slide viewer.
    void (async () => {
      try {
        const [viewer, catalog, viewerModule] = await Promise.all([
          requestJson<EduViewer>("/api/edu/me"),
          requestJson<PublicCatalog>("/api/edu/catalog"),
          import("../../lib/sca-edu/viewer"),
        ]);
        if (cancelled) return;
        setAdminCatalog(viewer.role === "admin" ? catalog : null);
        const handle = viewerModule.mountScaEducation(host, {
          user: viewer,
          catalog,
          loadDeck: (courseId, level) =>
            requestJson<Deck>(`/api/edu/decks/${encodeURIComponent(courseId)}/${encodeURIComponent(level)}`),
          loadPptxLib: viewer.role === "admin" ? loadPptxBundle : undefined,
        });
        destroy = handle.destroy;
        setState({ kind: "ready" });
      } catch (error) {
        if (!cancelled) setState({ kind: "error", message: error instanceof Error ? error.message : "교육자료를 불러오지 못했습니다." });
      } finally {
        if (!cancelled) { savingRef.current = false; setSaving(false); }
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [revision]);

  return (
    <div className="sca-education">
      {adminCatalog && <section className="sca-visibility" aria-label="교육자료 공개 관리">
        <h2>교육자료 공개 관리</h2>
        <p>내용을 검토한 뒤 레벨별로 공개해 주세요. 승인된 수강생에게 바로 적용됩니다.</p>
        {notice && <p role="status">{notice}</p>}
        <div className="sca-visibility-grid">{adminCatalog.courses.map(course => <section key={course.id}>
          <h3>{course.name} · {course.ko}</h3>
          {course.levels.map(entry => <div className="sca-visibility-row" key={entry.level}>
            <span><b>{entry.level}</b><small>{!entry.deck ? "준비 중" : entry.status === "ready" ? "수강생 공개 중" : "검토 중"}</small></span>
            <button type="button" disabled={!entry.deck || saving || state.kind === "error"}
              aria-label={`${course.name} ${entry.level} ${entry.status === "ready" ? "공개 중지" : "수강생에게 공개"}`}
              onClick={() => void changeVisibility(course, entry)}>{entry.status === "ready" ? "공개 중지" : "수강생에게 공개"}</button>
          </div>)}
        </section>)}</div>
      </section>}
      {state.kind === "loading" && <p className="sca-education-status" aria-live="polite">교육자료를 불러오는 중입니다.</p>}
      {state.kind === "error" && <div className="sca-education-status" role="alert">{state.message}<button type="button" onClick={() => { setState({ kind: "loading" }); setRevision(value => value + 1); }}>다시 불러오기</button></div>}
      <div ref={hostRef} />
    </div>
  );
}
