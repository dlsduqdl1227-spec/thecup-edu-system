// 슬라이드 JSON → 도형 목록(인치 좌표). 웹 렌더러와 PPTX 내보내기가 이 결과를 공통으로 사용한다.
// 디자인 원칙(키노트 스타일): 슬라이드당 메시지 하나 · 큰 글씨 · 넓은 여백 · 박스/아이콘 대신 얇은 선
import { W, H, M, THEME } from './theme.js';
import { fitSize, measure } from './text.js';

const C = THEME.c;
const CW = W - M * 2;
const BOTTOM = 6.7;

// ---------- 도형 헬퍼 ----------
const hline = (x, y, w, color = C.line, width = 1) => ({ t: 'line', x1: x, y1: y, x2: x + w, y2: y, color, width });
const vline = (x, y, h, color = C.line, width = 1) => ({ t: 'line', x1: x, y1: y, x2: x, y2: y + h, color, width });

function text(x, y, w, h, content, o = {}) {
  const paras = (Array.isArray(content) ? content : [content]).map((p) => (typeof p === 'string' ? { text: p } : p));
  let size = o.size ?? 18;
  if (o.fit !== false) size = fitSize(paras, { w, h }, { size, min: o.min, paraAfter: o.after ?? 0, bulletIndent: o.indent ?? 0.3, bold: !!o.bold });
  return { t: 'text', x, y, w, h, paras, size, color: o.color ?? C.body, bold: !!o.bold, align: o.align ?? 'left',
    valign: o.valign ?? 'top', after: o.after ?? 0, indent: o.indent ?? 0.3, spacing: o.spacing ?? 0, bulletColor: o.bulletColor ?? C.muted };
}
// 텍스트를 넣고 실제 차지하는 높이를 함께 돌려준다 (다음 요소 배치용)
function flow(x, y, w, maxH, content, o) {
  const sh = text(x, y, w, maxH, content, o);
  const h = Math.min(maxH, measure(sh.paras, w, sh.size, { paraAfter: sh.after, bulletIndent: sh.indent, bold: sh.bold }));
  sh.h = h + 0.06;
  return [sh, h];
}

const pageNo = (ctx, dark) => text(W - M - 1.5, 6.98, 1.5, 0.26, `${ctx.index + 1}`, { size: 10, color: dark ? C.onDarkFaint : C.faint, align: 'right', fit: false });

// 밝은 슬라이드 공통 제목부. 제목 아래 y 좌표를 돌려준다.
function heading(s, shapes, { size = 40 } = {}) {
  let y = 0.85;
  if (s.eyebrow) { shapes.push(text(M, y, CW, 0.3, s.eyebrow, { size: 14, bold: true, color: C.muted, fit: false })); y += 0.42; }
  const [t, th] = flow(M, y, CW, 1.5, s.title ?? '', { size, min: 28, bold: true, color: C.ink });
  shapes.push(t); y += th + 0.12;
  if (s.lead) { const [l, lh] = flow(M, y, CW * 0.8, 1.0, s.lead, { size: 20, min: 15, color: C.muted }); shapes.push(l); y += lh; }
  return y + 0.55;
}

const centerY = (top, blockH, bottom = BOTTOM, bias = 0.42) => top + Math.max(0, (bottom - top - blockH) * bias);
const asParas = (items = [], o = {}) => items.map((t) => ({ text: t, ...o }));

// ---------- 레이아웃 ----------
const L = {};

L.cover = (s, ctx) => {
  const shapes = [];
  shapes.push(hline(M, 1.55, 0.9, C.accentLine, 2.5));
  shapes.push(text(M, 1.9, CW, 0.34, s.eyebrow ?? 'SCA Coffee Skills Program', { size: 15, bold: true, color: C.onDarkMuted, fit: false }));
  const [t, th] = flow(M, 2.35, 10.5, 2.2, s.title ?? ctx.deck.course, { size: 80, min: 48, bold: true, color: C.onDark });
  shapes.push(t);
  shapes.push(text(M, 2.35 + th + 0.05, 8, 0.8, s.level ?? ctx.deck.level, { size: 36, color: C.onDarkMuted, fit: false }));
  if (s.subtitle) shapes.push(text(M, 5.35, 8.2, 0.9, s.subtitle, { size: 18, min: 14, color: C.onDarkMuted }));
  shapes.push(text(M, 6.62, 6, 0.32, s.footer ?? 'THE CUP EDU', { size: 13, bold: true, color: C.onDark, spacing: 1, fit: false }));
  return { bg: C.dark, shapes };
};

L.agenda = (s, ctx) => {
  const shapes = [];
  const top = heading(s, shapes);
  const items = (s.items ?? []).map((it) => (typeof it === 'string' ? { title: it } : it));
  const cols = items.length > 4 ? 2 : 1;
  const per = Math.ceil(items.length / cols);
  const gap = 0.8;
  const cw = cols === 2 ? (CW - gap) / 2 : CW * 0.6;
  const rh = Math.min(1.25, (BOTTOM - top) / per);
  items.forEach((it, i) => {
    const x = M + Math.floor(i / per) * (cw + gap), y = top + (i % per) * rh;
    shapes.push(hline(x, y, cw));
    shapes.push(text(x, y + 0.24, 0.7, 0.4, String(i + 1).padStart(2, '0'), { size: 15, bold: true, color: C.faint, fit: false }));
    shapes.push(text(x + 0.7, y + 0.18, cw - 0.7, 0.5, it.title, { size: 26, min: 18, bold: true, color: C.ink }));
    if (it.desc) shapes.push(text(x + 0.7, y + 0.66, cw - 0.7, rh - 0.72, it.desc, { size: 17, min: 12, color: C.muted }));
  });
  shapes.push(pageNo(ctx));
  return { bg: C.paper, shapes };
};

L.section = (s, ctx) => {
  const shapes = [];
  const hasObj = s.objectives?.length;
  const y0 = hasObj ? 1.35 : 2.2;
  shapes.push(hline(M, y0 - 0.3, 0.9, C.accentLine, 2.5));
  shapes.push(text(M, y0, 3, 0.4, s.number ?? '', { size: 20, bold: true, color: C.onDarkMuted, fit: false }));
  const [t, th] = flow(M, y0 + 0.5, 10.5, 2.0, s.title ?? '', { size: 64, min: 40, bold: true, color: C.onDark });
  shapes.push(t);
  if (s.subtitle) shapes.push(flow(M, y0 + 0.5 + th + 0.2, 9, 1.0, s.subtitle, { size: 22, min: 16, color: C.onDarkMuted })[0]);
  if (hasObj) {
    const y = 4.75, n = s.objectives.length, gap = 0.5;
    const cw = (CW - gap * (n - 1)) / n;
    shapes.push(text(M, y - 0.5, 4, 0.3, '학습 목표', { size: 13, bold: true, color: C.onDarkMuted, fit: false }));
    const size = Math.min(...s.objectives.map((o) => fitSize(o, { w: cw, h: 1.45 }, { size: 19, min: 13 })));
    s.objectives.forEach((o, i) => {
      const x = M + i * (cw + gap);
      shapes.push(hline(x, y, cw, C.darkLine));
      shapes.push(text(x, y + 0.22, cw, 1.5, o, { size, fit: false, color: C.onDark }));
    });
  }
  shapes.push(pageNo(ctx, true));
  return { bg: C.dark, shapes };
};

L.statement = (s, ctx) => {
  const dark = !!s.dark;
  const shapes = [];
  const w = s.width ?? 10.8;
  const t = text(M, 0, w, 3.4, s.text ?? s.title ?? '', { size: s.size ?? 56, min: 34, bold: true, color: dark ? C.onDark : C.ink });
  const tH = measure(t.paras, w, t.size, { bold: true });
  const subH = s.sub ? measure(s.sub, 9, 22) : 0;
  const eyeH = s.eyebrow ? 0.5 : 0;
  const total = eyeH + tH + (s.sub ? 0.35 + subH : 0);
  let y = (H - total) / 2 - 0.15;
  if (s.eyebrow) { shapes.push(text(M, y, CW, 0.32, s.eyebrow, { size: 15, bold: true, color: dark ? C.onDarkMuted : C.muted, fit: false })); y += eyeH; }
  t.y = y; t.h = tH + 0.08; shapes.push(t); y += tH + 0.35;
  if (s.sub) shapes.push(text(M, y, 9, subH + 0.1, s.sub, { size: 22, fit: false, color: dark ? C.onDarkMuted : C.muted }));
  shapes.push(pageNo(ctx, dark));
  return { bg: dark ? C.dark : C.paper, shapes };
};

L.points = (s, ctx) => {
  const shapes = [];
  const top = heading(s, shapes);
  const side = s.callout;
  const lw = side ? 7.2 : CW * 0.82;
  const items = s.points ?? s.bullets ?? [];
  const rh = Math.min(1.05, (BOTTOM - top) / items.length);
  const size = Math.min(...items.map((it) => fitSize(it, { w: lw, h: rh - 0.3 }, { size: 25, min: 15 })));
  items.forEach((it, i) => {
    const y = top + i * rh;
    shapes.push(hline(M, y, lw));
    shapes.push(text(M, y + 0.2, lw, rh - 0.25, it, { size, fit: false, color: C.ink }));
  });
  if (side) {
    const x = M + lw + 0.9, w = W - M - x;
    shapes.push(vline(x - 0.45, top, BOTTOM - top));
    shapes.push(text(x, top, w, 0.32, side.label ?? '핵심', { size: 14, bold: true, color: C.muted, fit: false }));
    shapes.push(text(x, top + 0.5, w, BOTTOM - top - 0.5, side.text, { size: 32, min: 18, bold: true, color: C.ink }));
  }
  shapes.push(pageNo(ctx));
  return { bg: C.paper, shapes };
};
L.bullets = L.points;

L.features = (s, ctx) => {
  const shapes = [];
  const top = heading(s, shapes);
  const items = s.items ?? s.cards ?? [];
  const n = items.length;
  const cols = n <= 4 ? n : 3;
  const rows = Math.ceil(n / cols);
  const gx = 0.6, gy = 0.5;
  const cw = (CW - gx * (cols - 1)) / cols;
  const rhMax = (BOTTOM - top - gy * (rows - 1)) / rows;
  const bodies = items.map((it) => (Array.isArray(it.body) ? asParas(it.body, { after: 6 }) : [it.body ?? '']));
  const tSize = Math.min(...items.map((it) => fitSize(it.title, { w: cw, h: 1.0 }, { size: 28, min: 17, bold: true })));
  const tH = Math.max(...items.map((it) => measure(it.title, cw, tSize, { bold: true })));
  const bSize = Math.min(...bodies.map((b) => fitSize(b, { w: cw, h: rhMax - 0.62 - tH - 0.2 }, { size: 20, min: 12, paraAfter: 6 })));
  const bH = Math.max(...bodies.map((b) => measure(b, cw, bSize, { paraAfter: 6 })));
  const rh = Math.min(rhMax, 0.62 + tH + 0.2 + bH + 0.1);
  const y0 = centerY(top, rows * rh + gy * (rows - 1));
  items.forEach((it, i) => {
    const x = M + (i % cols) * (cw + gx), y = y0 + Math.floor(i / cols) * (rh + gy);
    shapes.push(hline(x, y, cw));
    shapes.push(text(x, y + 0.22, cw, 0.3, it.mark ?? String(i + 1).padStart(2, '0'), { size: 14, bold: true, color: C.faint, fit: false }));
    shapes.push(text(x, y + 0.62, cw, tH + 0.06, it.title, { size: tSize, fit: false, bold: true, color: C.ink }));
    shapes.push(text(x, y + 0.62 + tH + 0.2, cw, rh - 0.62 - tH - 0.2, bodies[i], { size: bSize, fit: false, color: C.body, after: 6 }));
  });
  shapes.push(pageNo(ctx));
  return { bg: C.paper, shapes };
};
L.cards = L.features;

L.steps = (s, ctx) => {
  const shapes = [];
  const top = heading(s, shapes);
  const steps = s.steps ?? [];
  const n = steps.length, gx = n > 4 ? 0.4 : 0.6;
  const cw = (CW - gx * (n - 1)) / n;
  const noteGap = 0.7;
  const numSize = n > 4 ? 52 : 64;
  const numH = (numSize * 1.36) / 72;
  const tSize = Math.min(...steps.map((st) => fitSize(st.title, { w: cw, h: 0.95 }, { size: 26, min: 16, bold: true })));
  const tH = Math.max(...steps.map((st) => measure(st.title, cw, tSize, { bold: true })));
  const noteSize = s.note ? fitSize(s.note, { w: CW * 0.85, h: 0.9 }, { size: 20, min: 14 }) : 0;
  const noteH = s.note ? measure(s.note, CW * 0.85, noteSize) : 0;
  const availBody = BOTTOM - top - numH - 0.25 - tH - 0.15 - (s.note ? noteGap + noteH : 0);
  const bSize = Math.min(...steps.map((st) => fitSize(st.body ?? '', { w: cw, h: availBody }, { size: 19, min: 12 })));
  const bH = Math.max(...steps.map((st) => measure(st.body ?? '', cw, bSize)));
  const blockH = numH + 0.25 + tH + 0.15 + bH;
  const y0 = centerY(top, blockH + (s.note ? noteGap + noteH : 0));
  steps.forEach((st, i) => {
    const x = M + i * (cw + gx);
    shapes.push(text(x, y0 - 0.12, cw, numH, String(i + 1), { size: numSize, bold: true, color: C.faint, fit: false }));
    shapes.push(hline(x, y0 + numH + 0.02, cw));
    shapes.push(text(x, y0 + numH + 0.25, cw, tH + 0.06, st.title, { size: tSize, fit: false, bold: true, color: C.ink }));
    if (st.body) shapes.push(text(x, y0 + numH + 0.25 + tH + 0.15, cw, bH + 0.08, st.body, { size: bSize, fit: false, color: C.body }));
  });
  if (s.note) shapes.push(text(M, y0 + blockH + noteGap, CW * 0.85, noteH + 0.08, s.note, { size: noteSize, fit: false, color: C.ink }));
  shapes.push(pageNo(ctx));
  return { bg: C.paper, shapes };
};

L.stats = (s, ctx) => {
  const shapes = [];
  const top = heading(s, shapes);
  const stats = s.stats ?? [];
  const n = stats.length, gx = 0.6;
  const cw = (CW - gx * (n - 1)) / n;
  const vSize = Math.min(...stats.map((st) => fitSize(st.value, { w: cw, h: 1.7 }, { size: 110, min: 44, bold: true })));
  const vH = (vSize * 1.36) / 72;
  const bSize = Math.min(...stats.map((st) => fitSize(st.body ?? '', { w: cw, h: 1.2 }, { size: 20, min: 13 })));
  const bH = Math.max(...stats.map((st) => measure(st.body ?? '', cw, bSize)));
  const blockH = 0.45 + vH + 0.15 + bH;
  const y = centerY(top, blockH, BOTTOM - (s.note ? 0.5 : 0));
  stats.forEach((st, i) => {
    const x = M + i * (cw + gx);
    shapes.push(text(x, y, cw, 0.34, st.label, { size: 16, bold: true, color: C.muted, fit: false }));
    shapes.push(text(x, y + 0.45, cw, vH, st.value, { size: vSize, fit: false, bold: true, color: C.ink }));
    if (st.body) shapes.push(text(x, y + 0.45 + vH + 0.15, cw, bH + 0.08, st.body, { size: bSize, fit: false, color: C.body }));
  });
  if (s.note) shapes.push(text(M, BOTTOM - 0.4, CW, 0.4, s.note, { size: 13, min: 10, color: C.muted, valign: 'bottom' }));
  shapes.push(pageNo(ctx));
  return { bg: C.paper, shapes };
};

L.compare = (s, ctx) => {
  const shapes = [];
  const top = heading(s, shapes);
  const cols = [s.left, s.right].filter(Boolean);
  const gx = 1.1;
  const cw = (CW - gx) / 2;
  const noteH = s.note ? 0.8 : 0;
  const tones = { bad: C.bad, good: C.good, neutral: C.muted };
  const hSize = Math.min(...cols.map((c) => fitSize(c.title, { w: cw, h: 1.1 }, { size: 38, min: 20, bold: true })));
  const hH = Math.max(...cols.map((c) => measure(c.title, cw, hSize, { bold: true })));
  const bTop = top + 0.45 + hH + 0.3;
  const bSize = Math.min(...cols.map((c) => fitSize(asParas(c.bullets, { after: 12 }), { w: cw, h: BOTTOM - noteH - bTop }, { size: 24, min: 13, paraAfter: 12 })));
  cols.forEach((col, i) => {
    const x = M + i * (cw + gx);
    const tone = tones[col.tone ?? 'neutral'];
    shapes.push({ t: 'ellipse', x, y: top + 0.09, w: 0.14, h: 0.14, fill: tone });
    shapes.push(text(x + 0.26, top, cw - 0.26, 0.32, col.tag ?? '', { size: 13, bold: true, color: tone, spacing: 1, fit: false }));
    shapes.push(text(x, top + 0.45, cw, hH + 0.06, col.title, { size: hSize, fit: false, bold: true, color: C.ink }));
    shapes.push(text(x, bTop, cw, BOTTOM - noteH - bTop, asParas(col.bullets, { after: 12 }), { size: bSize, fit: false, color: C.body, after: 12 }));
  });
  shapes.push(vline(M + cw + gx / 2, top, BOTTOM - noteH - top));
  if (s.note) shapes.push(text(M, BOTTOM - noteH + 0.25, CW, noteH - 0.25, s.note, { size: 18, min: 13, color: C.ink, valign: 'bottom' }));
  shapes.push(pageNo(ctx));
  return { bg: C.paper, shapes };
};

L.table = (s, ctx) => {
  const shapes = [];
  const top = heading(s, shapes);
  const rows = s.rows ?? [];
  const head = s.columns ?? [];
  const sum = (s.widths ?? head.map(() => 1)).reduce((a, b) => a + b, 0);
  const colW = (s.widths ?? head.map(() => 1)).map((k) => (k / sum) * CW);
  const noteH = s.note ? 0.6 : 0;
  const rowH = Math.min(0.82, (BOTTOM - top - noteH) / (rows.length + 1));
  let size = 18;
  rows.forEach((r) => r.forEach((cell, ci) => { size = Math.min(size, fitSize(cell, { w: colW[ci] - 0.25, h: rowH - 0.12 }, { size: 20, min: 11, bold: ci === 0 })); }));
  shapes.push({ t: 'table', x: M, y: top - 0.1, w: CW, colW, rowH, head, rows, size, firstColBold: s.firstColBold !== false });
  if (s.note) shapes.push(text(M, BOTTOM - 0.4, CW, 0.4, s.note, { size: 13, min: 10, color: C.muted, valign: 'bottom' }));
  shapes.push(pageNo(ctx));
  return { bg: C.paper, shapes };
};

// 퀴즈의 문제 하나 = 슬라이드 하나 (layoutDeck에서 펼침)
L.question = (s, ctx) => {
  const shapes = [];
  shapes.push(text(M, 1.45, CW, 0.34, s.eyebrow ?? '이해도 체크', { size: 15, bold: true, color: C.muted, fit: false }));
  const [q, qh] = flow(M, 1.95, 10.6, 3.0, s.q, { size: 48, min: 30, bold: true, color: C.ink });
  shapes.push(q);
  const ay = Math.max(4.6, 1.95 + qh + 0.6);
  shapes.push(hline(M, ay, 10.6));
  shapes.push(text(M, ay + 0.3, 1.2, 0.36, '정답', { size: 15, bold: true, color: C.faint, fit: false }));
  shapes.push({ ...text(M + 1.2, ay + 0.24, 9.4, BOTTOM - ay - 0.2, s.a, { size: 30, min: 18, color: C.ink }), reveal: true });
  shapes.push(pageNo(ctx));
  return { bg: C.paper, shapes, notes: [s.notes, `정답: ${s.a}`].filter(Boolean).join('\n\n') };
};

L.summary = (s, ctx) => {
  const shapes = [];
  shapes.push(text(M, 0.85, CW, 0.32, s.eyebrow ?? 'Key Takeaways', { size: 15, bold: true, color: C.onDarkMuted, fit: false }));
  const [t, th] = flow(M, 1.27, CW, 1.3, s.title ?? '핵심 정리', { size: 48, min: 32, bold: true, color: C.onDark });
  shapes.push(t);
  const items = s.points ?? [];
  const top = 1.27 + th + 0.75;
  const cols = items.length > 3 ? 2 : 1;
  const per = Math.ceil(items.length / cols);
  const gx = 0.8;
  const cw = cols === 2 ? (CW - gx) / 2 : CW * 0.7;
  const rh = Math.min(1.2, (BOTTOM - top) / per);
  const size = Math.min(...items.map((p) => fitSize(p, { w: cw, h: rh - 0.3 }, { size: 25, min: 14 })));
  items.forEach((p, i) => {
    const x = M + Math.floor(i / per) * (cw + gx), y = top + (i % per) * rh;
    shapes.push(hline(x, y, cw, C.darkLine));
    shapes.push(text(x, y + 0.2, cw, rh - 0.25, p, { size, fit: false, color: C.onDark }));
  });
  shapes.push(pageNo(ctx, true));
  return { bg: C.dark, shapes };
};

export const LAYOUTS = Object.keys(L);

// 덱 전체를 도형 목록으로 변환. quiz는 문제별 슬라이드로 펼친다.
export function expandSlides(deck) {
  const out = [];
  for (const s of deck.slides) {
    if (s.layout === 'quiz') {
      const qs = s.questions ?? [];
      qs.forEach((q, i) => out.push({ layout: 'question', eyebrow: `${s.title ?? '이해도 체크'}  ${i + 1} / ${qs.length}`, q: q.q, a: q.a, notes: s.notes }));
    } else out.push(s);
  }
  return out;
}

export function layoutDeck(deck) {
  const slides = expandSlides(deck);
  const total = slides.length;
  return slides.map((s, index) => {
    const fn = L[s.layout] ?? L.points;
    const out = fn(s, { deck, index, total });
    return { ...out, notes: out.notes ?? s.notes ?? '', layout: s.layout, title: s.title ?? s.text ?? s.q ?? '' };
  });
}
