// 도형 목록 → PPTX. PptxGenJS 생성자를 인자로 받아 브라우저(번들)와 Node(스크립트) 양쪽에서 동작한다.
import { THEME } from './theme.js';
import { parseRuns, plain } from './text.js';

function textRuns(sh) {
  const out = [];
  sh.paras.forEach((p, pi) => {
    const runs = parseRuns(p.text);
    runs.forEach((r, ri) => {
      const o = {
        bold: !!(r.bold || p.bold || sh.bold),
        color: p.color ?? sh.color,
        fontSize: p.size ?? sh.size,
        align: sh.align, // 모든 run에 동일 정렬 — 정렬 값이 바뀌면 pptxgenjs가 새 문단을 시작함
      };
      if (ri === 0) {
        if (p.bullet) o.bullet = { indent: Math.round(sh.indent * 72) };
        o.paraSpaceAfter = pi < sh.paras.length - 1 ? (p.after ?? sh.after) : 0;
      }
      if (ri === runs.length - 1 && pi < sh.paras.length - 1) o.breakLine = true;
      out.push({ text: r.text, options: o });
    });
  });
  return out;
}

export function buildPptx(PptxGenJS, deck, laidSlides) {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = '더컵에듀 교육센터';
  pres.company = 'THE CUP EDU';
  pres.title = `${deck.course} ${deck.level}`;
  pres.theme = { headFontFace: THEME.pptxFont, bodyFontFace: THEME.pptxFont };
  const font = THEME.pptxFont;

  // 웹에서 '정답 보기'로 공개하는 요소가 있으면 PPTX는 [문제] → [정답 공개] 두 장으로 만든다(키노트의 빌드 효과 대체)
  const pages = laidSlides.flatMap((sl) => (sl.shapes.some((x) => x.reveal) ? [{ ...sl, _hideReveal: true }, sl] : [sl]));
  for (const sl of pages) {
    const slide = pres.addSlide();
    slide.background = { color: sl.bg };
    for (const sh of sl.shapes) {
      if (sh.reveal && sl._hideReveal) continue;
      if (sh.t === 'rect') {
        slide.addShape(sh.radius ? pres.ShapeType.roundRect : pres.ShapeType.rect, {
          x: sh.x, y: sh.y, w: sh.w, h: sh.h, fill: { color: sh.fill }, line: { type: 'none' },
          ...(sh.radius ? { rectRadius: sh.radius } : {}),
        });
      } else if (sh.t === 'ellipse') {
        slide.addShape(pres.ShapeType.ellipse, {
          x: sh.x, y: sh.y, w: sh.w, h: sh.h,
          fill: sh.fill ? { color: sh.fill } : { type: 'none' },
          line: sh.line ? { color: sh.line, width: sh.lineW } : { type: 'none' },
        });
      } else if (sh.t === 'line') {
        slide.addShape(pres.ShapeType.line, { x: sh.x1, y: sh.y1, w: sh.x2 - sh.x1, h: Math.max(0, sh.y2 - sh.y1), line: { color: sh.color, width: sh.width } });
      } else if (sh.t === 'text') {
        slide.addText(textRuns(sh), {
          x: sh.x, y: sh.y, w: sh.w, h: sh.h, margin: 0, isTextBox: true, fontFace: font,
          fontSize: sh.size, color: sh.color, bold: sh.bold, align: sh.align, valign: sh.valign,
          lineSpacingMultiple: 1.0, ...(sh.spacing ? { charSpacing: sh.spacing } : {}),
        });
      } else if (sh.t === 'table') {
        const C = THEME.c;
        const none = { type: 'none' };
        const headBorder = [none, none, { type: 'solid', pt: 1.5, color: C.ink }, none];
        const rowBorder = [none, none, { type: 'solid', pt: 0.75, color: C.line }, none];
        const head = sh.head.map((c) => ({ text: plain(c), options: { bold: true, color: C.muted, fontSize: Math.min(sh.size, 14), border: headBorder } }));
        const rows = sh.rows.map((r) => r.map((c, ci) => {
          const k = ci === 0 && sh.firstColBold;
          return { text: plain(c), options: { bold: k, color: k ? C.ink : C.body, border: rowBorder } };
        }));
        slide.addTable([head, ...rows], {
          x: sh.x, y: sh.y, w: sh.w, colW: sh.colW, rowH: sh.rowH, fontFace: font, fontSize: sh.size,
          valign: 'middle', margin: [0, 0.12, 0, 0.12],
        });
      }
    }
    if (sl.notes) slide.addNotes(sl.notes);
  }
  return pres;
}

// pptxgenjs 4.x는 여러 run으로 된 문단(인라인 굵게 등)에 <a:pPr>를 run마다 반복해서 쓴다.
// 스키마상 문단당 하나만 허용되므로 첫 번째만 남기고 제거한다.
export function dedupeParagraphProps(xml) {
  return xml.replace(/<a:p>([\s\S]*?)<\/a:p>/g, (whole, inner) => {
    let seen = false;
    const fixed = inner.replace(/<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/g, (m) => (seen ? '' : ((seen = true), m)));
    return `<a:p>${fixed}</a:p>`;
  });
}

// 최종 파일 생성: outputType 'blob'(브라우저) 또는 'nodebuffer'(Node)
export async function exportPptx({ PptxGenJS, JSZip, deck, laid, outputType = 'blob' }) {
  const pres = buildPptx(PptxGenJS, deck, laid);
  const buf = await pres.write({ outputType: 'arraybuffer' });
  const zip = await JSZip.loadAsync(buf);
  const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/(slides|notesSlides)\/[^/]+\.xml$/.test(f));
  for (const f of slideFiles) zip.file(f, dedupeParagraphProps(await zip.file(f).async('string')));
  return zip.generateAsync({
    type: outputType, compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

export const pptxFileName = (deck) => `THECUP_SCA_${deck.course.replace(/\s+/g, '')}_${deck.level}_v${deck.version ?? '1'}.pptx`;
