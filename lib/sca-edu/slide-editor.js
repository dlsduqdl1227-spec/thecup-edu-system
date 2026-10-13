// Restored from the deployed 2026-09-30 education editor; behavior and IDs preserved.
const CONTENT = new Set([
  "title",
  "subtitle",
  "eyebrow",
  "level",
  "footer",
  "lead",
  "number",
  "text",
  "sub",
  "points",
  "bullets",
  "objectives",
  "items",
  "cards",
  "steps",
  "stats",
  "left",
  "right",
  "callout",
  "columns",
  "rows",
  "note",
  "notes",
  "q",
  "a",
  "explanation",
  "alt",
  "caption",
  "chart"
]);
const LOCKED = new Set([
  "layout",
  "slideId",
  "courseId",
  "asset",
  "aspect",
  "tone",
  "kind",
  "color",
  "colors",
  "width",
  "size",
  "dark",
  "firstColBold"
]);
const LABELS = {
  title: "제목",
  subtitle: "부제",
  eyebrow: "머리말",
  level: "레벨 표시",
  footer: "하단 문구",
  lead: "도입 설명",
  number: "단원 번호",
  text: "본문",
  sub: "보충 설명",
  points: "핵심 문장",
  bullets: "본문 항목",
  objectives: "학습 목표",
  items: "내용",
  cards: "내용",
  steps: "단계",
  stats: "수치 설명",
  left: "왼쪽 내용",
  right: "오른쪽 내용",
  callout: "핵심 강조",
  columns: "표 머리글",
  rows: "표 본문",
  note: "페이지 참고",
  notes: "발표자 노트",
  q: "질문",
  a: "정답",
  explanation: "해설",
  alt: "이미지 설명",
  caption: "이미지 출처 설명",
  chart: "차트",
  labels: "항목 이름",
  categories: "항목 이름",
  series: "데이터",
  name: "이름",
  values: "값",
  xLabel: "가로축 제목",
  yLabel: "세로축 제목",
  xValues: "가로축 값",
  xTitle: "가로축 제목",
  yTitle: "세로축 제목",
  min: "최솟값",
  max: "최댓값",
  step: "눈금 간격",
  xMin: "가로축 최솟값",
  xMax: "가로축 최댓값",
  xStep: "가로축 눈금 간격",
  body: "설명",
  desc: "설명",
  tag: "소제목",
  label: "항목 제목",
  value: "표시 값",
  mark: "표시 문구"
};
export function editableSlideFields(slide) {
  const fields = [];
  function visit(value, path, labels) {
    if (typeof value === "string" || typeof value === "number") fields.push({
      path,
      label: labels.join(" · "),
      type: typeof value,
      value
    });
    else if (Array.isArray(value)) value.forEach((item, i) => visit(item, [...path, i], [...labels, String(i + 1)]));
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) if (!LOCKED.has(key)) visit(item, [...path, key], [...labels, LABELS[key] ?? key]);
    }
  }
  for (const [key, value] of Object.entries(slide)) if (CONTENT.has(key)) visit(value, [key], [LABELS[key]]);
  return fields;
}
export function updateSlideField(slide, path, value) {
  let target = slide;
  for (const key of path.slice(0, -1)) target = target[key];
  target[path.at(-1)] = value;
}
export function validateSlideEdit(original, candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("페이지 내용이 올바르지 않습니다.");
  const fields = editableSlideFields(original);
  const copy = structuredClone(original);
  for (const field of fields) {
    let value = candidate;
    for (const key of field.path) value = value?.[key];
    if (typeof value !== field.type || field.type === "number" && !Number.isFinite(value)) throw new Error(`${field.label} 형식이 올바르지 않습니다.`);
    if (typeof value === "string" && field.path.length === 1 && [
      "title",
      "q",
      "a",
      "text"
    ].includes(field.path[0]) && !value.trim()) throw new Error(`${field.label}을 입력해 주세요.`);
    if (typeof value === "string" && value.length > (field.path[0] === "notes" ? 12e3 : 4e3)) throw new Error(`${field.label} 내용이 너무 깁니다.`);
    updateSlideField(copy, field.path, value);
  }
  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
  }
  if (!equal(copy, candidate)) throw new Error("페이지 구성과 원본 이미지 연결은 변경할 수 없습니다.");
  if (new TextEncoder().encode(JSON.stringify(copy)).length > 64e3) throw new Error("페이지 내용이 너무 큽니다.");
  return copy;
}
export function prepareEditableDeck(deck) {
  return {
    ...deck,
    slides: deck.slides.flatMap((slide, i) => {
      const slideId = slide.slideId ?? `source-${i + 1}`;
      if (slide.layout === "quiz") return (slide.questions ?? []).map((question, j) => ({
        layout: "question",
        slideId: `${slideId}-question-${j + 1}`,
        eyebrow: `${slide.title ?? "이해도 체크"}  ${j + 1} / ${slide.questions.length}`,
        q: question.q,
        a: question.a,
        notes: slide.notes ?? ""
      }));
      return {
        ...slide,
        slideId,
        notes: slide.notes ?? ""
      };
    })
  };
}
