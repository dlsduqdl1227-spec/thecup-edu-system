// Run only on an already-authorized deck. Locale data must stay server-side.
// Exact source-text keys make newly added/changed Korean content fail closed until translated.
export function localizeDeck(deck, language, translations) {
  if (language === 'ko') return { ...deck, language: 'ko' };
  if (language !== 'en') throw new Error('Unsupported education language');
  function visit(value) {
    if (typeof value === 'string' && /[가-힣]/u.test(value)) {
      if (!Object.hasOwn(translations, value) || !translations[value]?.trim()) throw new Error('English translation is incomplete');
      return translations[value];
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry)]));
    return value;
  }
  // Edit metadata and prior source revisions are Korean-only administrator state.
  const content = { ...deck }; delete content.editing;
  const translated = visit(content);
  translated.language = 'en';
  translated.slides = translated.slides.map(slide => slide.layout === 'image' && slide.asset === 'flavor-wheel-ko'
    ? { ...slide, asset: 'flavor-wheel-en', aspect: 1391 / 1800,
      alt: "SCA and WCR Coffee Taster's Flavor Wheel, original English version",
      caption: '© 2016 SCA and WCR · Original English V.2',
      ...(slide.notes ? { notes: "Original English Flavor Wheel from the user-owned SCA Barista Skills Pack. Full page with original colors, text and copyright credits preserved." } : {}) }
    : slide);
  return translated;
}

export function canReadEducationAsset(deck, asset) {
  return !!deck?.slides.some(slide => slide.layout === 'image' &&
    (slide.asset === asset || (slide.asset === 'flavor-wheel-ko' && asset === 'flavor-wheel-en')));
}
