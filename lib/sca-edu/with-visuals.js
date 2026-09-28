// Keep authored source slides intact and insert teaching charts beside their topic.
export function withVisuals(decks, additions) {
  const output = { ...decks };
  for (const addition of additions) {
    const deck = output[addition.deckKey];
    if (!deck) throw new Error(`Unknown visual deck: ${addition.deckKey}`);
    const index = deck.slides.findIndex(s => (s.title ?? s.text) === addition.after);
    if (index < 0) throw new Error(`Missing visual anchor: ${addition.after}`);
    output[addition.deckKey] = { ...deck, version: `${decks[addition.deckKey].version ?? '1'}.charts1`,
      slides: [...deck.slides.slice(0,index+1), addition.slide, ...deck.slides.slice(index+1)] };
  }
  return output;
}
