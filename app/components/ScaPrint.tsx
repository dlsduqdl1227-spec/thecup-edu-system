"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { requestJson } from "../../lib/api-client";
import type { Deck, EduViewer } from "../../lib/sca-edu/catalog";
import { layoutDeck } from "../../lib/sca-edu/layouts";
import { loadPresentationImages } from "../../lib/sca-edu/assets";
import { SLIDE_CSS, slideHtml } from "../../lib/sca-edu/render-web";
import { printableSlides, printFileTitle, printRange, printRequest, printSheets, waitForPrintResources } from "../../lib/sca-edu/print";

type Laid = ReturnType<typeof layoutDeck>;
type PrintItem = { number: number; html: string };
type Ready = { kind: "ready"; deck: Deck; laid: Laid; viewer: EduViewer; start: number; language: string };
type State = Ready | { kind: "loading" } | { kind: "error"; message: string };

export function ScaPrint() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [revision, setRevision] = useState(0);
  const [layout, setLayout] = useState<1 | 2>(1);
  const [range, setRange] = useState<"all" | "current" | "custom">("all");
  const [customRange, setCustomRange] = useState("");
  const [answers, setAnswers] = useState(false);
  const [preview, setPreview] = useState(0);
  const [resources, setResources] = useState({ key: "", error: "" });
  const [printNotice, setPrintNotice] = useState("");
  const documentRef = useRef<HTMLDivElement>(null);
  const tr = (ko: string, en: string) => state.kind === "ready" && state.language === "en" ? en : ko;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { course, level, language, start } = printRequest(new URLSearchParams(window.location.search));
        const [viewer, deck] = await Promise.all([
          requestJson<EduViewer>("/api/edu/me", { cache: "no-store" }),
          requestJson<Deck>(`/api/edu/decks/${encodeURIComponent(course)}/${encodeURIComponent(level)}?lang=${language}`, { cache: "no-store" }),
        ]);
        // Uses protected course-level asset routes; a missing image fails closed.
        const laid = await loadPresentationImages(layoutDeck(deck));
        if (!laid.length) throw new Error("출력할 슬라이드가 없습니다. / No slides are available to print.");
        if (!active) return;
        setState({ kind: "ready", deck, laid, viewer, start: Math.min(start, laid.length), language });
        document.title = printFileTitle(deck);
      } catch (error) {
        if (active) setState({ kind: "error", message: error instanceof Error ? error.message : "교육자료를 준비하지 못했습니다." });
      }
    })();
    return () => { active = false; };
  }, [revision]);

  const selection = useMemo(() => {
    if (state.kind !== "ready") return { indices: [] as number[], error: "" };
    try {
      const total = state.laid.length;
      return { indices: range === "all" ? Array.from({ length: total }, (_, index) => index) : printRange(range === "current" ? String(state.start) : customRange, total), error: "" };
    } catch (error) { return { indices: [] as number[], error: error instanceof Error ? error.message : "페이지를 확인해 주세요." }; }
  }, [state, range, customRange]);
  const sheets = useMemo<PrintItem[][]>(() => {
    if (state.kind !== "ready") return [];
    const slides = printableSlides(state.laid, answers);
    return printSheets(selection.indices.map(index => ({ number: index + 1, html: slideHtml(slides[index]).replaceAll('loading="lazy"', 'loading="eager"') })), layout);
  }, [state, selection.indices, layout, answers]);
  const key = state.kind === "ready" ? `${revision}:${layout}:${answers}:${selection.indices.join(",")}` : "";
  const current = Math.min(preview, Math.max(0, sheets.length - 1));
  const ready = !!key && !selection.error && resources.key === key && !resources.error;

  useEffect(() => {
    const element = documentRef.current;
    if (!key || !element || selection.error) return;
    let active = true;
    void waitForPrintResources(element).then(() => { if (active) setResources({ key, error: "" }); }, error => {
      if (active) setResources({ key, error: error instanceof Error ? error.message : "출력 준비에 실패했습니다." });
    });
    return () => { active = false; };
  }, [key, selection.error]);

  function retry() { setState({ kind: "loading" }); setRevision(value => value + 1); setPreview(0); }
  function printMaterial() {
    try {
      if (typeof window.print !== "function") throw new Error("unsupported");
      setPrintNotice(""); window.print();
    } catch {
      setPrintNotice(tr("이 브라우저에서 인쇄 창을 열지 못했습니다. 주소를 복사해 기본 브라우저에서 다시 열어 주세요.", "This browser could not open printing. Copy this address and open it in your default browser."));
    }
  }
  const error = state.kind === "error" ? state.message : resources.key === key ? resources.error : "";
  return <main id="main-content" className="edu-print-route" data-layout={layout} data-ready={ready} lang={state.kind === "ready" ? state.language : "ko"}>
    <style>{SLIDE_CSS}</style><style>{`@page { size: A4 ${layout === 2 ? "portrait" : "landscape"}; margin: 10mm; }`}</style>
    <header className="edu-print-screen-only edu-print-header"><div><span>THE CUP EDU</span><h1>{tr("교육자료 PDF 저장·인쇄", "Save as PDF or print")}</h1><p>{state.kind === "ready" ? `${state.deck.course} · ${state.deck.level} · ${state.laid.length}${tr("장", " slides")}` : tr("교육자료와 열람 권한을 확인하고 있습니다.", "Checking your course access.")}</p></div>
      <div><Link href={state.kind === "ready" && state.viewer.role === "admin" ? "/admin" : "/?view=student"}>{state.kind === "ready" && state.viewer.role === "admin" ? tr("관리자 화면", "Admin home") : tr("수강생 화면", "Student home")}</Link><button type="button" className="edu-print-primary" disabled={!ready} onClick={printMaterial}>{ready ? tr("PDF 저장·인쇄", "Save PDF / Print") : error ? tr("출력 준비 실패", "Not ready") : selection.error ? tr("페이지 확인 필요", "Check page range") : tr("출력 준비 중…", "Preparing…")}</button></div>
    </header>
    {printNotice && <p className="edu-print-screen-only edu-print-error" role="alert">{printNotice}</p>}
    {state.kind === "loading" && <p className="edu-print-screen-only edu-print-status" role="status">{tr("필수 이미지와 글꼴을 준비하고 있습니다. 잠시만 기다려 주세요.", "Loading required images and fonts. Please wait.")}</p>}
    {error && <section className="edu-print-screen-only edu-print-error" role="alert"><h2>{tr("출력할 자료를 준비하지 못했습니다.", "Could not prepare these materials.")}</h2><p>{error}</p><p>{tr("승인받은 과목·레벨만 출력할 수 있습니다. 로그인과 열람 권한을 확인해 주세요.", "Only your approved courses and levels can be printed. Please check your login and course access.")}</p><button type="button" onClick={retry}>{tr("다시 불러오기", "Reload")}</button><Link href="/?view=student">{tr("수강생 로그인", "Student login")}</Link><Link href="/admin">{tr("직원 로그인", "Staff login")}</Link></section>}
    {state.kind === "ready" && <>
      <section className="edu-print-screen-only edu-print-options" aria-label={tr("출력 설정", "Print settings")}>
        <label>{tr("출력 범위", "Pages")}<select aria-label={tr("출력 범위", "Pages")} value={range} onChange={event => { setRange(event.target.value as typeof range); setPreview(0); }}><option value="all">{tr("전체 슬라이드", "All slides")}</option><option value="current">{tr(`보고 있던 슬라이드 (${state.start}번)`, `Current slide (${state.start})`)}</option><option value="custom">{tr("페이지 직접 선택", "Custom range")}</option></select></label>
        {range === "custom" && <label>{tr("선택할 페이지", "Page range")}<input value={customRange} onChange={event => { setCustomRange(event.target.value); setPreview(0); }} placeholder="1-5, 8" aria-invalid={!!selection.error} aria-describedby={selection.error ? "edu-print-range-error" : undefined} /></label>}
        <label>{tr("한 장에 담을 슬라이드", "Slides per sheet")}<select aria-label={tr("한 장에 담을 슬라이드", "Slides per sheet")} value={layout} onChange={event => { setLayout(Number(event.target.value) as 1 | 2); setPreview(0); }}><option value="1">{tr("1장씩 · A4 가로", "1 slide · A4 landscape")}</option><option value="2">{tr("2장씩 · A4 세로", "2 slides · A4 portrait")}</option></select></label>
        <label className="edu-print-check"><input type="checkbox" checked={answers} onChange={event => setAnswers(event.target.checked)} />{tr("정답 함께 출력", "Include answers")}</label>
        <p>{tr("인쇄 창의 대상에서 ‘PDF로 저장’ 또는 사용할 프린터를 선택하세요. 발표자 노트와 내부 메모는 출력하지 않습니다.", "Choose ‘Save as PDF’ or your printer in the print dialog. Presenter notes and internal memos are excluded.")}</p>
        {selection.error && <p role="alert" id="edu-print-range-error">{selection.error}</p>}
      </section>
      <nav className="edu-print-screen-only edu-print-pagination" aria-label={tr("출력 미리보기 페이지", "Print preview pages")}><button type="button" disabled={current === 0} onClick={() => setPreview(current - 1)}>{tr("이전", "Previous")}</button><span aria-live="polite">{sheets.length ? current + 1 : 0} / {sheets.length} {tr("장", "sheets")} · {tr(`슬라이드 ${selection.indices.length}개 선택`, `${selection.indices.length} slides selected`)}</span><button type="button" disabled={current + 1 >= sheets.length} onClick={() => setPreview(current + 1)}>{tr("다음", "Next")}</button></nav>
      <div ref={documentRef} className="edu-print-document">{sheets.map((sheet, index) => <section className="edu-print-sheet" data-preview={index === current} key={index} aria-label={`${tr("출력", "Sheet")} ${index + 1}`}>
        {sheet.map(item => <article className="edu-print-slide-block" key={item.number}><div dangerouslySetInnerHTML={{ __html: item.html }} /><p className="edu-print-page-label">{state.deck.course} · {state.deck.level}<span>{item.number} / {state.laid.length}</span></p></article>)}
      </section>)}</div>
    </>}
    <p className="edu-print-not-ready">{tr("자료 준비를 마친 뒤 ‘PDF 저장·인쇄’ 버튼을 눌러 주세요.", "Please wait for the materials to finish loading, then choose Save PDF / Print.")}</p>
  </main>;
}
