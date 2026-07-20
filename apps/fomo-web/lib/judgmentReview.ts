import type { DeckCard } from "./discoveryDeck";

export function prioritizeStrongSignalCards(
  cards: readonly DeckCard[],
  fronts: Readonly<Record<string, { signalTypes?: readonly string[] }>>,
  strongSignalCodes: readonly string[]
): DeckCard[] {
  if (strongSignalCodes.length === 0) return [...cards];
  const strong = new Set(strongSignalCodes);
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const score = (entry: { card: DeckCard }) => entry.card.type === "stock"
        ? Number(fronts[entry.card.data.canonical]?.signalTypes?.some((code) => strong.has(code)) ?? false)
        : 0;
      return score(b) - score(a) || a.index - b.index;
    })
    .map(({ card }) => card);
}
