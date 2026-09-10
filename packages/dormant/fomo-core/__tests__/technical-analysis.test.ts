import { describe, expect, it } from "vitest";
import {
  computeFomoScore,
  computeTechnicalAnalysis,
  isTaFactTextSafe,
  selectTaFact,
  type DailyOhlcv,
} from "../src";

function candles(closes: number[], volumes?: number[]): DailyOhlcv[] {
  return closes.map((close, i) => ({
    date: `202601${String((i % 28) + 1).padStart(2, "0")}`,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: volumes?.[i] ?? 1000,
  }));
}

describe("technical analysis facts — OHLCV 사실층", () => {
  it("같은 일봉 OHLCV 입력은 같은 TA snapshot을 만든다", () => {
    const input = candles(Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 3) * 2), Array.from({ length: 80 }, (_, i) => 1000 + i * 3));

    expect(computeTechnicalAnalysis(input)).toEqual(computeTechnicalAnalysis(input));
  });

  it("평범한 종목은 TA fact를 표시하지 않는다", () => {
    const input = candles(Array.from({ length: 80 }, () => 100), Array.from({ length: 80 }, () => 1000));
    const ta = computeTechnicalAnalysis(input);

    expect(ta.facts).toEqual([]);
    expect(selectTaFact(computeFomoScore({ volumeRatio: 1.05, changePct: 0.1 }), ta)).toBeUndefined();
  });

  it("포모 incoming에는 매집/스퀴즈 확증 fact를 우선 선택한다", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + i * 0.02);
    const volumes = Array.from({ length: 80 }, (_, i) => (i < 79 ? 1200 : 3600));
    const ta = computeTechnicalAnalysis(candles(closes, volumes));
    const fomo = computeFomoScore({ foreignNetStreak: 5, foreignNetRatio: 0.01 });
    const selected = selectTaFact(fomo, ta);

    expect(selected?.kind).toBe("accumulation_divergence");
    expect(selected?.role).toBe("confirmation");
    expect(selected?.confidence).toBe("low");
  });

  it("수급은 강한데 RSI가 과열이면 균형 fact를 우선 선택한다", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + i * 1.4);
    const ta = computeTechnicalAnalysis(candles(closes));
    const fomo = computeFomoScore({ foreignNetStreak: 5, foreignNetRatio: 0.01 });
    const selected = selectTaFact(fomo, ta);

    expect(selected?.kind).toBe("rsi_overbought");
    expect(selected?.role).toBe("balance");
  });

  it("TA fact 문장은 다음 행동 암시 없이 원인+상태만 말한다", () => {
    const cases = [
      ...computeTechnicalAnalysis(candles(Array.from({ length: 80 }, (_, i) => 100 + i * 1.4))).facts,
      ...computeTechnicalAnalysis(candles(Array.from({ length: 80 }, (_, i) => 160 - i * 1.2))).facts,
      ...computeTechnicalAnalysis(candles(Array.from({ length: 80 }, (_, i) => 100 + i * 0.02), Array.from({ length: 80 }, (_, i) => 1000 + i * 12))).facts,
    ];

    expect(cases.length).toBeGreaterThan(0);
    for (const fact of cases) {
      expect(isTaFactTextSafe(fact.text), fact.text).toBe(true);
      expect(fact.text).not.toMatch(/사라|팔아라|추천|오를|내릴|반등할|조정받/);
    }
  });

  it("매집·스퀴즈 입력은 튜닝 플래그가 켜질 때만 L에 반영된다", () => {
    const off = computeFomoScore({ accumulationDivergence: true, bollingerSqueeze: true });
    const on = computeFomoScore(
      { accumulationDivergence: true, bollingerSqueeze: true },
      { accumulation: { enabled: true, leadBonus: 8 }, bollingerSqueeze: { enabled: true, leadBonus: 5 } }
    );

    expect(off.leadSignal).toBe(0);
    expect(on.leadSignal).toBe(13);
    expect(on.inputs.accumulationDivergence).toBe(true);
  });
});
