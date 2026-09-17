// SCA 교육자료 접근 규칙 (순수 함수). DB·세션에 의존하지 않아 테스트에서 바로 불러올 수 있다.
// 덱 JSON은 lib/sca-edu/decks.ts에서 서버 코드로 번들한다. public 폴더에 두지 않는다.

export type EduRole = "admin" | "student";
export type DeckStatus = "planned" | "draft" | "review" | "ready";

export type EduViewer = { name: string; role: EduRole };

export type CatalogLevel = { level: string; deck: string | null; status: DeckStatus };
export type Catalog = {
  program: string;
  courses: Array<{ id: string; name: string; ko: string; levels: CatalogLevel[] }>;
};

export type PublicCatalog = {
  program: string;
  courses: Array<{
    id: string;
    name: string;
    ko: string;
    levels: Array<{ level: string; deck: boolean; status: DeckStatus }>;
  }>;
};

export type Deck = {
  id: string;
  course: string;
  level: string;
  status: DeckStatus;
  version?: string;
  updated?: string;
  sources?: string[];
  sourceNote?: string;
  slides: Array<Record<string, unknown> & { layout: string; notes?: string }>;
};

export type DeckMap = Record<string, Deck>;

const STUDENT_VISIBLE: ReadonlySet<DeckStatus> = new Set<DeckStatus>(["ready"]);
const COURSE_ID = /^[a-z0-9-]{1,40}$/;
const LEVEL = /^[A-Za-z]{1,20}$/;

export const deckKey = (courseId: string, level: string) => `${courseId}/${level}`;

/** 운영자 세션(관리자만)과 승인 수강생 세션 중 교육 탭을 볼 수 있는 사람을 고른다. 관리자가 우선이다. */
export function resolveEduViewer(
  staff: { name: string; role: string } | null,
  member: { name: string } | null,
): EduViewer | null {
  if (staff?.role === "admin") return { name: staff.name, role: "admin" };
  if (member) return { name: member.name, role: "student" };
  return null;
}

export function visibleCatalog(catalog: Catalog, decks: DeckMap, role: EduRole): PublicCatalog {
  return {
    program: catalog.program,
    courses: catalog.courses.map((course) => ({
      id: course.id,
      name: course.name,
      ko: course.ko,
      levels: course.levels.map((entry) => {
        const exists = Boolean(decks[deckKey(course.id, entry.level)]);
        if (role === "admin") return { level: entry.level, deck: exists, status: entry.status };
        const open = exists && STUDENT_VISIBLE.has(entry.status);
        return { level: entry.level, deck: open, status: open ? "ready" : "planned" };
      }),
    })),
  };
}

/** 수강생에게는 발표자 노트와 출처 메모를 보내지 않는다. */
export function studentDeck(deck: Deck): Deck {
  return {
    id: deck.id,
    course: deck.course,
    level: deck.level,
    status: deck.status,
    version: deck.version,
    updated: deck.updated,
    slides: deck.slides.map((slide) => {
      const copy: Record<string, unknown> & { layout: string } = { ...slide };
      delete copy.notes;
      return copy;
    }),
  };
}

/** 역할에 맞는 덱을 돌려준다. 볼 수 없거나 없는 덱은 null (호출부에서 404). */
export function deckForViewer(
  catalog: Catalog,
  decks: DeckMap,
  role: EduRole,
  courseId: string,
  level: string,
): Deck | null {
  if (!COURSE_ID.test(courseId) || !LEVEL.test(level)) return null;
  const entry = catalog.courses.find((course) => course.id === courseId)?.levels.find((item) => item.level === level);
  const deck = decks[deckKey(courseId, level)];
  if (!entry || !deck) return null;
  if (role === "admin") return deck;
  return STUDENT_VISIBLE.has(entry.status) ? studentDeck(deck) : null;
}
