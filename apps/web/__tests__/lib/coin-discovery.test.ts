import { describe, expect, it } from "vitest";
import { computeCoinSignal, hasDiscoverySignal, coinHeadline, type CoinSignal } from "../../lib/coin-discovery";
import type { CoinMarketSnapshot } from "../../lib/coin-market-source";

function snapshot(overrides: Partial<CoinMarketSnapshot> = {}): CoinMarketSnapshot {
  const days = 40;
  return {
    market: "KRW-TEST",
    symbol: "TEST",
    koreanName: "테스트코인",
    englishName: "Test",
    price: 1500,
    changePct: 1.2,
    accTradePrice24h: 5e9,
    tradeValueRank: 20,
    candles: Array.from({ length: days }, (_, i) => ({
      date: `2026-06-${String((i % 28) + 1).padStart(2, "0")}`,
      open: 1400, high: 1600, low: 1350, close: 1500, volume: 1000,
    })),
    tradeValues: Array.from({ length: days }, () => 5e9),
    fetchedAt: "2026-07-03T00:00:00Z",
    ...overrides,
  };
}

describe("coin discovery signals", () => {
  it("평소 수준 거래대금은 신호 아님 (정직한 0장)", () => {
    const s = snapshot(); // 24h == 20일 평균 → ratio 1.0
    const signal = computeCoinSignal(s)!;
    expect(signal.volumeRatio).toBeCloseTo(1.0, 1);
    expect(hasDiscoverySignal(s, signal)).toBe(false);
  });

  it("거래대금 이상(1.5배+)이면 커버리지 신호", () => {
    const s = snapshot({ accTradePrice24h: 1.5e10 }); // 평소 3배
    const signal = computeCoinSignal(s)!;
    expect(signal.volumeRatio).toBeCloseTo(3.0, 1);
    expect(hasDiscoverySignal(s, signal)).toBe(true);
  });

  it("진공 후 유입 — 직전 5일 저조 + 오늘 유입", () => {
    const values = Array.from({ length: 40 }, () => 5e9);
    for (let i = 34; i < 39; i += 1) values[i] = 1e9; // 진공(마지막 완결 5일 저조)
    const s = snapshot({ tradeValues: values, accTradePrice24h: 8e9 });
    const signal = computeCoinSignal(s)!;
    expect(signal.vacuumInflow).toBe(true);
    expect(hasDiscoverySignal(s, signal)).toBe(true);
  });

  it("급등락(±5%+)은 커버리지 신호 — 시총 상위 30에선 그 자체가 사건(WO: 급등 제외 폐기)", () => {
    const s = snapshot({ changePct: 7.2 }); // 거래대금 평소 수준이어도
    const signal = computeCoinSignal(s)!;
    expect(signal.bigMove).toBe(true);
    expect(hasDiscoverySignal(s, signal)).toBe(true);
  });

  it("캔들 부족(25일 미만) 마켓은 신호 계산 불가", () => {
    const s = snapshot({
      candles: snapshot().candles.slice(0, 10),
      tradeValues: snapshot().tradeValues.slice(0, 10),
    });
    expect(computeCoinSignal(s)).toBeNull();
  });

  it("헤드라인은 사실+수치 관측 서술", () => {
    const signal: CoinSignal = { volumeRatio: 6.24, vacuumInflow: false, bigMove: false, quiet: true };
    const s = snapshot({ athChangePct: -62 });
    expect(coinHeadline(s, signal)).toBe("24시간 거래대금 평소 6.2배 · 전고점 대비 62% 아래 · 아직 조용한 구간");
  });

  it("급등락 헤드라인 — 등락 사실이 앞에", () => {
    const signal: CoinSignal = { volumeRatio: 2.1, vacuumInflow: false, bigMove: true, quiet: false };
    const s = snapshot({ changePct: 7.23 });
    expect(coinHeadline(s, signal)).toBe("하루 +7.2% · 24시간 거래대금 평소 2.1배");
  });
});
