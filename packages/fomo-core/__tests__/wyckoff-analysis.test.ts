import { describe, expect, it } from "vitest";
import { computeWyckoffAnalysis, type DailyOhlcv } from "../src";

function datedCandles(rows: Array<{ close: number; volume: number; low?: number; high?: number }>): DailyOhlcv[] {
  return rows.map((row, index) => {
    const date = new Date(Date.UTC(2025, 0, 2 + index)).toISOString().slice(0, 10);
    const open = index > 0 ? rows[index - 1]!.close : row.close;
    return {
      date,
      open,
      high: Math.max(open, row.close, row.high ?? 0) * 1.001,
      low: Math.min(open, row.close, row.low ?? Number.POSITIVE_INFINITY) * 0.999,
      close: row.close,
      volume: row.volume,
    };
  });
}

function accumulationRows(): Array<{ close: number; volume: number; low?: number; high?: number }> {
  const rows: Array<{ close: number; volume: number; low?: number; high?: number }> = [];
  for (let i = 0; i < 50; i += 1) rows.push({ close: 200 - i * 2, volume: 1_100_000 });
  for (let i = 0; i < 60; i += 1) {
    const close = 100.5 + Math.sin(i / 3.2) * 1.2 + i * 0.035;
    rows.push({ close, volume: 900_000 - i * 6_000 });
  }
  const spring = 50 + 41;
  rows[spring] = { close: 99.2, low: 96.2, high: 101.2, volume: 1_250_000 };
  rows[spring + 1] = { close: 101.7, low: 99.7, high: 102.1, volume: 680_000 };
  return rows;
}

function distributionRows(): Array<{ close: number; volume: number; low?: number; high?: number }> {
  const rows: Array<{ close: number; volume: number; low?: number; high?: number }> = [];
  for (let i = 0; i < 50; i += 1) rows.push({ close: 100 + i * 2, volume: 700_000 });
  for (let i = 0; i < 60; i += 1) {
    const close = 199.5 + Math.sin(i / 3.4) * 1.1 - i * 0.02;
    rows.push({ close, volume: 620_000 + i * 8_000 });
  }
  const upthrust = 50 + 40;
  rows[upthrust] = { close: 201.5, low: 198.8, high: 207.5, volume: 1_700_000 };
  rows[upthrust + 1] = { close: 199.1, low: 197.9, high: 201.1, volume: 1_050_000 };
  return rows;
}

function impulsePullbackRows(): Array<{ close: number; volume: number; low?: number; high?: number }> {
  const rows: Array<{ close: number; volume: number; low?: number; high?: number }> = [];
  for (let i = 0; i < 90; i += 1) rows.push({ close: 100 + Math.sin(i / 7) * 0.5, volume: 1_000_000 });
  for (let i = 1; i <= 8; i += 1) rows.push({ close: 100 + i * 1.6, volume: 2_100_000 });
  const pullbackCloses = [111.2, 110.3, 109.1, 108.1, 107.1, 106.4, 106.8, 107.2];
  for (const close of pullbackCloses) rows.push({ close, low: close - 0.7, high: close + 0.8, volume: 720_000 });
  return rows;
}

describe("computeWyckoffAnalysis", () => {
  it("하락 뒤 수렴·거래 감소·저점 절상을 매집 구간으로 판정하고 스프링을 표시한다", () => {
    const result = computeWyckoffAnalysis({
      candles: datedCandles(accumulationRows()),
      foreignNetStreak: 5,
      invalidationLevel: 96.2,
      currency: "KRW",
    });
    expect(result.currentZone?.kind).toBe("accumulation");
    expect(result.currentZone?.weeks).toBeGreaterThanOrEqual(6);
    expect(result.events.some((event) => event.kind === "spring")).toBe(true);
    expect(result.summary).toMatch(/매집 추정 구간|매집 추정/);
    expect(result.summary).toContain("외국인 5일 연속 순매수");
    expect(result.summary).toContain("96원");
  });

  it("상승 뒤 고점 정체·거래 증가·상방 실패를 분산 구간과 업스러스트로 판정한다", () => {
    const result = computeWyckoffAnalysis({ candles: datedCandles(distributionRows()), currency: "USD" });
    expect(result.currentZone?.kind).toBe("distribution");
    const event = result.events.find((candidate) => candidate.kind === "upthrust");
    expect(event).toBeDefined();
    expect(event?.explanation).toContain("$");
    expect(result.summary).toContain("분산 추정 구간");
  });

  it("10봉 내 거래량 동반 강파동과 MA 지지·거래 감소 되돌림을 임펄스/눌림목으로 판정한다", () => {
    const result = computeWyckoffAnalysis({ candles: datedCandles(impulsePullbackRows()), currency: "USD" });
    const impulse = result.events.find((event) => event.kind === "impulse" && event.direction === "up");
    const pullback = result.events.find((event) => event.kind === "pullback");
    expect(impulse?.movePct).toBeGreaterThanOrEqual(8);
    expect(impulse?.volumeRatio).toBeGreaterThanOrEqual(1.5);
    expect(pullback?.retracementPct).toBeGreaterThanOrEqual(25);
    expect(pullback?.retracementPct).toBeLessThanOrEqual(68);
    expect(pullback?.explanation).toMatch(/MA20|MA60/);
  });

  it("조건이 모호한 횡보는 구간과 이벤트를 억지 생성하지 않는다", () => {
    const rows = Array.from({ length: 90 }, (_, index) => ({ close: 100 + Math.sin(index / 5) * 0.3, volume: 1_000_000 }));
    const result = computeWyckoffAnalysis({ candles: datedCandles(rows), invalidationLevel: 97 });
    expect(result.currentZone).toBeUndefined();
    expect(result.events).toHaveLength(0);
    expect(result.summary).toBeUndefined();
  });

  it("같은 입력은 바이트 단위로 같은 결과를 낸다", () => {
    const input = { candles: datedCandles(accumulationRows()), institutionNetStreak: 4, invalidationLevel: 97 } as const;
    expect(JSON.stringify(computeWyckoffAnalysis(input))).toBe(JSON.stringify(computeWyckoffAnalysis(input)));
  });

  it("실수치가 다른 종목의 지금 구간 요약을 같은 문장으로 반복하지 않는다", () => {
    const summaries = Array.from({ length: 6 }, (_, index) => {
      const scale = 1 + index * 0.17;
      const candles = datedCandles(
        accumulationRows().map((row) => ({
          ...row,
          close: row.close * scale,
          ...(row.low ? { low: row.low * scale } : {}),
          ...(row.high ? { high: row.high * scale } : {}),
        }))
      );
      return computeWyckoffAnalysis({ candles, foreignNetStreak: 3 + index, invalidationLevel: 96.2 * scale }).summary;
    });
    expect(summaries.every(Boolean)).toBe(true);
    expect(new Set(summaries).size).toBe(summaries.length);
  });
});
