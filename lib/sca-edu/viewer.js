// SCA 교육 탭 UI (관리자 + 승인 수강생). 프레임워크와 무관하게 DOM 요소 하나에 마운트한다.
//
// mountScaEducation(root, {
//   user: { name, role },          // role: 'admin' | 'student' — 서버가 확인한 값
//   catalog,                       // 서버 API가 권한에 맞게 걸러 준 과정 목록
//   loadDeck: (courseId, level) => Promise<deck>,        // 인증된 API 호출
//   loadPptxLib: () => Promise<{ PptxGenJS, JSZip }>,     // (선택) 관리자만, 버튼 누를 때 지연 로딩
// })
// 원본 PDF 다운로드는 없다. 수강생에게는 PPTX 버튼·발표자 노트가 보이지 않는다.
import { layoutDeck } from './layouts.js';
import { slideHtml, SLIDE_CSS } from './render-web.js';
import { exportPptx, pptxFileName } from './export-pptx.js';
import { loadPresentationImages } from './assets.js';
import { EDU_COPYRIGHT, W, H } from './theme.js';
import { editableSlideFields, updateSlideField } from './slide-editor.js';

const STATUS = { ko: { ready: '열람 가능', review: '', draft: '초안', planned: '준비 중' }, en: { ready: 'Available', review: '', draft: 'Draft', planned: 'Coming soon' } };
const LANGUAGE_KEY = 'thecup-education-language';
function preferredLanguage() { try { return localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'ko'; } catch { return 'ko'; } }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const UI_CSS = `
.sca{--ink:#1d1d1d;--body:#555;--muted:#8e8e8e;--line:#e6e6e6;--tint:#f5f5f5;--dark:#262626;
  font-family:"Pretendard Variable","Pretendard",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  color:var(--ink);display:grid;grid-template-columns:260px minmax(0,1fr);gap:0;min-height:640px;background:#fff;letter-spacing:-.01em}
.sca *{box-sizing:border-box}
.sca button{font:inherit;color:inherit;cursor:pointer}
.sca-side{border-right:1px solid var(--line);padding:28px 16px 28px 20px}
.sca-side h2{font-size:13px;font-weight:700;color:var(--muted);margin:0 0 18px 8px;letter-spacing:0}
.sca-course{margin-bottom:18px}
.sca-course__name{font-size:15px;font-weight:700;margin:0 0 6px 8px}
.sca-course__ko{font-size:12px;color:var(--muted);font-weight:500;margin-left:6px}
.sca-lv{display:flex;align-items:center;justify-content:space-between;width:100%;border:0;background:none;text-align:left;padding:8px 10px;border-radius:8px;font-size:14px;color:var(--body)}
.sca-lv:hover:not(:disabled){background:var(--tint)}
.sca-lv[aria-current="true"]{background:var(--dark);color:#fff}
.sca-lv:disabled{cursor:default;color:#b5b5b5}
.sca-chip{font-size:11px;font-weight:600;padding:2px 7px;border-radius:99px;background:var(--tint);color:var(--muted)}
.sca-lv[aria-current="true"] .sca-chip{background:#3d3d3d;color:#d0d0d0}
.sca-main{padding:28px 32px 48px;min-width:0}
.sca-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px}
.sca-head h1{font-size:28px;font-weight:700;margin:0;line-height:1.2}
.sca-head p{margin:6px 0 0;color:var(--muted);font-size:14px}
.sca-actions{display:flex;flex-wrap:wrap;gap:8px}
.sca-language{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.sca-language .sca-btn{min-height:44px;min-width:74px}
.sca .sca-language [aria-pressed="true"]{background:var(--dark);border-color:var(--dark);color:#fff}
.sca button:focus-visible,.sca select:focus-visible{outline:3px solid #555;outline-offset:3px}
.sca-translation{font-size:12px;color:#666;margin:0 0 12px;line-height:1.5}
.sca-language-error{color:#922;background:#fff1f1;border-radius:8px;padding:12px;margin-bottom:12px}
.sca-btn{border:1px solid var(--line);background:#fff;border-radius:10px;padding:9px 14px;font-size:14px;font-weight:600;display:inline-flex;align-items:center;gap:6px}
.sca-btn:hover:not(:disabled){border-color:#bdbdbd}
.sca .sca-btn--dark{background:var(--dark);border-color:var(--dark);color:#fff}
.sca .sca-btn--dark:hover:not(:disabled){background:#000;border-color:#000}
.sca-btn:disabled{opacity:.5;cursor:wait}
.sca-note{background:var(--tint);border-radius:10px;padding:10px 14px;font-size:13px;color:var(--body);margin-bottom:16px}
.sca-stage{border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px var(--line)}
.sca-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:14px 0 18px;flex-wrap:wrap}
.sca-nav{display:flex;align-items:center;gap:8px}
.sca-count{font-size:14px;color:var(--muted);min-width:64px;text-align:center;font-variant-numeric:tabular-nums}
.sca-icon{width:38px;height:38px;border-radius:50%;border:1px solid var(--line);background:#fff;display:grid;place-items:center;font-size:16px}
.sca-toggles{display:flex;gap:8px;flex-wrap:wrap}
.sca .sca-toggle[aria-pressed="true"]{background:var(--dark);border-color:var(--dark);color:#fff}
.sca-notes{background:var(--tint);border-radius:12px;padding:16px 18px;font-size:15px;line-height:1.6;color:var(--body);white-space:pre-wrap;margin-bottom:18px}
.sca-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.sca-thumb{border:0;background:none;padding:0;text-align:left}
.sca-thumb .sca-slide{border-radius:6px;box-shadow:0 0 0 1px var(--line);transition:box-shadow .15s}
.sca-thumb[aria-current="true"] .sca-slide{box-shadow:0 0 0 2px var(--ink)}
.sca-thumb span{display:block;font-size:12px;color:var(--muted);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sca-empty{padding:60px 0;text-align:center;color:var(--muted);font-size:15px}
.sca.sca-show{position:fixed;inset:auto;top:0;left:0;width:100%;height:100vh;height:100dvh;min-height:0;min-width:0;max-height:none;max-width:none;box-sizing:border-box;background:#000;z-index:9999;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;overflow:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}
.sca-show__frame{display:flex;align-items:center;justify-content:center;min-height:0;min-width:0;overflow:hidden}
.sca-show__stage{width:0;max-width:100%;flex:none;-webkit-text-size-adjust:100%;text-size-adjust:100%}
.sca-show__controls{display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;padding:4px 8px;background:#171717;color:#fff}
.sca-show__controls button{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border:1px solid #666;border-radius:8px;padding:8px 12px;background:#262626;color:#fff;font-size:15px;line-height:1.2}
.sca-show__controls button:hover{background:#444}
.sca-show__controls button:focus-visible{outline:3px solid #fff;outline-offset:1px}
.sca-show__count{min-width:72px;text-align:center;font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}
@media(orientation:landscape) and (max-height:600px){
  .sca.sca-show{grid-template-columns:minmax(0,1fr) 80px;grid-template-rows:minmax(0,1fr)}
  .sca-show__controls{flex-direction:column;padding:4px}
  .sca-show__count{min-width:0;font-size:13px}
}
.sca-select{display:none}
.sca-stage,.sca-show__stage{position:relative}
.sca-protect{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.sca-wm{position:absolute;inset:0;pointer-events:none;z-index:2;background-repeat:repeat}
.sca-role{display:block;font-size:12px;font-weight:600;color:var(--muted);margin:-10px 0 20px 8px}
.sca-edit{width:min(1200px,96vw);max-height:92vh;border:1px solid var(--line);border-radius:16px;padding:22px;background:#fff;color:var(--ink);overflow:auto}
.sca-edit::backdrop{background:rgb(0 0 0 / .5)}
.sca-edit h2{margin:0;font-size:22px}
.sca-edit p{font-size:14px;color:var(--body)}
.sca-edit-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start}
.sca-edit-preview{position:sticky;top:0;min-width:0}
.sca-edit-fields{display:grid;gap:12px;min-width:0}
.sca-edit-field{display:grid;gap:5px}
.sca-edit-fields label{font-size:13px;font-weight:600}
.sca-edit-fields textarea,.sca-edit-fields input{width:100%;min-width:0;margin:0;padding:9px;border:1px solid var(--line);border-radius:8px;font:inherit;line-height:1.5;color:var(--ink);background:#fff}
.sca-edit-fields textarea{min-height:64px;resize:vertical}
.sca-edit-actions{display:flex;flex-wrap:wrap;gap:8px;position:sticky;bottom:-22px;background:#fff;padding:14px 0;margin-top:16px;border-top:1px solid var(--line)}
.sca-edit-status{white-space:pre-wrap;min-height:22px;font-size:14px;margin-top:12px}
@media(max-width:700px){.sca-edit-grid{grid-template-columns:1fr}.sca-edit-preview{position:static}.sca-edit{padding:16px}.sca-edit-actions{bottom:-16px}}
@media print{.sca,.sca-show{display:none!important}}
@media (max-width:860px){
  .sca{grid-template-columns:1fr}
  .sca-side{display:none}
  .sca-select{display:block;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font:inherit;font-size:15px;margin-bottom:16px;background:#fff}
  .sca-main{padding:20px 16px 40px}
  .sca-head h1{font-size:22px}
  .sca-thumbs{grid-template-columns:repeat(auto-fill,minmax(110px,1fr))}
}
`;

// 프레젠테이션 저작권 문구를 옅게 반복하는 워터마크(SVG 배경).
function watermarkCss(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="210"><text x="30" y="125" transform="rotate(-18 190 105)" font-family="Pretendard,sans-serif" font-size="15" font-weight="600" fill="rgb(128,128,128)" fill-opacity="0.18">${esc(label)}</text></svg>`;
  return `background-image:url(&quot;data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}&quot;)`;
}

function injectCss() {
  if (document.getElementById('sca-edu-css')) return;
  const st = document.createElement('style');
  st.id = 'sca-edu-css';
  st.textContent = SLIDE_CSS + UI_CSS;
  document.head.appendChild(st);
}

export function mountScaEducation(root, opts) {
  injectCss();
  const { catalog } = opts;
  const user = opts.user ?? { name: '', role: 'student' };
  const isAdmin = user.role === 'admin';
  const wm = () => `<div class="sca-wm" aria-hidden="true" style="${watermarkCss(EDU_COPYRIGHT)}"></div>`;
  const state = { courseId: null, level: null, deck: null, laid: [], index: 0, notes: false, reveal: false, busy: false, language: preferredLanguage(), loadingLanguage: false, languageError: '' };
  const tr = (ko, en) => state.language === 'en' ? en : ko;
  const status = value => STATUS[state.language][value];
  let disposed = false;
  let loadVersion = 0;
  let editor = null;
  let statusMessage = '';
  const events = new AbortController();
  const available = catalog.courses.flatMap((c) => c.levels.filter((l) => l.deck).map((l) => ({ c, l })));

  root.innerHTML = `<div class="sca"><aside class="sca-side"></aside><section class="sca-main"></section></div>`;
  const side = root.querySelector('.sca-side');
  const main = root.querySelector('.sca-main');

  function renderSide() {
    root.querySelector('.sca').lang = state.language;
    side.innerHTML = `<h2>${tr('SCA 교육 과정', 'SCA Courses')}</h2><span class="sca-role">${isAdmin ? tr('관리자 · 초안 포함 전체 보기', 'Admin · All materials') : esc(user.name)}</span>` +
      catalog.courses.map((c) => `
      <div class="sca-course"><p class="sca-course__name">${esc(c.name)}${state.language === 'ko' ? `<span class="sca-course__ko">${esc(c.ko)}</span>` : ''}</p>
      ${c.levels.map((l) => `<button class="sca-lv" data-c="${esc(c.id)}" data-l="${esc(l.level)}" ${l.deck ? '' : 'disabled'}
        aria-current="${state.courseId === c.id && state.level === l.level}">${esc(l.level)}${status(l.status) ? `<span class="sca-chip">${esc(status(l.status))}</span>` : ''}</button>`).join('')}
      </div>`).join('');
  }

  const selectOptions = () => available.map(({ c, l }) =>
    `<option value="${esc(c.id)}|${esc(l.level)}" ${state.courseId === c.id && state.level === l.level ? 'selected' : ''}>${esc(c.name)} · ${esc(l.level)}</option>`).join('');

  const cur = () => state.laid[state.index];
  const hasReveal = () => !!cur()?.shapes.some((s) => s.reveal);

  function renderMain() {
    const d = state.deck;
    if (!d) {
      main.innerHTML = available.length ? `<div class="sca-empty">${tr('과정을 선택하세요.', 'Select a course.')}</div>` : `<div class="sca-empty">${tr('열람 가능한 교육자료가 없습니다.<br>운영자에게 과목별 열람 권한을 요청해 주세요.', 'No course materials are available.<br>Please ask your administrator for course access.')}</div>`;
      return;
    }
    const lv = catalog.courses.find((c) => c.id === state.courseId)?.levels.find((l) => l.level === state.level) ?? {};
    const sl = cur();
    const editInfo = d.editing?.[d.slides[state.index]?.slideId];
    main.innerHTML = `
      <select class="sca-select" aria-label="${tr('과정 선택', 'Select course')}">${selectOptions()}</select>
      <div class="sca-head">
        <div><h1>${esc(d.course)} ${esc(d.level)}</h1>
          <p>${tr(`슬라이드 ${state.laid.length}장`, `${state.laid.length} slides`)}${isAdmin ? `${status(lv.status) ? ` · ${esc(status(lv.status))}` : ''} · v${esc(d.version)} · ${esc(d.updated)}` : ''}</p></div>
        <div class="sca-actions">
          <div class="sca-language" role="group" aria-label="${tr('교육자료 언어', 'Material language')}" aria-busy="${state.loadingLanguage}">
            <button class="sca-btn" data-act="ko" lang="ko" aria-pressed="${state.language === 'ko'}" ${state.loadingLanguage ? 'disabled' : ''}>한국어</button>
            <button class="sca-btn" data-act="en" lang="en" aria-pressed="${state.language === 'en'}" ${state.loadingLanguage ? 'disabled' : ''}>English</button>
          </div>
          ${isAdmin && opts.saveSlide ? `<button class="sca-btn" data-act="edit" ${state.loadingLanguage ? 'disabled' : ''}>${tr('현재 페이지 편집', 'Edit Korean original')}</button>` : ''}
          ${isAdmin && opts.loadPptxLib ? `<button class="sca-btn" data-act="pptx" ${state.busy ? 'disabled' : ''}>${state.busy ? tr('만드는 중…', 'Creating…') : tr('PPTX 다운로드', 'Download PPTX')}</button>` : ''}
          <button class="sca-btn sca-btn--dark" data-act="show">${tr('프레젠테이션 활성화', 'Start presentation')}</button>
        </div>
      </div>
      ${state.loadingLanguage ? `<p class="sca-translation" role="status">${tr('언어를 변경하고 있습니다…', 'Switching language…')}</p>` : ''}
      ${statusMessage ? `<p role="status">${esc(statusMessage)}</p>` : ''}
      ${isAdmin && editInfo?.needsReview ? '<div class="sca-note" role="alert">원본 자료가 업데이트되어 이 페이지의 이전 수정 내용을 확인해야 합니다. 현재 페이지 편집에서 확인 후 저장해 주세요.</div>' : ''}
      ${state.languageError ? `<p class="sca-language-error" role="alert">${esc(state.languageError)}</p>` : ''}
      ${state.language === 'en' ? '<p class="sca-translation">Machine-assisted English translation of THE CUP EDU materials. Refer to the Korean original if wording is unclear.</p>' : ''}
      ${isAdmin && d.status !== 'ready' && d.sourceNote ? `<div class="sca-note">${esc(d.sourceNote)}</div>` : ''}
      <div class="sca-stage sca-protect ${state.reveal ? 'sca-reveal' : ''}">${slideHtml(sl)}${wm()}</div>
      <div class="sca-bar">
        <div class="sca-nav">
          <button class="sca-icon" data-act="prev" aria-label="${tr('이전 슬라이드', 'Previous slide')}" ${state.index === 0 ? 'disabled' : ''}>←</button>
          <span class="sca-count">${state.index + 1} / ${state.laid.length}</span>
          <button class="sca-icon" data-act="next" aria-label="${tr('다음 슬라이드', 'Next slide')}" ${state.index === state.laid.length - 1 && (!hasReveal() || state.reveal) ? 'disabled' : ''}>→</button>
        </div>
        <div class="sca-toggles">
          ${sl.shapes.some(s => s.t === 'image') ? `<button class="sca-btn" data-act="image">${tr('이미지 크게 보기', 'Enlarge image')}</button>` : ''}
          ${hasReveal() ? `<button class="sca-btn sca-toggle" data-act="reveal" aria-pressed="${state.reveal}">${tr('정답 보기', 'Show answer')}</button>` : ''}
          ${isAdmin ? `<button class="sca-btn sca-toggle" data-act="notes" aria-pressed="${state.notes}">${tr('발표자 노트', 'Presenter notes')}</button>` : ''}
        </div>
      </div>
      ${isAdmin && state.notes ? `<div class="sca-notes">${esc(sl.notes || tr('이 슬라이드에는 발표자 노트가 없습니다.', 'No presenter notes for this slide.'))}</div>` : ''}
      <div class="sca-thumbs sca-protect">${state.laid.map((s, i) => `
        <button class="sca-thumb" data-go="${i}" aria-current="${i === state.index}" aria-label="${tr(`${i + 1}번 슬라이드`, `Slide ${i + 1}`)}">
          ${slideHtml(s)}<span>${i + 1}. ${esc(s.title)}</span></button>`).join('')}
      </div>`;
  }

  async function open(courseId, level) {
    if (disposed) return;
    const lv = catalog.courses.find((c) => c.id === courseId)?.levels.find((l) => l.level === level);
    if (!lv?.deck) return;
    const version = ++loadVersion;
    statusMessage = '';
    Object.assign(state, { courseId, level, index: 0, reveal: false, deck: null, loadingLanguage: false, languageError: '' });
    renderSide();
    main.innerHTML = `<div class="sca-empty" role="status">${tr('불러오는 중…', 'Loading…')}</div>`;
    try {
      const deck = await opts.loadDeck(courseId, level, state.language);
      if (disposed || version !== loadVersion) return;
      state.deck = deck;
      state.laid = layoutDeck(deck);
      renderMain();
    } catch (e) {
      if (disposed || version !== loadVersion) return;
      main.innerHTML = `<select class="sca-select" aria-label="${tr('과정 선택', 'Select course')}">${selectOptions()}</select><div class="sca-empty" role="alert">${tr('교육자료를 불러오지 못했습니다.', 'Could not load course materials.')}<br>${esc(e.message)}<br><button class="sca-btn" data-act="retry">${tr('다시 불러오기', 'Try again')}</button>${state.language === 'en' ? '<button class="sca-btn" data-act="fallback" lang="ko">한국어로 보기</button>' : ''}</div>`;
    }
  }

  async function switchLanguage(language) {
    if (disposed || state.loadingLanguage || language === state.language || !state.deck) return;
    const version = ++loadVersion;
    state.loadingLanguage = true; state.languageError = ''; renderMain();
    try {
      const deck = await opts.loadDeck(state.courseId, state.level, language);
      if (disposed || version !== loadVersion) return;
      const laid = layoutDeck(deck);
      Object.assign(state, { deck, laid, language, index: Math.min(state.index, laid.length - 1) });
      try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* Privacy mode can disable storage. */ }
      renderSide();
    } catch {
      if (disposed || version !== loadVersion) return;
      state.languageError = tr('언어를 변경하지 못했습니다. 현재 자료는 유지됩니다. 잠시 후 언어 버튼을 다시 눌러 주세요.', 'Could not switch languages. Your current slide is unchanged. Please try the language button again.');
    } finally {
      if (!disposed && version === loadVersion) {
        state.loadingLanguage = false; renderMain(); renderShow();
        main.querySelector(`[data-act="${language}"]`)?.focus({ preventScroll: true });
      }
    }
  }

  function go(i) {
    statusMessage = '';
    const n = Math.max(0, Math.min(state.laid.length - 1, i));
    if (n === state.index) return;
    state.index = n; state.reveal = false;
    renderMain(); renderShow();
    if (!show) main.querySelector('.sca-thumb[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  // 정답이 있는 슬라이드는 '다음'을 한 번 누르면 정답부터 공개(키노트 빌드처럼)
  const next = () => { if (hasReveal() && !state.reveal) { state.reveal = true; renderMain(); renderShow(); } else go(state.index + 1); };
  const prev = () => go(state.index - 1);
  function editPage() {
      if (!isAdmin || !opts.saveSlide || !state.deck || editor) return;
      const index = state.index, courseId = state.courseId, level = state.level;
      const original = state.deck.slides[index];
      const info = state.deck.editing?.[original.slideId];
      if (!info) return;
      const draft = structuredClone(original);
      const fields = editableSlideFields(draft);
      const dialog = document.createElement("dialog");
      dialog.className = "sca-edit";
      dialog.setAttribute("aria-labelledby", "sca-edit-title");
      dialog.innerHTML = `<h2 id="sca-edit-title">${index + 1}번 페이지 편집</h2>
        <p>제목·본문·표·차트·정답·발표자 노트를 수정할 수 있습니다. 저장 즉시 이 화면과 PPTX에 반영됩니다. 수강생은 자료를 다시 열면 수정 내용을 볼 수 있습니다. 새로 작성한 한국어 문장은 영문 번역 보완이 필요할 수 있습니다.</p>
        ${info.previousSlide ? `<details><summary>원본 업데이트 전의 수정 내용 확인</summary><p>아래 이전 내용을 확인하고 현재 입력란에 필요한 수정만 반영해 주세요.</p>
          ${editableSlideFields(info.previousSlide).map((field) => `<p><strong>${esc(field.label)}</strong><br>${esc(field.value)}</p>`).join("")}</details>` : ""}
        <div class="sca-edit-grid"><div class="sca-edit-preview sca-reveal"></div><div class="sca-edit-fields">
        ${fields.map((field, i) => `<div class="sca-edit-field"><label for="sca-edit-field-${i}">${esc(field.label)}</label>${field.type === "number" ? `<input id="sca-edit-field-${i}" type="number" step="any" data-field="${i}" value="${esc(field.value)}">` : `<textarea id="sca-edit-field-${i}" data-field="${i}" maxlength="${field.path[0] === "notes" ? 12e3 : 4e3}" rows="${field.path[0] === "notes" ? 5 : 2}">${esc(field.value)}</textarea>`}</div>`).join("")}
        </div></div><div class="sca-edit-status" role="status" aria-live="polite"></div>
        <div class="sca-edit-actions"><button class="sca-btn sca-btn--dark" data-edit="save">변경 내용 저장</button>
        <button class="sca-btn" data-edit="cancel">취소</button>
        <button class="sca-btn" data-edit="reload">최신 페이지 불러오기</button>
        <button class="sca-btn" data-edit="reset" ${info.revision ? "" : "disabled"}>기본 자료로 복원</button></div>`;
      root.querySelector(".sca").appendChild(dialog);
      let dirty = false, saving = false;
      const preview = dialog.querySelector(".sca-edit-preview");
      const feedback = dialog.querySelector(".sca-edit-status");
      const draw = () => {
        try {
          const slides = [...state.deck.slides];
          slides[index] = draft;
          preview.innerHTML = slideHtml(layoutDeck({
            ...state.deck,
            slides
          })[index]);
          feedback.textContent = "";
        } catch {
          feedback.textContent = "입력한 차트 값과 범위를 확인해 주세요.";
        }
      };
      const unload = (e) => {
        if (dirty) {
          e.preventDefault();
          e.returnValue = "";
        }
      };
      window.addEventListener("beforeunload", unload);
      const close = () => {
        window.removeEventListener("beforeunload", unload);
        dialog.close();
        dialog.remove();
        editor = null;
        main.querySelector("[data-act=\"edit\"]")?.focus();
      };
      const discard = () => !dirty || window.confirm("저장하지 않은 변경 내용을 버릴까요?");
      editor = { close };
      dialog.addEventListener("input", (e) => {
        const field = fields[Number(e.target.dataset.field)];
        if (!field) return;
        const value = field.type === "number" ? e.target.value === "" ? NaN : Number(e.target.value) : e.target.value;
        updateSlideField(draft, field.path, value);
        dirty = true;
        draw();
      });
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        if (!saving && discard()) close();
      });
      dialog.addEventListener("click", async (e) => {
        const button = e.target.closest("[data-edit]");
        if (!button || button.disabled || saving) return;
        const action = button.dataset.edit;
        if (action === "cancel") {
          if (discard()) close();
          return;
        }
        if (action === "reload") {
          if (!discard()) return;
          saving = true;
          dialog.querySelectorAll("button,input,textarea").forEach((element) => {
            element.disabled = true;
          });
          try {
            const deck = await opts.loadDeck(courseId, level, "ko");
            if (disposed) return;
            state.deck = deck;
            state.laid = layoutDeck(deck);
            close();
            renderMain();
            editPage();
          } catch (error) {
            feedback.textContent = error.message;
          } finally {
            saving = false;
            dialog.querySelectorAll("button,input,textarea").forEach((element) => {
              element.disabled = false;
            });
            dialog.querySelector("[data-edit=\"reset\"]").disabled = !info.revision;
          }
          return;
        }
        if (action === "reset" && !window.confirm("이 페이지를 기본 자료로 복원하고 저장할까요?")) return;
        saving = true;
        dialog.querySelectorAll("button,input,textarea").forEach((element) => {
          element.disabled = true;
        });
        feedback.textContent = "저장 중입니다…";
        try {
          const deck = await opts.saveSlide(courseId, level, original.slideId, {
            revision: info.revision,
            sourceHash: info.sourceHash,
            ...action === "reset" ? { reset: true } : { slide: draft }
          });
          if (disposed) return;
          state.deck = deck;
          state.laid = layoutDeck(deck);
          statusMessage = `${index + 1}번 페이지 ${action === "reset" ? "복원" : "저장"} 완료`;
          dirty = false;
          close();
          renderMain();
        } catch (error) {
          if (!disposed) feedback.textContent = `${error.message}\n입력한 내용은 유지됩니다. 필요하면 내용을 복사한 뒤 최신 페이지를 불러오세요.`;
        } finally {
          saving = false;
          dialog.querySelectorAll("button,input,textarea").forEach((element) => {
            element.disabled = false;
          });
          dialog.querySelector("[data-edit=\"reset\"]").disabled = !info.revision;
        }
      });
      draw();
      dialog.showModal();
    }

  async function downloadPptx() {
    if (disposed || state.busy || !state.deck || !isAdmin || !opts.loadPptxLib) return;
    const deck = state.deck;
    const laid = state.laid;
    state.busy = true; renderMain();
    try {
      const { PptxGenJS, JSZip } = await opts.loadPptxLib();
      if (disposed) return;
      const imagesReady = await loadPresentationImages(laid);
      const blob = await exportPptx({ PptxGenJS, JSZip, deck, laid: imagesReady, outputType: 'blob' });
      if (disposed) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = pptxFileName(deck);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      if (!disposed) alert(`${tr('PPTX를 만들지 못했습니다', 'Could not create PPTX')}: ${e.message}`);
    } finally { state.busy = false; if (!disposed && state.deck) renderMain(); }
  }

  let imageDialog = null;
  function openImage() {
    const sh = cur()?.shapes.find(s => s.t === 'image');
    if (!sh || imageDialog) return;
    const focus = document.activeElement;
    imageDialog = document.createElement('dialog');
    imageDialog.className = 'sca-image-dialog';
    imageDialog.setAttribute('aria-label', sh.alt);
    imageDialog.lang = state.language;
    imageDialog.innerHTML = `<form method="dialog"><button autofocus>${tr('닫기', 'Close')}</button></form><div class="sca-image-scroll"><img src="${esc(sh.src)}" alt="${esc(sh.alt)}"></div><p>${tr('모바일에서는 두 손가락으로 확대해 볼 수 있습니다.', 'Pinch with two fingers to zoom on mobile.')}</p>`;
    imageDialog.addEventListener('close', () => { imageDialog?.remove(); imageDialog = null; focus?.focus(); });
    document.body.appendChild(imageDialog); imageDialog.showModal();
  }

  // ---- 발표 모드 ----
  let show = null;
  let cleanShow = null;
  function renderShow() {
    if (!show) return;
    const stage = show.querySelector('.sca-show__stage');
    stage.className = `sca-show__stage ${state.reveal ? 'sca-reveal' : ''}`;
    stage.innerHTML = slideHtml(cur()) + wm();
    show.querySelector('.sca-show__count').textContent = `${state.index + 1} / ${state.laid.length}`;
  }
  function startShow() {
    if (show || !cur()) return;
    // WebKit touch activation may leave focus on body rather than on the tapped button.
    const focus = document.activeElement === document.body ? root.querySelector('[data-act="show"]') : document.activeElement;
    const overflow = document.body.style.overflow;
    show = document.createElement('div');
    const overlay = show;
    show.className = 'sca sca-show sca-protect';
    show.lang = state.language;
    show.setAttribute('role', 'dialog');
    show.setAttribute('aria-modal', 'true');
    show.setAttribute('aria-label', tr('프레젠테이션', 'Presentation'));
    show.innerHTML = `<div class="sca-show__frame"><div class="sca-show__stage"></div></div><div class="sca-show__controls"><button type="button" data-show="prev" aria-label="${tr('이전 슬라이드', 'Previous slide')}">←</button><span class="sca-show__count" aria-live="polite" aria-atomic="true"></span><button type="button" data-show="next" aria-label="${tr('다음 슬라이드', 'Next slide')}">→</button><button type="button" data-show="close" aria-label="${tr('프레젠테이션 닫기', 'Close presentation')}">${tr('닫기', 'Close')}</button></div>`;
    document.body.appendChild(show);
    document.body.style.overflow = 'hidden';
    const background = [...document.body.children].filter(el => el instanceof HTMLElement && el !== overlay && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName));
    const inertStates = background.map(el => el.inert);
    background.forEach(el => { el.inert = true; });
    const frame = show.querySelector('.sca-show__frame');
    const stage = show.querySelector('.sca-show__stage');
    const listeners = new AbortController();
    const viewport = window.visualViewport;
    let raf = 0;
    let enteredFullscreen = false;
    // Fit the whole slide, including its footer, in the space beside/above the touch controls.
    // visualViewport handles mobile address bars; do not counteract the user's pinch zoom.
    const fit = () => { stage.style.width = `${Math.max(0, Math.min(frame.clientWidth, frame.clientHeight * W / H))}px`; };
    const resize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!viewport || viewport.scale === 1 || document.fullscreenElement === overlay) {
          const visible = viewport && document.fullscreenElement !== overlay;
          overlay.style.width = `${visible ? viewport.width : window.innerWidth}px`;
          overlay.style.height = `${visible ? viewport.height : window.innerHeight}px`;
          overlay.style.left = `${visible ? viewport.offsetLeft : 0}px`;
          overlay.style.top = `${visible ? viewport.offsetTop : 0}px`;
        }
        fit();
      });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    for (const target of [window, viewport].filter(Boolean)) target.addEventListener('resize', resize, { signal: listeners.signal });
    viewport?.addEventListener('scroll', resize, { signal: listeners.signal });
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement === overlay) enteredFullscreen = true;
      else if (enteredFullscreen) return endShow();
      resize();
    }, { signal: listeners.signal });
    cleanShow = () => {
      listeners.abort(); observer.disconnect(); cancelAnimationFrame(raf);
      document.body.style.overflow = overflow;
      background.forEach((el, index) => { el.inert = inertStates[index]; });
      const restoreFocus = () => {
        if (show || disposed) return;
        const returnTo = focus?.isConnected ? focus : root.querySelector('[data-act="show"]');
        returnTo?.focus({ preventScroll: true });
      };
      restoreFocus();
      // WebKit can defer removal of inert until the next frame after a touch click.
      requestAnimationFrame(restoreFocus);
    };
    renderShow();
    resize();
    show.addEventListener('click', (e) => {
      const action = e.target.closest('[data-show]')?.dataset.show;
      if (action) return ({ prev, next, close: endShow })[action]();
      if (e.target.closest('.sca-show__frame')) {
        const bounds = frame.getBoundingClientRect();
        if (e.clientX < bounds.left + bounds.width * 0.25) prev(); else next();
      }
    });
    show.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const buttons = [...overlay.querySelectorAll('button')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    show.addEventListener('contextmenu', (e) => e.preventDefault());
    show.querySelector('[data-show="close"]').focus({ preventScroll: true });
    // Unsupported / denied fullscreen still leaves a fully usable mobile presentation.
    try { show.requestFullscreen?.().catch(() => {}); } catch { /* Use the overlay fallback. */ }
  }
  function endShow() {
    if (!show) return;
    const ownFullscreen = document.fullscreenElement === show;
    show.remove(); show = null;
    cleanShow?.(); cleanShow = null;
    if (ownFullscreen) document.exitFullscreen?.().catch(() => {});
  }

  // ---- 이벤트 ----
  root.addEventListener('contextmenu', (e) => { if (e.target.closest('.sca-protect')) e.preventDefault(); }, { signal: events.signal });
  root.addEventListener('dragstart', (e) => { if (e.target.closest('.sca-protect')) e.preventDefault(); }, { signal: events.signal });
  side.addEventListener('click', (e) => { const b = e.target.closest('.sca-lv'); if (b && !b.disabled) open(b.dataset.c, b.dataset.l); }, { signal: events.signal });
  main.addEventListener('change', (e) => { if (e.target.matches('.sca-select')) { const [c, l] = e.target.value.split('|'); open(c, l); } }, { signal: events.signal });
  main.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-go]');
    if (!t) return;
    if (t.disabled) return;
    if (t.dataset.go) return go(Number(t.dataset.go));
    ({ prev, next, show: startShow, pptx: downloadPptx, image: openImage,
      edit: async () => { if (state.language !== 'ko') await switchLanguage('ko'); if (state.language === 'ko') editPage(); },
      ko: () => switchLanguage('ko'), en: () => switchLanguage('en'),
      fallback: () => { state.language = 'ko'; open(state.courseId, state.level); },
      retry: () => open(state.courseId, state.level),
      notes: () => { state.notes = !state.notes; renderMain(); },
      reveal: () => { state.reveal = !state.reveal; renderMain(); } })[t.dataset.act]?.();
  }, { signal: events.signal });
  const onKey = (e) => {
    if (!root.isConnected) return destroy();
    if (editor || imageDialog || !state.deck || e.target.closest?.('input,textarea,select,[contenteditable]')) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && show && !e.target.closest?.('button'))) { e.preventDefault(); next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); prev(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(state.laid.length - 1);
    else if (k === 'Escape') endShow();
    else if ((k === 'f' || k === 'F') && !show) startShow();
    else if ((k === 'n' || k === 'N') && isAdmin && !show) { state.notes = !state.notes; renderMain(); }
  };
  document.addEventListener('keydown', onKey);

  function destroy() {
    disposed = true;
    events.abort();
    editor?.close();
    imageDialog?.close();
    endShow();
    document.removeEventListener('keydown', onKey);
    root.innerHTML = '';
  }

  renderSide();
  if (available[0]) open(available[0].c.id, available[0].l.level); else renderMain();
  return { open, destroy };
}
