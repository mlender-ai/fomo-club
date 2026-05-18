import { describe, it, expect, vi, beforeEach } from "vitest";
import { drawCards, DRAW_COST } from "../draw.js";

describe("drawCards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("single 스프레드 — 카드 1장 반환", () => {
    const cards = drawCards("single", "neutral");
    expect(cards).toHaveLength(1);
  });

  it("three-card 스프레드 — 카드 3장 반환", () => {
    const cards = drawCards("three-card", "neutral");
    expect(cards).toHaveLength(3);
  });

  it("three-card — past/present/future 슬롯 부여", () => {
    const cards = drawCards("three-card", "neutral");
    expect(cards[0]?.slot).toBe("past");
    expect(cards[1]?.slot).toBe("present");
    expect(cards[2]?.slot).toBe("future");
  });

  it("single — 슬롯 없음 (undefined)", () => {
    const cards = drawCards("single", "neutral");
    expect(cards[0]?.slot).toBeUndefined();
  });

  it("뽑힌 카드는 중복 없음 (three-card)", () => {
    const cards = drawCards("three-card", "neutral");
    const ids = cards.map((c) => c.card.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(3);
  });

  it("orientation은 upright 또는 reversed", () => {
    for (let i = 0; i < 10; i++) {
      const [card] = drawCards("single", "neutral");
      expect(["upright", "reversed"]).toContain(card?.orientation);
    }
  });

  it("bearish — reversed 비율이 bullish보다 높음 (통계적 검증)", () => {
    vi.spyOn(Math, "random");

    let bearishReversed = 0;
    let bullishReversed = 0;
    const N = 200;

    vi.mocked(Math.random).mockRestore();
    for (let i = 0; i < N; i++) {
      const [c] = drawCards("single", "bearish");
      if (c?.orientation === "reversed") bearishReversed++;
    }
    for (let i = 0; i < N; i++) {
      const [c] = drawCards("single", "bullish");
      if (c?.orientation === "reversed") bullishReversed++;
    }

    expect(bearishReversed).toBeGreaterThan(bullishReversed);
  });
});

describe("DRAW_COST", () => {
  it("single 비용은 1", () => {
    expect(DRAW_COST.single).toBe(1);
  });

  it("three-card 비용은 3", () => {
    expect(DRAW_COST["three-card"]).toBe(3);
  });
});
