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

const STATUS = { ready: '공개', review: '검토 중', draft: '초안', planned: '준비 중' };
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
.sca-toggles{display:flex;gap:8px}
.sca .sca-toggle[aria-pressed="true"]{background:var(--dark);border-color:var(--dark);color:#fff}
.sca-notes{background:var(--tint);border-radius:12px;padding:16px 18px;font-size:15px;line-height:1.6;color:var(--body);white-space:pre-wrap;margin-bottom:18px}
.sca-notes:empty::before{content:"이 슬라이드에는 발표자 노트가 없습니다.";color:var(--muted)}
.sca-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.sca-thumb{border:0;background:none;padding:0;text-align:left}
.sca-thumb .sca-slide{border-radius:6px;box-shadow:0 0 0 1px var(--line);transition:box-shadow .15s}
.sca-thumb[aria-current="true"] .sca-slide{box-shadow:0 0 0 2px var(--ink)}
.sca-thumb span{display:block;font-size:12px;color:var(--muted);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sca-empty{padding:60px 0;text-align:center;color:var(--muted);font-size:15px}
.sca-show{position:fixed;inset:0;background:#000;z-index:9999;display:flex;align-items:center;justify-content:center}
.sca-show__stage{width:min(100vw,calc(100vh * 16 / 9))}
.sca-show__hint{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);color:#777;font-size:12px;font-family:inherit;opacity:0;transition:opacity .3s}
.sca-show:hover .sca-show__hint{opacity:1}
.sca-select{display:none}
.sca-stage,.sca-show__stage{position:relative}
.sca-protect{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.sca-wm{position:absolute;inset:0;pointer-events:none;z-index:2;background-repeat:repeat}
.sca-role{display:block;font-size:12px;font-weight:600;color:var(--muted);margin:-10px 0 20px 8px}
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

// 보는 사람 이름을 옅게 반복하는 워터마크(SVG 배경). 캡처 유출 억제용.
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
  const wmLabel = `${user.name || '수강생'} · THE CUP EDU · ${new Date().toISOString().slice(0, 10)}`;
  const wm = () => `<div class="sca-wm" style="${watermarkCss(wmLabel)}"></div>`;
  const state = { courseId: null, level: null, deck: null, laid: [], index: 0, notes: false, reveal: false, busy: false };
  let disposed = false;
  let loadVersion = 0;
  const events = new AbortController();
  const available = catalog.courses.flatMap((c) => c.levels.filter((l) => l.deck).map((l) => ({ c, l })));

  root.innerHTML = `<div class="sca"><aside class="sca-side"></aside><section class="sca-main"></section></div>`;
  const side = root.querySelector('.sca-side');
  const main = root.querySelector('.sca-main');

  function renderSide() {
    side.innerHTML = `<h2>SCA 교육 과정</h2><span class="sca-role">${isAdmin ? '관리자 · 초안 포함 전체 보기' : esc(user.name)}</span>` +
      catalog.courses.map((c) => `
      <div class="sca-course"><p class="sca-course__name">${esc(c.name)}<span class="sca-course__ko">${esc(c.ko)}</span></p>
      ${c.levels.map((l) => `<button class="sca-lv" data-c="${esc(c.id)}" data-l="${esc(l.level)}" ${l.deck ? '' : 'disabled'}
        aria-current="${state.courseId === c.id && state.level === l.level}">${esc(l.level)}<span class="sca-chip">${esc(STATUS[l.status] ?? '')}</span></button>`).join('')}
      </div>`).join('');
  }

  const selectOptions = () => available.map(({ c, l }) =>
    `<option value="${esc(c.id)}|${esc(l.level)}" ${state.courseId === c.id && state.level === l.level ? 'selected' : ''}>${esc(c.name)} · ${esc(l.level)}</option>`).join('');

  const cur = () => state.laid[state.index];
  const hasReveal = () => !!cur()?.shapes.some((s) => s.reveal);

  function renderMain() {
    const d = state.deck;
    if (!d) {
      main.innerHTML = available.length ? `<div class="sca-empty">왼쪽에서 과정을 선택하세요.</div>` : `<div class="sca-empty">아직 공개된 교육자료가 없습니다.</div>`;
      return;
    }
    const lv = catalog.courses.find((c) => c.id === state.courseId)?.levels.find((l) => l.level === state.level) ?? {};
    const sl = cur();
    main.innerHTML = `
      <select class="sca-select" aria-label="과정 선택">${selectOptions()}</select>
      <div class="sca-head">
        <div><h1>${esc(d.course)} ${esc(d.level)}</h1>
          <p>슬라이드 ${state.laid.length}장${isAdmin ? ` · ${esc(STATUS[lv.status] ?? '')} · v${esc(d.version)} · ${esc(d.updated)}` : ''}</p></div>
        <div class="sca-actions">
          ${isAdmin && opts.loadPptxLib ? `<button class="sca-btn" data-act="pptx" ${state.busy ? 'disabled' : ''}>${state.busy ? '만드는 중…' : 'PPTX 다운로드'}</button>` : ''}
          <button class="sca-btn sca-btn--dark" data-act="show">발표 시작</button>
        </div>
      </div>
      ${isAdmin && d.status !== 'ready' && d.sourceNote ? `<div class="sca-note">${esc(d.sourceNote)}</div>` : ''}
      <div class="sca-stage sca-protect ${state.reveal ? 'sca-reveal' : ''}">${slideHtml(sl)}${wm()}</div>
      <div class="sca-bar">
        <div class="sca-nav">
          <button class="sca-icon" data-act="prev" aria-label="이전 슬라이드">←</button>
          <span class="sca-count">${state.index + 1} / ${state.laid.length}</span>
          <button class="sca-icon" data-act="next" aria-label="다음 슬라이드">→</button>
        </div>
        <div class="sca-toggles">
          ${hasReveal() ? `<button class="sca-btn sca-toggle" data-act="reveal" aria-pressed="${state.reveal}">정답 보기</button>` : ''}
          ${isAdmin ? `<button class="sca-btn sca-toggle" data-act="notes" aria-pressed="${state.notes}">발표자 노트</button>` : ''}
        </div>
      </div>
      ${isAdmin && state.notes ? `<div class="sca-notes">${esc(sl.notes)}</div>` : ''}
      <div class="sca-thumbs sca-protect">${state.laid.map((s, i) => `
        <button class="sca-thumb" data-go="${i}" aria-current="${i === state.index}" aria-label="${i + 1}번 슬라이드">
          ${slideHtml(s)}<span>${i + 1}. ${esc(s.title)}</span></button>`).join('')}
      </div>`;
  }

  async function open(courseId, level) {
    if (disposed) return;
    const lv = catalog.courses.find((c) => c.id === courseId)?.levels.find((l) => l.level === level);
    if (!lv?.deck) return;
    const version = ++loadVersion;
    Object.assign(state, { courseId, level, index: 0, reveal: false, deck: null });
    renderSide();
    main.innerHTML = `<div class="sca-empty">불러오는 중…</div>`;
    try {
      const deck = await opts.loadDeck(courseId, level);
      if (disposed || version !== loadVersion) return;
      state.deck = deck;
      state.laid = layoutDeck(deck);
      renderMain();
    } catch (e) {
      if (disposed || version !== loadVersion) return;
      main.innerHTML = `<select class="sca-select" aria-label="과정 선택">${selectOptions()}</select><div class="sca-empty" role="alert">교육자료를 불러오지 못했습니다.<br>${esc(e.message)}<br><button class="sca-btn" data-act="retry">다시 불러오기</button></div>`;
    }
  }

  function go(i) {
    const n = Math.max(0, Math.min(state.laid.length - 1, i));
    if (n === state.index) return;
    state.index = n; state.reveal = false;
    renderMain(); renderShow();
    main.querySelector('.sca-thumb[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  // 정답이 있는 슬라이드는 '다음'을 한 번 누르면 정답부터 공개(키노트 빌드처럼)
  const next = () => { if (hasReveal() && !state.reveal) { state.reveal = true; renderMain(); renderShow(); } else go(state.index + 1); };
  const prev = () => go(state.index - 1);

  async function downloadPptx() {
    if (disposed || state.busy || !state.deck || !isAdmin || !opts.loadPptxLib) return;
    const deck = state.deck;
    const laid = state.laid;
    state.busy = true; renderMain();
    try {
      const { PptxGenJS, JSZip } = await opts.loadPptxLib();
      if (disposed) return;
      const blob = await exportPptx({ PptxGenJS, JSZip, deck, laid, outputType: 'blob' });
      if (disposed) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = pptxFileName(deck);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      if (!disposed) alert(`PPTX를 만들지 못했습니다: ${e.message}`);
    } finally { state.busy = false; if (!disposed && state.deck) renderMain(); }
  }

  // ---- 발표 모드 ----
  let show = null;
  function renderShow() {
    if (!show) return;
    const stage = show.querySelector('.sca-show__stage');
    stage.className = `sca-show__stage ${state.reveal ? 'sca-reveal' : ''}`;
    stage.innerHTML = slideHtml(cur()) + wm();
  }
  function startShow() {
    show = document.createElement('div');
    show.className = 'sca sca-show sca-protect';
    show.style.display = 'flex';
    show.innerHTML = `<div class="sca-show__stage"></div><div class="sca-show__hint">← → 이동 · 클릭 다음 · Esc 종료</div>`;
    document.body.appendChild(show);
    renderShow();
    show.addEventListener('click', (e) => (e.clientX < window.innerWidth * 0.25 ? prev() : next()));
    show.addEventListener('contextmenu', (e) => e.preventDefault());
    show.requestFullscreen?.().catch(() => {});
  }
  function endShow() {
    if (!show) return;
    show.remove(); show = null;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  const onFs = () => { if (!document.fullscreenElement && show) endShow(); };
  document.addEventListener('fullscreenchange', onFs);

  // ---- 이벤트 ----
  root.addEventListener('contextmenu', (e) => { if (e.target.closest('.sca-protect')) e.preventDefault(); }, { signal: events.signal });
  root.addEventListener('dragstart', (e) => { if (e.target.closest('.sca-protect')) e.preventDefault(); }, { signal: events.signal });
  side.addEventListener('click', (e) => { const b = e.target.closest('.sca-lv'); if (b && !b.disabled) open(b.dataset.c, b.dataset.l); }, { signal: events.signal });
  main.addEventListener('change', (e) => { if (e.target.matches('.sca-select')) { const [c, l] = e.target.value.split('|'); open(c, l); } }, { signal: events.signal });
  main.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-go]');
    if (!t) return;
    if (t.dataset.go) return go(Number(t.dataset.go));
    ({ prev, next, show: startShow, pptx: downloadPptx,
      retry: () => open(state.courseId, state.level),
      notes: () => { state.notes = !state.notes; renderMain(); },
      reveal: () => { state.reveal = !state.reveal; renderMain(); } })[t.dataset.act]?.();
  }, { signal: events.signal });
  const onKey = (e) => {
    if (!root.isConnected) return destroy();
    if (!state.deck || e.target.closest?.('input,textarea,select,[contenteditable]')) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && show)) { e.preventDefault(); next(); }
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
    endShow();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFs);
    root.innerHTML = '';
  }

  renderSide();
  if (available[0]) open(available[0].c.id, available[0].l.level); else renderMain();
  return { open, destroy };
}
