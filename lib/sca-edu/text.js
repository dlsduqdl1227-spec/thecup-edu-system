// 텍스트 마크업 파싱 + 줄바꿈 추정 + 자동 축소. 웹/PPTX 양쪽에서 같은 결과를 쓰기 위해 순수 함수로 유지.

// "**굵게**" 인라인 마크업을 run 배열로 변환
export function parseRuns(str) {
  const out = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m;
  const s = String(str ?? '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ text: m[1], bold: true });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out.length ? out : [{ text: '' }];
}
export const plain = (s) => String(s ?? '').replace(/\*\*(.+?)\*\*/g, '$1');

function charEm(ch) {
  const c = ch.codePointAt(0);
  if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x1100 && c <= 0x11ff) || (c >= 0x3130 && c <= 0x318f) ||
      (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xff60)) return 0.96;
  if (ch === ' ') return 0.28;
  if ('·•→←↑↓×÷±≈≤≥°℃'.includes(ch)) return 0.9;
  if (/[MWmw@%]/.test(ch)) return 0.9;
  if (/[A-Z0-9]/.test(ch)) return 0.66;
  if (/[il.,:;'!|()\[\]]/.test(ch)) return 0.32;
  return 0.56;
}
const strEm = (s, bold) => { let e = 0; for (const ch of s) e += charEm(ch); return bold ? e * 1.04 : e; };

// 단어 단위(한글 keep-all) 탐욕 줄바꿈으로 줄 수 추정
export function countLines(str, widthIn, sizePt, bold = false) {
  const maxEm = (widthIn * 72) / sizePt;
  let lines = 0;
  for (const hard of plain(str).split('\n')) {
    const words = hard.split(' ');
    let cur = 0; lines++;
    for (const w of words) {
      const we = strEm(w, bold);
      const add = cur === 0 ? we : cur + charEm(' ') + we;
      if (add <= maxEm) cur = add;
      else if (cur === 0) { lines += Math.ceil(we / maxEm) - 1; cur = we % maxEm; }
      else { lines++; cur = we > maxEm ? (lines += Math.ceil(we / maxEm) - 1, we % maxEm) : we; }
    }
  }
  return lines;
}

export const LINE_H = 1.32;     // 웹 line-height 와 PPTX 단일 줄간격(맑은 고딕) 근사
const EST_LINE_H = 1.4;         // 추정 시 여유분 포함

const norm = (content) => (Array.isArray(content) ? content : [content]).map((p) => (typeof p === 'string' ? { text: p } : p));

// 주어진 폭·글자 크기에서 문단 묶음의 예상 높이(인치)
export function measure(content, w, size, { paraAfter = 0, bulletIndent = 0.3, bold = false } = {}) {
  const paras = norm(content);
  let hIn = 0;
  paras.forEach((p, i) => {
    const wIn = w - (p.bullet ? bulletIndent : 0) - 0.04;
    hIn += (countLines(p.text, wIn, size, p.bold ?? bold) * size * EST_LINE_H) / 72;
    if (i < paras.length - 1) hIn += (p.after ?? paraAfter) / 72;
  });
  return hIn;
}

// 박스 높이 안에 들어가는 최대 글자 크기
export function fitSize(content, box, { size, min = Math.max(10, size * 0.6), paraAfter = 0, bulletIndent = 0.3, bold = false } = {}) {
  for (let s = size; s >= min; s -= 1) {
    if (measure(content, box.w, s, { paraAfter, bulletIndent, bold }) <= box.h) return s;
  }
  return min;
}
