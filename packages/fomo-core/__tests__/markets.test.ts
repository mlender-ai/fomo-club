import { describe, expect, it } from "vitest";
import { assetHeatScore, buildMarketScores, type MacroQuote, type WhaleInput } from "../src";

describe("assetHeatScore", () => {
  it("0% → 중립 50", () => {
    expect(assetHeatScore(0)).toBe(50);
  });
  it("상승=과열(높음), 하락=침체(낮음)", () => {
    expect(assetHeatScore(3)).toBeGreaterThan(50);
    expect(assetHeatScore(-3)).toBeLessThan(50);
  });
  it("0~100 클램프", () => {
    expect(assetHeatScore(50)).toBe(100);
    expect(assetHeatScore(-50)).toBe(0);
  });
  it("비정상 입력 → 중립", () => {
    expect(assetHeatScore(NaN)).toBe(50);
  });
});

describe("buildMarketScores", () => {
  const macro: MacroQuote[] = [
    { key: "ndq", label: "나스닥", change: 1.5 },
    { key: "kospi", label: "코스피", change: -0.8 },
    { key: "sox", label: "필라델피아 반도체", change: 2 },
  ];
  const whale: WhaleInput = {
    coins: [
      { name: "Bitcoin", symbol: "btc", change24h: 4 },
      { name: "Ethereum", symbol: "eth", change24h: -2 },
    ],
  };

  it("나스닥·비트코인·코스피 순서로 점수 산출", () => {
    const out = buildMarketScores(macro, whale);
    expect(out.map((m) => m.key)).toEqual(["ndq", "btc", "kospi"]);
    expect(out[0]!.label).toBe("나스닥");
    expect(out[1]!.label).toBe("비트코인");
    expect(out[1]!.changePct).toBe(4);
    expect(out[1]!.score).toBeGreaterThan(out[2]!.score); // 비트코인 +4 > 코스피 -0.8
  });

  it("데이터 결측 자산은 생략 (가짜 점수 금지)", () => {
    const out = buildMarketScores([{ key: "ndq", label: "나스닥", change: null }], { coins: [] });
    expect(out).toHaveLength(0);
  });

  it("점수마다 구간 라벨이 붙는다", () => {
    const out = buildMarketScores(macro, whale);
    for (const m of out) expect(m.state).toBeTruthy();
  });
});
