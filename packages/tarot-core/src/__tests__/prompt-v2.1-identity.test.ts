import { describe, it, expect } from "vitest";
import { buildInterpretationPromptV2_1 } from "../prompts/interpret-v2.1.0.js";
import type { MarketSnapshot, DrawnCard } from "../types.js";

function baseMarket(): MarketSnapshot {
  return {
    ticker: "AAPL",
    market: "US",
    price: 200,
    changePercent: 0.5,
    volume: 1_000_000,
    condition: "neutral",
    summary: "AAPL 200 (+0.50%) — 중립",
  };
}

function sampleCard(): DrawnCard {
  return {
    card: {
      id: "the-tower",
      name: "The Tower",
      nameKo: "탑",
      arcana: "major",
      number: 16,
      keywords: ["upheaval", "change"],
      keywordsKo: ["격변", "변화"],
      meaningUpright: "기존 구조의 흔들림",
      meaningReversed: "두려워하던 폭락은 오지 않음",
      imageUrl: "/cards/the-tower.jpg",
      toneGuide: "차분하지만 단호한",
      isActive: true,
    },
    orientation: "upright",
  };
}

describe("interpret-v2.1.0 — 종목 정체성 통합", () => {
  it("회사 이름(name) 이 풍경 컨텍스트에 포함", () => {
    const market = baseMarket();
    market.name = "Apple Inc.";

    const prompt = buildInterpretationPromptV2_1(market, [sampleCard()]);
    expect(prompt).toContain("Apple Inc.");
  });

  it("섹터(sector) 가 풍경 컨텍스트에 포함", () => {
    const market = baseMarket();
    market.sector = "Technology";

    const prompt = buildInterpretationPromptV2_1(market, [sampleCard()]);
    expect(prompt).toContain("Technology");
  });

  it("시가총액 — 대형주(>= $10B)면 심리 표현 추가", () => {
    const market = baseMarket();
    market.marketCap = 3_000_000_000_000; // $3T

    const prompt = buildInterpretationPromptV2_1(market, [sampleCard()]);
    // 대형주 심리 신호 — "대중이 안다고 믿는" / "유명한" 류 표현
    expect(prompt).toMatch(/대중이 안다고 믿는|많은 사람이 알고 있는|유명한/);
  });

  it("시가총액 — 소형주(< $1B)면 다른 심리 표현", () => {
    const market = baseMarket();
    market.marketCap = 500_000_000; // $500M

    const prompt = buildInterpretationPromptV2_1(market, [sampleCard()]);
    expect(prompt).toMatch(/소수만 아는|덜 알려진|관심받지 못한/);
  });

  it("52주 위치 — 고점 부근(>= 0.85) 심리 표현", () => {
    const market = baseMarket();
    market.fiftyTwoWeekPosition = 0.92;

    const prompt = buildInterpretationPromptV2_1(market, [sampleCard()]);
    expect(prompt).toMatch(/1년 동안 가장 사랑받았던|일 년 동안 가장 사랑받았던|일 년 중 가장 높은/);
  });

  it("52주 위치 — 저점 부근(<= 0.15) 심리 표현", () => {
    const market = baseMarket();
    market.fiftyTwoWeekPosition = 0.08;

    const prompt = buildInterpretationPromptV2_1(market, [sampleCard()]);
    expect(prompt).toMatch(/1년 동안 가장 외면받았던|일 년 동안 가장 외면받았던|일 년 중 가장 낮은/);
  });

  it("종목 정체성 필드 모두 없어도 프롬프트는 정상 생성 (하위 호환)", () => {
    const market = baseMarket(); // 추가 필드 없음
    const prompt = buildInterpretationPromptV2_1(market, [sampleCard()]);
    expect(prompt).toContain("AAPL");
    expect(prompt).toContain("탑");
    expect(prompt.length).toBeGreaterThan(500);
  });

  it("종목명/섹터/시가총액/52주 위치 절대 노출 금지 — 숫자 그대로는 나오면 안 됨", () => {
    const market = baseMarket();
    market.name = "Apple Inc.";
    market.sector = "Technology";
    market.marketCap = 3_000_000_000_000;
    market.fiftyTwoWeekPosition = 0.92;

    const prompt = buildInterpretationPromptV2_1(market, [sampleCard()]);
    // marketCap 숫자 자체는 노출 금지 (3000000000000, $3T 등)
    expect(prompt).not.toContain("3000000000000");
    expect(prompt).not.toContain("$3T");
    // 52주 위치 비율 자체도 노출 금지
    expect(prompt).not.toContain("0.92");
    expect(prompt).not.toContain("92%");
  });
});
