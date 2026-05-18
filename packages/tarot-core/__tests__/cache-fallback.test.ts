import { describe, it, expect, vi } from "vitest";
import { buildCacheKey, getCacheTtlMs, isCacheExpired } from "../src/cache";
import { getFallbackInterpretation } from "../src/fallback/templates";
import type { DrawnCard, MarketCondition, TarotCardId } from "../src/types";
import { TAROT_CARDS } from "../src/cards";

// --- cache ---

function makeDrownCard(id: TarotCardId, orientation: "upright" | "reversed"): DrawnCard {
  const card = TAROT_CARDS[id];
  return { card, orientation };
}

describe("buildCacheKey", () => {
  it("결정론적 키 생성", () => {
    const cards = [makeDrownCard("the-fool", "upright")];
    const key1 = buildCacheKey("AAPL", "single", cards, "bullish");
    const key2 = buildCacheKey("AAPL", "single", cards, "bullish");
    expect(key1).toBe(key2);
  });

  it("올바른 포맷: tarot:ticker:spread:condition:cards", () => {
    const cards = [
      makeDrownCard("the-fool", "upright"),
      makeDrownCard("the-tower", "reversed"),
    ];
    const key = buildCacheKey("TSLA", "three-card", cards, "volatile");
    expect(key).toBe("tarot:TSLA:three-card:volatile:the-fool:upright|the-tower:reversed");
  });

  it("다른 조건이면 다른 키", () => {
    const cards = [makeDrownCard("the-star", "upright")];
    const k1 = buildCacheKey("AAPL", "single", cards, "bullish");
    const k2 = buildCacheKey("AAPL", "single", cards, "bearish");
    expect(k1).not.toBe(k2);
  });
});

describe("getCacheTtlMs", () => {
  it("volatile → 30분", () => {
    expect(getCacheTtlMs("volatile")).toBe(30 * 60 * 1000);
  });

  it("bullish → 1시간", () => {
    expect(getCacheTtlMs("bullish")).toBe(60 * 60 * 1000);
  });

  it("bearish → 1시간", () => {
    expect(getCacheTtlMs("bearish")).toBe(60 * 60 * 1000);
  });

  it("neutral → 2시간", () => {
    expect(getCacheTtlMs("neutral")).toBe(2 * 60 * 60 * 1000);
  });

  it("consolidating → 2시간", () => {
    expect(getCacheTtlMs("consolidating")).toBe(2 * 60 * 60 * 1000);
  });
});

describe("isCacheExpired", () => {
  it("TTL 내 → 만료 안 됨", () => {
    const now = new Date().toISOString();
    expect(isCacheExpired(now, "neutral")).toBe(false);
  });

  it("TTL 초과 → 만료", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(isCacheExpired(threeHoursAgo, "neutral")).toBe(true);
  });

  it("volatile은 30분 초과 시 만료", () => {
    const fortyMinAgo = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    expect(isCacheExpired(fortyMinAgo, "volatile")).toBe(true);
  });
});

// --- fallback ---

describe("getFallbackInterpretation", () => {
  it("the-fool:upright 템플릿 반환", () => {
    const fb = getFallbackInterpretation("the-fool", "upright");
    expect(fb.headline).toBeTruthy();
    expect(fb.summary).toBeTruthy();
    expect(fb.detail).toBeTruthy();
  });

  it("매핑 없는 카드에 범용 폴백 반환", () => {
    const fb = getFallbackInterpretation("the-magician", "upright");
    expect(fb.headline).toBe("우주의 흐름이 말을 건넨다");
  });

  it("반환 텍스트에 금칙어 없음", () => {
    const blockedTerms = ["매수", "매도", "buy", "sell", "수익 보장"];
    const cards: TarotCardId[] = ["the-fool", "the-tower", "the-star", "the-moon"];
    for (const cardId of cards) {
      for (const orient of ["upright", "reversed"] as const) {
        const fb = getFallbackInterpretation(cardId, orient);
        const allText = `${fb.headline} ${fb.summary} ${fb.detail}`.toLowerCase();
        for (const term of blockedTerms) {
          expect(allText).not.toContain(term.toLowerCase());
        }
      }
    }
  });

  it("모든 폴백에 면책 관련 문구 포함", () => {
    const cards: TarotCardId[] = ["the-fool", "the-tower", "the-star", "the-moon"];
    for (const cardId of cards) {
      const fb = getFallbackInterpretation(cardId, "upright");
      expect(fb.detail).toContain("투자 조언이 아닙니다");
    }
  });
});
