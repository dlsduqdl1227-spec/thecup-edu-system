// Printed materials use the very same slide geometry as the viewer and PPTX.
// No deck content, presenter notes, or protected assets live in public files.
export function printRequest(params) {
  const course = params.get('course') ?? '';
  const level = params.get('level') ?? '';
  const language = params.get('lang') ?? 'ko';
  const start = params.get('slide') ?? '1';
  if (!/^[a-z0-9-]{1,40}$/.test(course) || !/^[A-Za-z]{1,20}$/.test(level) || !['ko', 'en'].includes(language) || !/^[1-9]\d{0,3}$/.test(start)) {
    throw new Error('출력할 과목과 레벨을 교육자료에서 다시 선택해 주세요. / Please reopen printing from your course material.');
  }
  return { course, level, language, start: Number(start) };
}

export function printHref(course, level, language, index = 0) {
  const query = new URLSearchParams({ course, level, lang: language, slide: String(index + 1) });
  printRequest(query);
  return `/education/print?${query}`;
}

export function printRange(value, total) {
  const indices = new Set();
  const text = value.trim();
  if (!Number.isInteger(total) || total < 1 || !/^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/.test(text)) throw new Error('페이지를 1-5, 8 형식으로 입력해 주세요. / Use a range such as 1-5, 8.');
  for (const token of text.split(',')) {
    const [first, last = first] = token.trim().split(/\s*-\s*/).map(Number);
    if (first < 1 || last < first || last > total) throw new Error(`1-${total} 사이의 페이지를 선택해 주세요. / Select pages between 1 and ${total}.`);
    for (let number = first; number <= last; number++) indices.add(number - 1);
  }
  return [...indices].sort((a, b) => a - b);
}

export function printableSlides(laid, includeAnswers = false) {
  return laid.map(slide => ({ bg: slide.bg, title: slide.title, layout: slide.layout,
    shapes: slide.shapes.filter(shape => includeAnswers || !shape.reveal).map(shape => {
      if (shape.t !== 'image') return { ...shape };
      if (!shape.data?.startsWith('data:image/png;base64,')) throw new Error('필수 이미지가 준비되지 않았습니다. 다시 불러와 주세요. / A required image is not ready. Please reload.');
      return { ...shape, src: shape.data };
    }),
  }));
}

export function printSheets(items, perSheet) {
  if (perSheet !== 1 && perSheet !== 2) throw new Error('Invalid print layout');
  return Array.from({ length: Math.ceil(items.length / perSheet) }, (_, index) => items.slice(index * perSheet, (index + 1) * perSheet));
}

export function printFileTitle(deck) {
  const safe = value => String(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim();
  return `THECUP_SCA_${safe(deck.course)}_${safe(deck.level)}${deck.language === 'en' ? '_EN' : ''}`;
}

// A loaded preview can include off-screen sheets. Load glyph subsets and decode
// every image before enabling native printing, including on mobile Safari.
export async function waitForPrintResources(element) {
  let timeout;
  try {
    await Promise.race([(async () => {
      const fonts = element.ownerDocument.fonts;
      if (fonts) {
        const text = element.textContent ?? '';
        await Promise.all([fonts.load('400 16px "Pretendard Variable"', text), fonts.load('700 16px "Pretendard Variable"', text)]);
        await fonts.ready;
      }
      await Promise.all([...element.querySelectorAll('img')].map(async image => {
        await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) throw new Error('이미지를 확인하지 못했습니다. / An image could not be decoded.');
      }));
    })(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('글꼴 또는 이미지 준비가 지연되고 있습니다. 다시 불러와 주세요. / Fonts or images are taking too long. Please reload.')), 20000); })]);
  } finally { clearTimeout(timeout); }
}
