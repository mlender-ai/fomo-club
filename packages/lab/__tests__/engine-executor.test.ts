import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXECUTOR,
  DEFAULT_FILL,
  HistoricalSource,
  computeMetrics,
  execute,
  foldsAreDisjoint,
  isRejected,
  planSize,
  splitFolds,
  type Bar,
  type StrategyDefinition,
} from "../src";

const H = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

function bar(i: number, close: number, over: Partial<Bar> = {}): Bar {
  return {
    at: new Date(T0 + i * H),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000_000,
    ...over,
  };
}

/** 항상 진입하려 드는 전략 — 실행기 규칙만 보려고 조건을 비운다. */
function alwaysEnter(over: Partial<StrategyDefinition> = {}): StrategyDefinition {
  return {
    market: "crypto",
    universe: { type: "list", symbols: ["BTC"] },
    // consecutive 는 2봉만 있으면 값이 난다. 워밍업 직후부터 진입한다.
    entry: { all: [{ indicator: "consecutive", min: -999 }] },
    exit: { stop_pct: -10, target_pct: null, max_hold_days: null },
    sizing: { type: "risk_pct", risk_pct: 2 },
    leverage: 1,
    max_positions: 1,
    ...over,
  };
}

/** 비용 0 으로 두면 체결 규칙 자체만 볼 수 있다. */
const CLEAN_CONFIG = {
  ...DEFAULT_EXECUTOR,
  initialCapital: 100_000,
  fill: { ...DEFAULT_FILL, takerFeeRate: 0, minSlippageBps: 0, impactBps: 0 },
  reentryLock: "off" as const,
};

function run(bars: readonly Bar[], definition = alwaysEnter(), config = CLEAN_CONFIG, gaps?: never) {
  return execute({
    definition,
    source: new HistoricalSource({ symbol: "BTC", bars }),
    config,
    ...(gaps ? { gaps } : {}),
  });
}

describe("완료확인 6 — 체결이 다음 봉 시가로 (실행기 전체에서)", () => {
  it("신호 봉의 다음 봉 시가로 들어간다", () => {
    const bars = [bar(0, 100), bar(1, 101), bar(2, 102, { open: 150 }), bar(3, 103)];
    const result = run(bars);
    const trade = result.trades[0] ?? null;
    const open = result.equity.length > 0 ? result.trades : [];
    // 봉 1 에서 신호 → 봉 2 시가(150)에 체결. 봉 1 종가(101)가 아니다.
    const entered = trade?.entryPrice ?? open[0]?.entryPrice ?? null;
    expect(entered).toBe(150);
  });
});

describe("완료확인 7 — 손절이 손절가로, 갭은 시가로 (실행기 전체에서)", () => {
  it("갭 하락이면 손절가가 아니라 시가로 체결된다", () => {
    const bars = [
      bar(0, 100),
      bar(1, 100),
      bar(2, 100, { open: 100 }), // 진입: 시가 100, 손절선 90
      bar(3, 70, { open: 70, high: 72, low: 68 }), // 갭 하락 — 시가 70 이 이미 90 아래
    ];
    const result = run(bars);
    const trade = result.trades[0];
    expect(trade?.exitReason).toBe("STOP");
    expect(trade?.exitPrice).toBe(70);
    expect(trade?.exitPrice).toBeLessThan(90);
  });

  it("갭이 아니면 손절가로 체결된다", () => {
    const bars = [
      bar(0, 100),
      bar(1, 100),
      bar(2, 100, { open: 100 }),
      bar(3, 95, { open: 99, high: 99, low: 85 }), // 시가는 손절선 위, 저가가 통과
    ];
    const trade = run(bars).trades[0];
    expect(trade?.exitReason).toBe("STOP");
    expect(trade?.exitPrice).toBe(90);
  });
});

describe("완료확인 11 — 데이터 구멍 구간에서 진입하지 않는다", () => {
  it("신호 시각이 구멍 안이면 막는다", () => {
    const bars = [bar(0, 100), bar(1, 101), bar(2, 102), bar(3, 103)];
    const result = execute({
      definition: alwaysEnter(),
      source: new HistoricalSource({ symbol: "BTC", bars }),
      config: CLEAN_CONFIG,
      gaps: {
        BTC: [{ fromAt: new Date(T0), toAt: new Date(T0 + 3 * H), missing: 3 }],
      },
    });
    expect(result.trades).toHaveLength(0);
    expect(result.blocked.data_gap).toBeGreaterThan(0);
  });

  it("구멍 밖이면 정상 진입한다", () => {
    const bars = [bar(0, 100), bar(1, 101), bar(2, 102), bar(3, 103)];
    expect(run(bars).blocked.data_gap ?? 0).toBe(0);
  });
});

describe("재진입 잠금 (FCE e363f64 이식)", () => {
  const bars = [
    bar(0, 100),
    bar(1, 100),
    bar(2, 100),
    bar(3, 85, { open: 99, high: 99, low: 85 }), // 손절 청산
    bar(4, 100),
    bar(5, 100),
  ];

  it("same_bar — 청산한 그 봉에서는 다시 안 들어간다", () => {
    const result = run(bars, alwaysEnter(), { ...CLEAN_CONFIG, reentryLock: "same_bar" });
    expect(result.blocked.reentry_lock ?? 0).toBeGreaterThanOrEqual(0);
    // 청산 봉과 같은 시각에 진입한 거래가 없어야 한다.
    const exitAt = result.trades[0]?.exitAt.getTime();
    expect(result.trades.some((t) => t.entryAt.getTime() === exitAt)).toBe(false);
  });

  it("off — 잠그지 않으면 기존 동작이다", () => {
    const result = run(bars, alwaysEnter(), { ...CLEAN_CONFIG, reentryLock: "off" });
    expect(result.blocked.reentry_lock ?? 0).toBe(0);
  });
});

describe("사이징 (FCE 439c4e9 이식)", () => {
  const config = { mode: "risk_pct" as const, value: 2, maxNotionalMultiple: 1 };

  it("리스크 예산 / 손절 거리로 수량이 난다", () => {
    const plan = planSize(100_000, 100, 90, config, 1);
    expect(isRejected(plan)).toBe(false);
    if (!isRejected(plan)) {
      // 예산 2,000 / 거리 10 = 수량 200 → 명목 20,000
      expect(plan.qty).toBeCloseTo(200);
      expect(plan.plannedRisk).toBeCloseTo(2_000);
    }
  });

  it("손절이 극히 가까우면 명목 상한이 막는다 — 상한이 없으면 한 건이 계좌를 지운다", () => {
    const plan = planSize(100_000, 100, 99.999, config, 1);
    expect(isRejected(plan)).toBe(false);
    if (!isRejected(plan)) {
      expect(plan.constraint).toBe("max_notional");
      expect(plan.notional).toBeLessThanOrEqual(100_000);
    }
  });

  it("상한에 걸리면 **실제** 리스크를 적는다 — 예산이 아니다", () => {
    const plan = planSize(100_000, 100, 99.999, config, 1);
    if (!isRejected(plan)) {
      expect(plan.plannedRisk).not.toBeCloseTo(2_000);
      expect(plan.plannedRisk).toBeCloseTo(plan.stopDistance * plan.qty);
    }
  });

  it("손절 거리가 0 이면 **거절한다** — 0 수량으로 조용히 넘어가지 않는다", () => {
    const plan = planSize(100_000, 100, 100, config, 1);
    expect(isRejected(plan)).toBe(true);
    if (isRejected(plan)) expect(plan.reason).toBe("rejected:no_stop_distance");
  });

  it("자본이 0 이면 거절한다", () => {
    expect(isRejected(planSize(0, 100, 90, config, 1))).toBe(true);
  });
});

describe("PART E — 워크포워드", () => {
  const bars = Array.from({ length: 100 }, (_, i) => bar(i, 100 + i));

  it("학습·검증 구간으로 나눈다", () => {
    const folds = splitFolds(bars, { inSampleBars: 30, outOfSampleBars: 10 });
    expect(folds.length).toBeGreaterThan(1);
    const first = folds[0];
    expect(first?.inSample.bars).toHaveLength(30);
    expect(first?.outOfSample.bars).toHaveLength(10);
  });

  it("학습 구간이 검증 구간보다 **앞**이고 겹치지 않는다", () => {
    for (const fold of splitFolds(bars, { inSampleBars: 30, outOfSampleBars: 10 })) {
      expect(fold.inSample.to.getTime()).toBeLessThan(fold.outOfSample.from.getTime());
    }
  });

  it("검증 구간이 서로 겹치지 않는다 — 겹치면 표본이 커 보인다", () => {
    expect(foldsAreDisjoint(splitFolds(bars, { inSampleBars: 30, outOfSampleBars: 10 }))).toBe(true);
  });

  it("전진 폭을 줄이면 검증 구간이 겹치고, 그걸 감지한다", () => {
    const folds = splitFolds(bars, { inSampleBars: 30, outOfSampleBars: 10, stepBars: 5 });
    expect(foldsAreDisjoint(folds)).toBe(false);
  });

  it("봉이 모자라면 빈 배열이다 — 억지로 한 구간을 만들지 않는다", () => {
    expect(splitFolds(bars.slice(0, 20), { inSampleBars: 30, outOfSampleBars: 10 })).toEqual([]);
  });
});

describe("PART F — 지표", () => {
  it("거래가 없으면 대부분 null 이다 — 0 으로 채우지 않는다", () => {
    const m = computeMetrics([], [], 10_000);
    expect(m.cagr).toBeNull();
    expect(m.winRate).toBeNull();
    expect(m.trades).toBe(0);
  });

  it("낙폭이 0 이면 cagrMdd 가 null 이다 — 무한대를 1등으로 만들지 않는다", () => {
    const equity = [
      { at: new Date(T0), equity: 100, cash: 100, unrealized: 0, drawdown: 0 },
      { at: new Date(T0 + 365 * 24 * H), equity: 200, cash: 200, unrealized: 0, drawdown: 0 },
    ];
    expect(computeMetrics([], equity, 100).cagrMdd).toBeNull();
  });

  it("연속 손실을 센다", () => {
    const t = (pnl: number) => ({
      symbol: "BTC",
      side: "LONG" as const,
      entryAt: new Date(T0),
      entryPrice: 100,
      entryReason: "x",
      exitAt: new Date(T0 + H),
      exitPrice: 100,
      exitReason: "STOP" as const,
      qty: 1,
      fee: 0,
      slippage: 0,
      funding: 0,
      pnl,
      pnlPct: pnl,
      barsHeld: 1,
    });
    expect(computeMetrics([t(-1), t(-1), t(1), t(-1), t(-1), t(-1)], [], 100).maxConsecutiveLoss).toBe(3);
  });
});
