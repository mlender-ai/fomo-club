import { describe, it, expect } from "vitest";
import { buildInterpretationPromptV2_6 } from "../prompts/interpret-v2.6.0.js";
import { buildInterpretationPromptV2_5 } from "../prompts/interpret-v2.5.0.js";
import type { FinancialContext } from "../prompts/interpret-v2.2.0.js";
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

function card(id: string, nameKo: string, orientation: "upright" | "reversed" = "upright"): DrawnCard {
  return {
    card: {
      id,
      name: id,
      nameKo,
      arcana: "major",
      number: 0,
      keywords: ["change"],
      keywordsKo: ["변화"],
      meaningUpright: "흔들림",
      meaningReversed: "회복",
      imageUrl: `/cards/${id}.jpg`,
      toneGuide: "차분한",
      isActive: true,
    },
    orientation,
  };
}

describe("interpret-v2.6.0 — 3초 직관 headline 레이어", () => {
  it("단일 카드 — headline에 3초 직관·감정 선행 규칙이 삽입된다", () => {
    const prompt = buildInterpretationPromptV2_6(baseMarket(), [card("the-tower", "탑")]);
    expect(prompt).toContain("3초 직관(첫인상 가독성)");
    expect(prompt).toContain("첫 어절에 지배 감정");
  });

  it("v2.5의 몰입·리프레임(detail) 레이어는 그대로 보존된다", () => {
    const prompt = buildInterpretationPromptV2_6(baseMarket(), [card("the-tower", "탑")]);
    expect(prompt).toContain("몰입 감각");
    expect(prompt).toContain("두 번째 시선(리프레임)");
  });

  it("v2.4의 안티-클리셰는 그대로 보존된다", () => {
    const prompt = buildInterpretationPromptV2_6(baseMarket(), [card("the-tower", "탑")]);
    expect(prompt).toContain("## 패의 결 — 정·역의 긴장");
    expect(prompt).toContain("안티-클리셰");
  });

  it("3장 스프레드 — 슬롯 스토리텔링 유지 + 3초 직관 레이어 덧댐", () => {
    const cards = [
      card("the-tower", "탑", "upright"),
      card("the-star", "별", "reversed"),
      card("the-sun", "태양", "upright"),
    ];
    const v26 = buildInterpretationPromptV2_6(baseMarket(), cards);
    expect(v26).toContain("3장 스프레드 스토리텔링 (v2.3)");
    expect(v26).toContain("3초 직관(첫인상 가독성)");
  });

  it("v2.5 출력에 덧대어진다 (길이 증가, 컨텍스트 보존)", () => {
    const market = baseMarket();
    market.fiftyTwoWeekPosition = 0.8;
    const ctx: FinancialContext = { debtToEquity: 250, currentRatio: 0.8 };
    const cards = [card("the-tower", "탑", "upright")];
    const v26 = buildInterpretationPromptV2_6(market, cards, ctx);
    const v25 = buildInterpretationPromptV2_5(market, cards, ctx);
    expect(v26.length).toBeGreaterThan(v25.length);
  });

  it("3초 직관 레이어는 원시 수치를 노출하지 않는다", () => {
    const market = baseMarket();
    market.fiftyTwoWeekPosition = 0.8;
    const ctx: FinancialContext = { debtToEquity: 250 };
    const prompt = buildInterpretationPromptV2_6(market, [card("the-tower", "탑", "reversed")], ctx);
    expect(prompt).not.toContain("0.8");
    expect(prompt).not.toContain("250");
  });
});
