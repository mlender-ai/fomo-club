import { describe, it, expect } from "vitest";
import { drawCards, DRAW_COST } from "../src/draw";
import { ACTIVE_CARDS } from "../src/cards";
import type { MarketCondition, TarotSpreadType } from "../src/types";

describe("drawCards", () => {
  it("single 스프레드 → 1장 반환", () => {
    const result = drawCards("single", "neutral");
    expect(result).toHaveLength(1);
    expect(result[0]!.card).toBeDefined();
    expect(["upright", "reversed"]).toContain(result[0]!.orientation);
  });

  it("three-card 스프레드 → 3장 반환", () => {
    const result = drawCards("three-card", "neutral");
    expect(result).toHaveLength(3);
  });

  it("three-card 스프레드에 past/present/future 슬롯 배정", () => {
    const result = drawCards("three-card", "neutral");
    const slots = result.map((c) => c.slot);
    expect(slots).toEqual(["past", "present", "future"]);
  });

  it("3장 뽑기 시 카드 중복 없음", () => {
    for (let i = 0; i < 20; i++) {
      const result = drawCards("three-card", "neutral");
      const ids = result.map((c) => c.card.id);
      expect(new Set(ids).size).toBe(3);
    }
  });

  it("모든 시장 상태에서 동작", () => {
    const conditions: MarketCondition[] = ["bullish", "bearish", "neutral", "volatile", "consolidating"];
    for (const cond of conditions) {
      const result = drawCards("single", cond);
      expect(result).toHaveLength(1);
      expect(result[0]!.card.id).toBeTruthy();
    }
  });

  it("반환된 카드가 ACTIVE_CARDS에 포함", () => {
    const activeIds = new Set(ACTIVE_CARDS.map((c) => c.id));
    for (let i = 0; i < 10; i++) {
      const result = drawCards("three-card", "neutral");
      for (const drawn of result) {
        expect(activeIds.has(drawn.card.id)).toBe(true);
      }
    }
  });

  it("bearish 상태에서 역방향 비율이 상대적으로 높음 (통계적 검증)", () => {
    let reversedCount = 0;
    const total = 200;
    for (let i = 0; i < total; i++) {
      const [card] = drawCards("single", "bearish");
      if (card!.orientation === "reversed") reversedCount++;
    }
    // bearish 역방향 확률 = 0.55, 200회 시 약 110회 예상 — 70 이상이면 통과
    expect(reversedCount).toBeGreaterThan(70);
  });

  it("bullish 상태에서 정방향 비율이 상대적으로 높음 (통계적 검증)", () => {
    let uprightCount = 0;
    const total = 200;
    for (let i = 0; i < total; i++) {
      const [card] = drawCards("single", "bullish");
      if (card!.orientation === "upright") uprightCount++;
    }
    // bullish 역방향 확률 = 0.25 → 정방향 0.75, 200회 시 약 150회 — 100 이상이면 통과
    expect(uprightCount).toBeGreaterThan(100);
  });
});

describe("DRAW_COST", () => {
  it("single = 1 크레딧", () => {
    expect(DRAW_COST.single).toBe(1);
  });

  it("three-card = 3 크레딧", () => {
    expect(DRAW_COST["three-card"]).toBe(3);
  });
});
