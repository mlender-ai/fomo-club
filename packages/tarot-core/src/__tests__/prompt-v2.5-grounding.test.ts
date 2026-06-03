import { describe, it, expect } from "vitest";
import { buildInterpretationPromptV2_5 } from "../prompts/interpret-v2.5.0.js";
import { buildInterpretationPromptV2_4 } from "../prompts/interpret-v2.4.0.js";
import { checkSafety } from "../safety/forbidden.js";
import type { FinancialContext } from "../prompts/interpret-v2.2.0.js";
import type { MarketSnapshot, DrawnCard } from "../types.js";

function bullMarket(): MarketSnapshot {
  return {
    ticker: "AAPL",
    market: "US",
    price: 200,
    changePercent: 1.5,
    volume: 1_000_000,
    rsi: 68,
    macdHistogram: 1.2,
    sma20: 190,
    sma200: 170,
    fiftyTwoWeekPosition: 0.85,
    momentum20: 20,
    daysAboveSma200: 12,
    condition: "bullish",
    summary: "AAPL 200 (+1.50%) — 강세",
  };
}

function card(id: string, nameKo: string, orientation: "upright" | "reversed" = "upright"): DrawnCard {
  return {
    card: {
      id, name: id, nameKo, arcana: "major", number: 0,
      keywords: ["change"], keywordsKo: ["변화"],
      meaningUpright: "흔들림", meaningReversed: "회복",
      imageUrl: `/cards/${id}.jpg`, toneGuide: "차분한", isActive: true,
    },
    orientation,
  };
}

const ctx: FinancialContext = { revenueGrowth: 0.3, profitMargins: 0.25, debtToEquity: 80 };

describe("interpret-v2.5.0 — 신호 척추 접지", () => {
  it("흐름 상태·드라이버·접지 규칙이 주입된다", () => {
    const prompt = buildInterpretationPromptV2_5(bullMarket(), [card("the-sun", "태양")], ctx);
    expect(prompt).toContain("흐름의 상태");
    expect(prompt).toContain("이 흐름을 만든 근거");
    expect(prompt).toContain("접지 규칙");
    // 구체 드라이버 사실이 들어간다
    expect(prompt).toMatch(/RSI 68|매출성장 \+30%|200일선/);
  });

  it("v2.4를 감싸 더 길고, v2.4 품질 레이어를 보존한다", () => {
    const market = bullMarket();
    const cards = [card("the-sun", "태양")];
    const v25 = buildInterpretationPromptV2_5(market, cards, ctx);
    const v24 = buildInterpretationPromptV2_4(market, cards, ctx);
    expect(v25.length).toBeGreaterThan(v24.length);
    expect(v25).toContain("패의 결");
    expect(v25).toContain("안티-클리셰");
  });

  it("점수/등급 숫자 자체는 프롬프트에 출력하지 않는다(내부 척추)", () => {
    const prompt = buildInterpretationPromptV2_5(bullMarket(), [card("the-sun", "태양")], ctx);
    // 등급 라벨이나 "83점" 같은 점수 노출이 없어야 함
    expect(prompt).not.toMatch(/\d+점/);
    expect(prompt).toContain("숫자 자체는 사용자에게 출력하지 마라");
  });

  it("접지 규칙은 미래 예측·매매 권유를 명시적으로 금지한다", () => {
    // 주의: checkSafety는 LLM '출력'용 게이트다. 프롬프트는 금칙어를 '금지 지시'로 포함하므로
    // 프롬프트 자체에 checkSafety를 걸지 않는다. 대신 주입한 사실 드라이버가 안전한지만 확인.
    const prompt = buildInterpretationPromptV2_5(bullMarket(), [card("the-sun", "태양")], ctx);
    expect(prompt).toContain("미래 가격");
    expect(prompt).toContain("권유");
    // 우리가 주입하는 사실 드라이버 라인(예: "RSI 68 — 상승 우위")은 BLOCKED 단어가 없어야 함
    const driverFacts = "RSI 68 — 상승 우위 매출성장 +30% 200일선 위 12봉째";
    expect(checkSafety(driverFacts).result).not.toBe("BLOCKED");
  });

  it("지표가 없으면 신호 섹션 없이 접지 규칙만 추가(하위호환)", () => {
    const bare: MarketSnapshot = {
      ticker: "X", market: "US", price: 10, changePercent: 0, volume: 0,
      condition: "neutral", summary: "",
    };
    const prompt = buildInterpretationPromptV2_5(bare, [card("the-sun", "태양")]);
    expect(prompt).toContain("접지 규칙");
  });
});
