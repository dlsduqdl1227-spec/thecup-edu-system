// 도형 목록 → DOM. 사이트 전역 CSS(p·table·td 크기 등)가 슬라이드에 새지 않도록 SLIDE_CSS에서 되돌린다.
// 인치 좌표를 % 와 컨테이너 쿼리 단위(cqw)로 변환해 어떤 화면 폭에서도 PPTX와 같은 비율로 보인다.
import { W, H, THEME } from './theme.js';
import { parseRuns, LINE_H } from './text.js';

const pct = (v, total) => `${((v / total) * 100).toFixed(4)}%`;
const pt = (v) => `calc(${v} * 100cqw / 960)`;        // 1pt = 슬라이드 폭의 1/960
const inch = (v) => `calc(${v} * 100cqw / ${W})`;
const hex = (c) => `#${c}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function box(sh) {
  return `left:${pct(sh.x, W)};top:${pct(sh.y, H)};width:${pct(sh.w, W)};height:${pct(sh.h, H)};`;
}

function runsHtml(str) {
  return parseRuns(str).map((r) => (r.bold ? `<strong>${esc(r.text)}</strong>` : esc(r.text))).join('').replace(/\n/g, '<br>');
}

function textHtml(sh) {
  const just = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[sh.valign];
  const style = `${box(sh)}justify-content:${just};text-align:${sh.align};color:${hex(sh.color)};font-size:${pt(sh.size)};` +
    `font-weight:${sh.bold ? 700 : 400};letter-spacing:${pt(sh.spacing)};--bullet:${hex(sh.bulletColor)};--indent:${inch(sh.indent)};`;
  const paras = sh.paras.map((p, i) => {
    const ps = [];
    if (p.color) ps.push(`color:${hex(p.color)}`);
    if (p.bold) ps.push('font-weight:700');
    if (p.size) ps.push(`font-size:${pt(p.size)}`);
    if (i < sh.paras.length - 1) ps.push(`margin-bottom:${pt(p.after ?? sh.after)}`);
    return `<p class="${p.bullet ? 'b' : ''}" style="${ps.join(';')}">${runsHtml(p.text)}</p>`;
  }).join('');
  return `<div class="sh tx${sh.reveal ? ' reveal' : ''}" style="${style}">${paras}</div>`;
}

function tableHtml(sh) {
  const cols = sh.colW.map((w) => `<col style="width:${pct(w, sh.w)}">`).join('');
  const th = sh.head.map((c) => `<th>${runsHtml(c)}</th>`).join('');
  const tr = sh.rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 && sh.firstColBold ? ' class="k"' : ''}>${runsHtml(c)}</td>`).join('')}</tr>`).join('');
  const style = `left:${pct(sh.x, W)};top:${pct(sh.y, H)};width:${pct(sh.w, W)};font-size:${pt(sh.size)};--row:${inch(sh.rowH)};`;
  return `<table class="sh tb" style="${style}"><colgroup>${cols}</colgroup><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

function shapeHtml(sh) {
  switch (sh.t) {
    case 'rect':
      return `<div class="sh" style="${box(sh)}background:${hex(sh.fill)};border-radius:${sh.radius ? inch(sh.radius) : 0}"></div>`;
    case 'ellipse':
      return `<div class="sh" style="${box(sh)}border-radius:50%;${sh.fill ? `background:${hex(sh.fill)};` : ''}${sh.line ? `border:${pt(sh.lineW)} solid ${hex(sh.line)};` : ''}"></div>`;
    case 'line':
      return `<svg class="sh" style="left:0;top:0;width:100%;height:100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="${sh.x1}" y1="${sh.y1}" x2="${sh.x2}" y2="${sh.y2}" stroke="${hex(sh.color)}" stroke-width="${sh.width / 72}"/></svg>`;
    case 'text':
      return textHtml(sh);
    case 'table':
      return tableHtml(sh);
    default:
      return '';
  }
}

export function slideHtml(laid) {
  return `<div class="sca-slide" style="background:${hex(laid.bg)}"><div class="sca-slide__in">${laid.shapes.map(shapeHtml).join('')}</div></div>`;
}

export const SLIDE_CSS = `
.sca-slide{container-type:inline-size;position:relative;width:100%;aspect-ratio:${W}/${H};overflow:hidden;font-family:${THEME.webFont};-webkit-font-smoothing:antialiased;font-feature-settings:"ss06"}
.sca-slide__in{position:absolute;inset:0}
.sca-slide .sh{position:absolute;box-sizing:border-box;margin:0}
.sca-slide .tx{display:flex;flex-direction:column;line-height:${LINE_H};word-break:keep-all;overflow-wrap:anywhere;letter-spacing:-0.01em}
.sca-slide .tx p{margin:0;max-width:none;font-size:inherit;line-height:inherit;color:inherit;letter-spacing:inherit;font-weight:inherit;text-align:inherit}
.sca-slide strong{color:inherit;font-weight:700}
.sca-slide .tx p.b{position:relative;padding-left:var(--indent)}
.sca-slide .tx p.b::before{content:"";position:absolute;left:calc(var(--indent) * .22);top:calc(${LINE_H}em / 2 - .16em);width:.32em;height:.32em;border-radius:50%;background:var(--bullet)}
.sca-slide .reveal{opacity:0;transition:opacity .3s}
.sca-reveal .sca-slide .reveal{opacity:1}
.sca-slide .tb{min-width:0;white-space:normal;border-collapse:collapse;table-layout:fixed;line-height:1.3;word-break:keep-all;color:#${THEME.c.body}}
.sca-slide .tb th,.sca-slide .tb td{height:var(--row);padding:0 calc(0.12 * 100cqw / ${W});text-align:left;vertical-align:middle;border-bottom:max(1px,.08cqw) solid #${THEME.c.line}}
.sca-slide .tb th{color:#${THEME.c.muted};font-weight:700;font-size:min(1em, calc(14 * 100cqw / 960));border-bottom:max(1px,.14cqw) solid #${THEME.c.ink}}
.sca-slide .tb td{font-size:inherit;color:inherit;letter-spacing:inherit}
.sca-slide .tb tbody tr:hover{background:transparent}
.sca-slide .tb td.k{font-weight:700;color:#${THEME.c.ink}}
`;
