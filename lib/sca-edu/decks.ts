// 서버 전용: 교육자료 JSON을 Worker 코드에 함께 번들한다 (R2/KV 없이 추가 비용 0원).
// 새 덱을 추가하면 1) decks/<course>/<level>.json 파일 2) catalog.json 항목 3) 아래 DECKS 등록.
// 이 파일은 API 라우트에서만 import 한다. 클라이언트 컴포넌트에서 import 하면 덱이 공개 번들에 포함된다.
import catalogJson from "./decks/catalog.json";
import baristaFoundation from "./decks/barista-skills/foundation.json";
import baristaIntermediate from "./decks/barista-skills/intermediate.json";
import baristaProfessional from "./decks/barista-skills/professional.json";
import { deckKey, type Catalog, type Deck, type DeckMap } from "./catalog";

export const EDU_CATALOG = catalogJson as Catalog;

export const EDU_DECKS: DeckMap = {
  [deckKey("barista-skills", "Foundation")]: baristaFoundation as Deck,
  [deckKey("barista-skills", "Intermediate")]: baristaIntermediate as Deck,
  [deckKey("barista-skills", "Professional")]: baristaProfessional as Deck,
};
