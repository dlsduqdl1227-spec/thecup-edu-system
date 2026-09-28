// 서버 전용: 교육자료 JSON을 Worker 코드에 함께 번들한다 (R2/KV 없이 추가 비용 0원).
// 새 덱을 추가하면 1) decks/<course>/<level>.json 파일 2) catalog.json 항목 3) 아래 DECKS 등록.
// 이 파일은 API 라우트에서만 import 한다. 클라이언트 컴포넌트에서 import 하면 덱이 공개 번들에 포함된다.
import catalogJson from "./decks/catalog.json";
import introductionIntroduction from "./decks/introduction/introduction.json";
import baristaSkillsFoundation from "./decks/barista-skills/foundation.json";
import baristaSkillsIntermediate from "./decks/barista-skills/intermediate.json";
import baristaSkillsProfessional from "./decks/barista-skills/professional.json";
import brewingFoundation from "./decks/brewing/foundation.json";
import brewingIntermediate from "./decks/brewing/intermediate.json";
import brewingProfessional from "./decks/brewing/professional.json";
import greenCoffeeFoundation from "./decks/green-coffee/foundation.json";
import greenCoffeeIntermediate from "./decks/green-coffee/intermediate.json";
import greenCoffeeProfessional from "./decks/green-coffee/professional.json";
import roastingFoundation from "./decks/roasting/foundation.json";
import roastingIntermediate from "./decks/roasting/intermediate.json";
import roastingProfessional from "./decks/roasting/professional.json";
import sensorySkillsFoundation from "./decks/sensory-skills/foundation.json";
import sensorySkillsIntermediate from "./decks/sensory-skills/intermediate.json";
import sensorySkillsProfessional from "./decks/sensory-skills/professional.json";
import { deckKey, type Catalog, type Deck, type DeckMap } from "./catalog";

export const EDU_CATALOG = catalogJson as Catalog;

export const EDU_DECKS: DeckMap = {
  [deckKey("introduction", "Introduction")]: introductionIntroduction as Deck,
  [deckKey("barista-skills", "Foundation")]: baristaSkillsFoundation as Deck,
  [deckKey("barista-skills", "Intermediate")]: baristaSkillsIntermediate as Deck,
  [deckKey("barista-skills", "Professional")]: baristaSkillsProfessional as Deck,
  [deckKey("brewing", "Foundation")]: brewingFoundation as Deck,
  [deckKey("brewing", "Intermediate")]: brewingIntermediate as Deck,
  [deckKey("brewing", "Professional")]: brewingProfessional as Deck,
  [deckKey("green-coffee", "Foundation")]: greenCoffeeFoundation as Deck,
  [deckKey("green-coffee", "Intermediate")]: greenCoffeeIntermediate as Deck,
  [deckKey("green-coffee", "Professional")]: greenCoffeeProfessional as Deck,
  [deckKey("roasting", "Foundation")]: roastingFoundation as Deck,
  [deckKey("roasting", "Intermediate")]: roastingIntermediate as Deck,
  [deckKey("roasting", "Professional")]: roastingProfessional as Deck,
  [deckKey("sensory-skills", "Foundation")]: sensorySkillsFoundation as Deck,
  [deckKey("sensory-skills", "Intermediate")]: sensorySkillsIntermediate as Deck,
  [deckKey("sensory-skills", "Professional")]: sensorySkillsProfessional as Deck,
};
