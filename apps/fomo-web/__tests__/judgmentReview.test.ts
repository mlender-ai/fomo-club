import { describe, expect, it } from "vitest";
import { prioritizeStrongSignalCards } from "../lib/judgmentReview";
import type { FrontEntry } from "../components/StockSwipeDeck";
import type { DeckCard, DeckStock } from "../lib/discoveryDeck";

function card(canonical: string): DeckCard {
  return {
    type: "stock",
    data: {
      canonical,
      market: "NASDAQ",
      country: "US",
      sector: "AI",
      marquee: false,
      symbol: canonical,
    } satisfies DeckStock,
  };
}

function front(signalTypes: NonNullable<FrontEntry["signalTypes"]>): FrontEntry {
  return { signals: {}, fomo: {} as never, sparkline: [], signalTypes };
}

describe("judgment review taste seed", () => {
  it("원장에서 검증된 강한 신호 카드만 안정적으로 앞쪽에 배치한다", () => {
    const cards = [card("A"), card("B"), card("C"), card("D")];
    const fronts = {
      A: front(["impulse"]),
      B: front(["material_contract"]),
      C: front(["material_contract"]),
      D: front(["foreign_streak"]),
    };
    const ranked = prioritizeStrongSignalCards(cards, fronts, ["material_contract"]);
    expect(ranked.map((item) => item.type === "stock" ? item.data.canonical : "")).toEqual(["B", "C", "A", "D"]);
    expect(prioritizeStrongSignalCards(cards, fronts, [])).toEqual(cards);
  });
});
