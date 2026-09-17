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
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);

  return (
    <div className="sca-education">
      {state.kind === "loading" && <p className="sca-education-status" aria-live="polite">교육자료를 불러오는 중입니다.</p>}
      {state.kind === "error" && <p className="sca-education-status" role="alert">{state.message}</p>}
      <div ref={hostRef} />
    </div>
  );
}
