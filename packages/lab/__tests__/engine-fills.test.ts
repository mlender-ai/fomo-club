import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILL,
  entryFill,
  exitDecision,
  exitFill,
  fundingCost,
  grossPnl,
  slippageBps,
  type Bar,
  type OpenPosition,
} from "../src/engine";

const T0 = new Date("2026-01-01T00:00:00Z");

function bar(o: number, h: number, l: number, c: number, volume = 1_000_000): Bar {
  return { at: T0, open: o, high: h, low: l, close: c, volume };
}

function position(over: Partial<OpenPosition> = {}): OpenPosition {
  return {
    symbol: "BTC",
    side: "LONG",
    entryAt: T0,
    entryPrice: 100,
    entryReason: "test",
    qty: 1,
    stopPrice: 92,
    targetPrice: null,
    entryCost: 0,
    funding: 0,
    maxHoldBars: null,
    barsHeld: 0,
    ...over,
  };
}

/** 슬리피지·수수료를 끄면 규칙 자체만 볼 수 있다. */
const CLEAN = { ...DEFAULT_FILL, takerFeeRate: 0, minSlippageBps: 0, impactBps: 0 };

describe("완료확인 6 — 체결이 다음 봉 시가로 된다", () => {
  it("진입가는 다음 봉 시가다 — 신호 봉 종가가 아니다", () => {
    const next = bar(110, 120, 105, 118);
    expect(entryFill("LONG", next, 1, CLEAN).price).toBe(110);
  });

  it("갭 상승이면 갭 이후 가격으로 체결된다 — 유리한 가격을 주지 않는다", () => {
    // 직전 봉 종가가 100 이었어도 시가가 130 이면 130 에 산다.
    expect(entryFill("LONG", bar(130, 135, 129, 133), 1, CLEAN).price).toBe(130);
  });

  it("슬리피지는 불리한 쪽으로 붙는다", () => {
    const next = bar(100, 101, 99, 100);
    expect(entryFill("LONG", next, 1, DEFAULT_FILL).price).toBeGreaterThan(100);
    expect(entryFill("SHORT", next, 1, DEFAULT_FILL).price).toBeLessThan(100);
  });
});

describe("완료확인 7 — 손절이 손절가로 체결된다 (갭은 시가)", () => {
  it("저가가 손절선을 통과하면 **손절가**로 체결한다 — 종가가 아니다", () => {
    // 종가 95 로 끝났지만 저가가 90 까지 내려가 손절선 92 를 통과했다.
    const decision = exitDecision(position(), bar(100, 101, 90, 95));
    expect(decision).toEqual({ reason: "STOP", price: 92 });
  });

  it("**갭 하락이면 시가로 체결한다** — 손절가보다 나쁜 가격이다", () => {
    // 시가 85 가 이미 손절선 92 아래다. 92 에 못 판다.
    const decision = exitDecision(position(), bar(85, 88, 80, 86));
    expect(decision).toEqual({ reason: "STOP", price: 85 });
    expect(decision?.price).toBeLessThan(92);
  });

  it("숏도 같다 — 갭 상승이면 시가로 체결", () => {
    const short = position({ side: "SHORT", stopPrice: 108 });
    expect(exitDecision(short, bar(115, 120, 114, 118))).toEqual({ reason: "STOP", price: 115 });
    expect(exitDecision(short, bar(100, 110, 99, 101))).toEqual({ reason: "STOP", price: 108 });
  });

  it("손절선에 안 닿으면 청산하지 않는다", () => {
    expect(exitDecision(position(), bar(100, 105, 93, 104))).toBeNull();
  });
});

describe("같은 봉에서 손절·목표가 다 닿으면 — 손절 먼저", () => {
  it("손절로 친다 (FCE outcomes.py: loss first)", () => {
    const p = position({ stopPrice: 92, targetPrice: 108 });
    // 저가 90 (손절 통과) · 고가 110 (목표 통과) — 봉 안의 순서를 모른다.
    const decision = exitDecision(p, bar(100, 110, 90, 105));
    expect(decision?.reason).toBe("STOP");
  });

  it("목표만 닿으면 목표로 친다", () => {
    const p = position({ stopPrice: 92, targetPrice: 108 });
    expect(exitDecision(p, bar(100, 110, 95, 105))).toEqual({ reason: "TARGET", price: 108 });
  });
});

describe("시간 청산", () => {
  it("최종 **종가**로 마크한다 — 피크(MFE) 기준은 낙관 편향이다", () => {
    const p = position({ maxHoldBars: 3, barsHeld: 2 });
    const decision = exitDecision(p, bar(100, 130, 99, 101));
    expect(decision).toEqual({ reason: "TIME", price: 101 });
    expect(decision?.price).not.toBe(130);
  });

  it("보유 기간이 남았으면 청산하지 않는다", () => {
    expect(exitDecision(position({ maxHoldBars: 5, barsHeld: 1 }), bar(100, 105, 95, 104))).toBeNull();
  });
});

describe("슬리피지", () => {
  it("주문이 작아도 하한만큼은 먹는다 — 0 슬리피지 백테스트는 거짓이다", () => {
    expect(slippageBps(1, bar(100, 101, 99, 100, 1e9), DEFAULT_FILL)).toBeGreaterThanOrEqual(
      DEFAULT_FILL.minSlippageBps
    );
  });

  it("주문이 봉 거래대금 대비 클수록 더 밀린다", () => {
    const small = slippageBps(1_000, bar(100, 101, 99, 100, 10_000), DEFAULT_FILL);
    const large = slippageBps(500_000, bar(100, 101, 99, 100, 10_000), DEFAULT_FILL);
    expect(large).toBeGreaterThan(small);
  });

  it("거래량이 0 인 봉에서도 하한을 준다 — 나눗셈이 깨지지 않는다", () => {
    expect(slippageBps(1000, bar(100, 100, 100, 100, 0), DEFAULT_FILL)).toBe(
      DEFAULT_FILL.minSlippageBps
    );
  });
});

describe("완료확인 8 — 펀딩비가 반영된다", () => {
  it("롱은 요율이 양수면 낸다", () => {
    expect(fundingCost("LONG", 0.0001, 100_000)).toBeCloseTo(10);
  });

  it("숏은 반대로 받는다", () => {
    expect(fundingCost("SHORT", 0.0001, 100_000)).toBeCloseTo(-10);
  });

  it("요율이 음수면 롱이 받는다", () => {
    expect(fundingCost("LONG", -0.0001, 100_000)).toBeCloseTo(-10);
  });
});

describe("손익", () => {
  it("롱은 오르면 이익", () => {
    expect(grossPnl("LONG", 100, 110, 2)).toBe(20);
  });

  it("숏은 내리면 이익", () => {
    expect(grossPnl("SHORT", 100, 90, 2)).toBe(20);
  });

  it("청산 슬리피지도 불리한 쪽이다", () => {
    const decision = { reason: "STOP" as const, price: 100 };
    expect(exitFill("LONG", decision, bar(100, 101, 99, 100), 1, DEFAULT_FILL).price).toBeLessThan(100);
    expect(exitFill("SHORT", decision, bar(100, 101, 99, 100), 1, DEFAULT_FILL).price).toBeGreaterThan(100);
  });
});
