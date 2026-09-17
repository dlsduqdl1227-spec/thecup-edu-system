// viewer.js(프레임워크 무관 DOM 모듈)의 타입 선언. TypeScript는 이 파일을, 번들러는 viewer.js를 사용한다.
import type { Deck, EduViewer, PublicCatalog } from "./catalog";

export type PptxLib = { PptxGenJS: unknown; JSZip: unknown };

export type MountOptions = {
  user: EduViewer;
  catalog: PublicCatalog;
  loadDeck: (courseId: string, level: string) => Promise<Deck>;
  loadPptxLib?: () => Promise<PptxLib>;
};

export type ScaEducationHandle = {
  open: (courseId: string, level: string) => Promise<void>;
  destroy: () => void;
};

export function mountScaEducation(root: HTMLElement, options: MountOptions): ScaEducationHandle;
