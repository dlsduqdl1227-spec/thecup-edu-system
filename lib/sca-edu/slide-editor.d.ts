import type { Deck } from './catalog';
export type Slide = Deck['slides'][number];
export type EditField = { path: Array<string | number>; label: string; type: 'string' | 'number'; value: string | number };
export function editableSlideFields(slide: Slide): EditField[];
export function updateSlideField(slide: Slide, path: Array<string | number>, value: string | number): void;
export function validateSlideEdit(original: Slide, candidate: unknown): Slide;
export function prepareEditableDeck(deck: Deck): Deck;
