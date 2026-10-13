import type { Deck, EducationLanguage } from './catalog';
export function localizeDeck(deck: Deck, language: EducationLanguage, translations: Record<string, string>): Deck;
export function canReadEducationAsset(deck: Deck | null, asset: string): boolean;
