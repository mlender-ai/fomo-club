/**
 * ENG-01 — 강제청산 모델 (Bitget 격리 공식 · 체결 · 갭 · 손절 순서 · 펀딩 · 1배/3배).
 */
import { describe, expect, it } from "vitest";

import { fundingPaid, liquidationPrice, mmrFor, rescoreTrade, statsOf, type Bar, type RescoreTrade } from "../lib/lab/liquidation";

const H = 3_600_000;
const T0 = Date.parse("2026-09-01T00:00:00Z");
const tiers = [
  { startUnit: 0, endUnit: 100_000, keepMarginRate: 0.0066 },
  { startUnit: 100_000, endUnit: 200_000, keepMarginRate: 0.01 },
];

function trade(over: Partial<RescoreTrade> = {}): RescoreTrade {
  return {
    id: "t1",
    trackKey: "crypto",
    symbol: "ADAUSDT",
    direction: "long",
    leverage: 3,
    marginUsdt: 100,
    quantity: 300, // 명목 300 USDT @ 1.0
    entryPrice: 1,
    entryAt: T0,
    exitAt: T0 + 12 * H,
    exitPrice: 1.05,
    exitReason: "take_profit_2",
    invalidationPrice: 0.9,
    partialExitAt: null,
    partialExitPrice: null,
    partialExitQuantity: 0,
    costsUsdt: 0.6,
    netPnlUsdt: 14.4,
    ...over,
  };
}
const bar = (i: number, o: number, h: number, l: number, c: number): Bar => [T0 + i * 4 * H, o, h, l, c];

describe("Bitget 격리 청산가 (A-1)", () => {
  it("3배 롱 · MMR 0.66% · 테이커 0.06% → 진입가 × (1 − 1/3) ÷ (1 − 0.0072) = 0.6715", () => {
    expect(liquidationPrice({ direction: "long", entry: 1, quantity: 300, margin: 100, mmr: 0.0066 })).toBeCloseTo(0.6715, 4);
  });
  it("3배 숏 → 진입가 × (1 + 1/3) ÷ (1 + 0.0072) = 1.3238", () => {
    expect(liquidationPrice({ direction: "short", entry: 1, quantity: 300, margin: 100, mmr: 0.0066 })).toBeCloseTo(1.3238, 4);
  });
  it("1배 롱은 사실상 청산되지 않는다(0 근처)", () => {
    expect(liquidationPrice({ direction: "long", entry: 1, quantity: 100, margin: 100, mmr: 0.0066 })).toBe(0);
  });
  it("유지증거금률은 명목 단계로 — 단계가 없으면 null (지어내지 않는다)", () => {
    expect(mmrFor(tiers, 300)).toBe(0.0066);
    expect(mmrFor(tiers, 150_000)).toBe(0.01);
    expect(mmrFor([], 300)).toBeNull();
  });
});

describe("펀딩 (A-3)", () => {
  it("롱은 양의 펀딩을 내고, 낸 만큼 증거금이 줄어 청산가가 진입가 쪽으로 온다", () => {
    const f = [
      { at: T0 + 8 * H, rate: 0.01 },
      { at: T0 + 16 * H, rate: 0.01 },
    ];
    const paid = fundingPaid("long", 300, f, T0, T0 + 20 * H, () => 1);
    expect(paid).toBeCloseTo(6);
    const before = liquidationPrice({ direction: "long", entry: 1, quantity: 300, margin: 100, mmr: 0.0066 }) as number;
    const after = liquidationPrice({ direction: "long", entry: 1, quantity: 300, margin: 100 - paid, mmr: 0.0066 }) as number;
    expect(after).toBeGreaterThan(before);
    expect(fundingPaid("short", 300, f, T0, T0 + 20 * H, () => 1)).toBeCloseTo(-6); // 숏은 받는다
  });
});

describe("청산 체결 (B · B-1 · B-2)", () => {
  it("저가가 청산가에 닿으면 그 봉에서 청산 — 남은 증거금 전부 + 진입 비용", () => {
    const r = rescoreTrade(trade({ invalidationPrice: 0.5 }), [bar(0, 1, 1.01, 0.99, 1), bar(1, 0.95, 0.96, 0.66, 0.7), bar(2, 0.7, 1.06, 0.7, 1.05)], [], tiers);
    expect(r.outcome).toBe("liquidation");
    expect(r.price).toBeCloseTo(0.6715, 4);
    expect(r.rescoredReturnPct).toBeLessThan(-100);
    expect(r.rescoredReturnPct).toBeGreaterThan(-101);
    expect(r.recordedNetUsdt).toBe(14.4); // 기록은 그대로
  });
  it("갭 — 시가가 이미 청산가 너머면 시가로(청산가보다 나쁘다)", () => {
    const r = rescoreTrade(trade({ invalidationPrice: 0.5 }), [bar(0, 1, 1, 1, 1), bar(1, 0.6, 0.62, 0.55, 0.6), bar(2, 0.7, 1.06, 0.7, 1.05)], [], tiers);
    expect(r.outcome).toBe("liquidation");
    expect(r.price).toBe(0.6);
  });
  it("같은 봉에서 손절선이 더 가까우면 손절 먼저", () => {
    const r = rescoreTrade(trade({ invalidationPrice: 0.9 }), [bar(0, 1, 1, 1, 1), bar(1, 0.95, 0.96, 0.66, 0.7), bar(2, 0.7, 1.06, 0.7, 1.05)], [], tiers);
    expect(r.outcome).toBe("stop_before_liquidation");
    expect(r.price).toBe(0.9);
    expect(r.rescoredNetUsdt).toBeCloseTo(-30 - 0.9 * 300 * (0.6 / (300 + 315)) - 300 * (0.6 / (300 + 315)), 4);
  });
  it("기록이 바로 그 봉의 손절이면 그대로 — 바뀐 게 없다", () => {
    const r = rescoreTrade(
      trade({ exitAt: T0 + 4 * H + 60_000, exitPrice: 0.9, exitReason: "invalidation_breach", netPnlUsdt: -30.9 }),
      [bar(0, 1, 1, 1, 1), bar(1, 0.95, 0.96, 0.66, 0.7)],
      [],
      tiers
    );
    expect(r.changed).toBe(false);
  });
  it("청산가에 안 닿으면 그대로 · 가장 가까이 간 거리를 남긴다", () => {
    const r = rescoreTrade(trade(), [bar(0, 1, 1.01, 0.99, 1), bar(1, 1, 1.02, 0.8, 1), bar(2, 1, 1.06, 1, 1.05)], [], tiers);
    expect(r.outcome).toBe("unchanged");
    expect(r.closestLiquidationPct).toBeCloseTo((0.8 - 0.6715) * 100, 1);
  });
});

describe("1배 · 3배 (D-2)", () => {
  it("3배에서 청산되는 움직임이 1배에서는 산다 — 손익은 배율대로", () => {
    const bars = [bar(0, 1, 1, 1, 1), bar(1, 0.95, 0.96, 0.66, 0.7), bar(2, 0.7, 1.06, 0.7, 1.05)];
    const t = trade({ invalidationPrice: 0.5 });
    expect(rescoreTrade(t, bars, [], tiers).outcome).toBe("liquidation");
    const one = rescoreTrade(t, bars, [], tiers, { leverage: 1 });
    expect(one.outcome).toBe("unchanged");
    expect(one.rescoredNetUsdt).toBeCloseTo(14.4 / 3);
  });
});

describe("트랙 요약 (D-4)", () => {
  it("N · 승률 · PF · MDD", () => {
    const s = statsOf([{ at: 1, net: 10 }, { at: 2, net: -20 }, { at: 3, net: 5 }], 100);
    expect(s.n).toBe(3);
    expect(s.winRatePct).toBeCloseTo(66.67, 1);
    expect(s.profitFactor).toBeCloseTo(0.75);
    expect(s.mddPct).toBeCloseTo(-18.18, 1);
  });
});
