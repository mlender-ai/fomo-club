import { describe, expect, it } from "vitest";
import {
  assetHeatScore,
  buildMarketScores,
  parseNaverIndexQuote,
  type MacroQuote,
  type WhaleInput,
} from "../src";

describe("parseNaverIndexQuote", () => {
  it("상승 → 양수 등락률, 콤마 제거", () => {
    const q = parseNaverIndexQuote({
      closePrice: "8,374.35",
      fluctuationsRatio: "7.86",
      compareToPreviousPrice: "상승",
    });
    expect(q).toEqual({ change: 7.86, close: 8374.35 });
  });

  it("하락 → 음수 (fluctuationsRatio 부호 무관)", () => {
    expect(parseNaverIndexQuote({ closePrice: "100", fluctuationsRatio: "1.2", compareToPreviousPrice: "하락" })?.change).toBe(-1.2);
    expect(parseNaverIndexQuote({ closePrice: "100", fluctuationsRatio: "-1.2", compareToPreviousPrice: "하락" })?.change).toBe(-1.2);
  });

  it("보합 → 0, 객체형 방향도 처리", () => {
    expect(parseNaverIndexQuote({ closePrice: "100", fluctuationsRatio: "0", compareToPreviousPrice: "보합" })?.change).toBe(0);
    expect(parseNaverIndexQuote({ closePrice: "100", fluctuationsRatio: "2", compareToPreviousPrice: { text: "하락" } })?.change).toBe(-2);
  });

  it("결측/파싱 실패 → null", () => {
    expect(parseNaverIndexQuote(null)).toBeNull();
    expect(parseNaverIndexQuote({ closePrice: "", fluctuationsRatio: "" })).toBeNull();
  });

  // 2026-07-13 사건 회귀(WO-21) — 방향 표기 미매치 시 양수 편향 폴백이 폭락을 상승으로 뒤집을 수 있었다.
  it("방향 미제공 + 음수 ratio → ratio 부호 신뢰(음수 유지)", () => {
    expect(parseNaverIndexQuote({ closePrice: "6,806.93", fluctuationsRatio: "-8.95" })?.change).toBe(-8.95);
    expect(parseNaverIndexQuote({ closePrice: "100", fluctuationsRatio: "-1.2", compareToPreviousPrice: {} })?.change).toBe(-1.2);
  });

  it("영문 name/code 방향 인식 — FALLING·code 5=하락, RISING·code 2=상승, EVEN=보합", () => {
    expect(parseNaverIndexQuote({ closePrice: "100", fluctuationsRatio: "8.95", compareToPreviousPrice: { name: "FALLING" } })?.change).toBe(-8.95);
    expect(parseNaverIndexQuote({ closePrice: "100", fluctuationsRatio: "-2", compareToPreviousPrice: { code: "2" } })?.change).toBe(2);
    expect(parseNaverIndexQuote({ closePrice: "100", fluctuationsRatio: "2", compareToPreviousPrice: { code: "5" } })?.change).toBe(-2);
    expect(parseNaverIndexQuote({ closePrice: "100", fluctuationsRatio: "0.1", compareToPreviousPrice: { name: "EVEN", code: "3" } })?.change).toBe(0);
  });

  it("localTradedAt → tradedAt(YYYY-MM-DD) 전달 — 발행측 스테일 가드 재료", () => {
    const q = parseNaverIndexQuote({
      closePrice: "6,806.93",
      fluctuationsRatio: "-8.95",
      compareToPreviousPrice: { code: "5", text: "하락", name: "FALLING" },
      localTradedAt: "2026-07-13T18:59:00+09:00",
    });
    expect(q).toEqual({ change: -8.95, close: 6806.93, tradedAt: "2026-07-13" });
    // 미제공이면 생략(기존 호출부 무회귀)
    expect(parseNaverIndexQuote({ closePrice: "100", fluctuationsRatio: "1", compareToPreviousPrice: "상승" })).toEqual({ change: 1, close: 100 });
  });
});

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
