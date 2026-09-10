import { describe, expect, it } from "vitest";

import { buildDeckContentCardsFromSources, expandDeckContentCardsForScope } from "../../lib/deck-content";

describe("deck content cards", () => {
  it("builds factual world index and whale cards without domestic leakage", () => {
    const cards = buildDeckContentCardsFromSources({
      macroQuotes: [
        { key: "kospi", label: "코스피", change: 0.4, close: 2900 },
        { key: "spx", label: "S&P500", change: 0.8, close: 6400 },
        { key: "ndq", label: "나스닥", change: 1.2, close: 22000 },
        { key: "sox", label: "필라델피아 반도체", change: 2.1, close: 5800 },
      ],
      whaleInput: {
        marketCapChange24h: -1.5,
        coins: [
          { name: "Bitcoin", symbol: "btc", change24h: -2.4, athChange: -8 },
          { name: "Ethereum", symbol: "eth", change24h: 1.1, athChange: -12 },
        ],
      },
    });

    const expanded = expandDeckContentCardsForScope(cards, "world", 8);

    expect(expanded.some((card) => card.id === "content:index:world")).toBe(true);
    expect(expanded.some((card) => card.id === "content:whale:global")).toBe(true);
    expect(expanded.some((card) => card.headline.includes("나스닥 +1.20%"))).toBe(true);
    expect(expanded.some((card) => card.headline.includes("S&P500 +0.80%"))).toBe(true);
    expect(expanded.some((card) => card.headline.includes("코스피"))).toBe(false);
    expect(expanded.every((card) => card.kind === "content" && card.facts.length > 0)).toBe(true);
  });
});
