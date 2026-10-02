/**
 * TRADER-02 D-1 — 스키마 확장(방향 · 분할 청산 · 추적 손절 · 본절 · 쉬기 · 시간봉 조건).
 * **새 키가 없으면 예전과 똑같이 돈다** — 그건 기존 시험 165개가 지킨다. 여기는 새 키의 뜻을 본다.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXECUTOR,
  DEFAULT_FILL,
  HistoricalSource,
  evaluateGroup,
  execute,
  featureSeries,
  hourUtc,
  indicatorValue,
  ma,
  parseStrategyDefinition,
  resample,
  reviveState,
  scaleOutEvents,
  type Bar,
  type OpenPosition,
  type StrategyDefinition,
} from "../src";

const H = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

function bar(i: number, close: number, over: Partial<Bar> = {}): Bar {
  return { at: new Date(T0 + i * H), open: close, high: close, low: close, close, volume: 1_000_000, ...over };
}

function def(over: Partial<StrategyDefinition> = {}): StrategyDefinition {
  return {
    market: "crypto",
    universe: { type: "list", symbols: ["BTC"] },
    entry: { all: [{ indicator: "consecutive", min: -999 }] },
    exit: { stop_pct: -10, target_pct: null, max_hold_days: null },
    sizing: { type: "fixed_pct", fixed_pct: 50 },
    leverage: 1,
    max_positions: 1,
    ...over,
  };
}

const CLEAN = {
  ...DEFAULT_EXECUTOR,
  initialCapital: 100_000,
  fill: { ...DEFAULT_FILL, takerFeeRate: 0, minSlippageBps: 0, impactBps: 0 },
  reentryLock: "off" as const,
};

function run(bars: Bar[], definition: StrategyDefinition) {
  return execute({ definition, source: new HistoricalSource({ symbol: "BTC", bars }), config: CLEAN });
}

describe("스키마", () => {
  it("예전 정의는 모양이 그대로다 — 새 키를 끼워 넣지 않는다", () => {
    const r = parseStrategyDefinition(def());
    expect(r.ok && Object.keys(r.definition).sort()).toEqual(
      ["entry", "exit", "leverage", "market", "max_positions", "sizing", "universe"].sort()
    );
  });

  it("분할 청산 · 쉬기 · 양방향이 통과한다", () => {
    const r = parseStrategyDefinition(
      def({
        side: "both",
        entry_short: { all: [{ indicator: "rsi", min: 70, tf: "4h" }] },
        exit: {
          stop_pct: -2,
          target_pct: null,
          scale_out: [
            { at_pct: 3, size: 0.5 },
            { trail: { pct: 1.5, activate_pct: 3 }, size: 0.5 },
          ],
          breakeven_after_first: true,
        },
        pause: { after_consecutive_losses: 3, minutes: 120 },
      })
    );
    expect(r.ok).toBe(true);
  });

  it.each([
    ["다리 합이 1 이 아니면", { scale_out: [{ at_pct: 3, size: 0.4 }] }, "exit.scale_out"],
    ["scale_out 과 target_pct 가 같이 있으면", { target_pct: 5, scale_out: [{ at_pct: 3, size: 1 }] }, "exit.target_pct"],
    ["추적 다리가 끝이 아니면", { scale_out: [{ trail: { pct: 1 }, size: 0.5 }, { at_pct: 3, size: 0.5 }] }, "exit.scale_out[0]"],
    ["목표가 커지는 순서가 아니면", { scale_out: [{ at_pct: 5, size: 0.5 }, { at_pct: 3, size: 0.5 }] }, "exit.scale_out[1].at_pct"],
  ])("거부: %s", (_name, exitOver, path) => {
    const r = parseStrategyDefinition(def({ exit: { stop_pct: -2, target_pct: null, ...(exitOver as object) } }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.map((e) => e.path)).toContain(path);
  });

  it("both 인데 entry_short 가 없으면 · both 가 아닌데 있으면 거부", () => {
    const a = parseStrategyDefinition(def({ side: "both" }));
    expect(!a.ok && a.errors.map((e) => e.path)).toContain("entry_short");
    const b = parseStrategyDefinition(def({ entry_short: { all: [{ indicator: "rsi" }] } }));
    expect(!b.ok && b.errors.map((e) => e.path)).toContain("entry_short");
  });

  it("쉬기 값이 이상하면 거부", () => {
    const r = parseStrategyDefinition(def({ pause: { after_consecutive_losses: 0, minutes: -1 } }));
    expect(!r.ok && r.errors.map((e) => e.path).sort()).toEqual(["pause.after_consecutive_losses", "pause.minutes"]);
  });
});

describe("시간봉 조건 `tf`", () => {
  const bars = Array.from({ length: 48 }, (_, i) => bar(i, 100 + i));

  it("1시간봉을 4시간봉으로 묶는다 — 마지막 묶음은 지금 봉까지", () => {
    const four = resample(bars.slice(0, 10), 4 * H);
    expect(four.map((b) => b.close)).toEqual([103, 107, 109]);
    expect(four[2]?.open).toBe(108);
  });

  it("4시간 이평 = 묶은 봉의 이평", () => {
    const value = indicatorValue("ma", { indicator: "ma", period: 3, tf: "4h" }, bars, { whaleNetNow: null, whaleNetPast: null });
    expect(value).toBe(ma(resample(bars, 4 * H), 3));
  });

  it("모르는 시간봉은 null — 조용히 기본 봉으로 돌지 않는다", () => {
    expect(indicatorValue("ma", { indicator: "ma", period: 3, tf: "3h" }, bars, { whaleNetNow: null, whaleNetPast: null })).toBeNull();
  });

  it("hour_utc 는 지금 봉이 닫힌 시각", () => {
    expect(hourUtc(bars.slice(0, 2))).toBe(2);
    expect(hourUtc(bars.slice(0, 1))).toBeNull();
  });

  it("whale_net 은 지금 순포지션", () => {
    expect(evaluateGroup({ all: [{ indicator: "whale_net", min: 0 }] }, bars, { whaleNetNow: 5, whaleNetPast: null })).toBe(true);
    expect(evaluateGroup({ all: [{ indicator: "whale_net", min: 0 }] }, bars, { whaleNetNow: null, whaleNetPast: null })).toBe(false);
  });
});

describe("방향", () => {
  it("side short — 내리면 번다", () => {
    const bars = [bar(0, 100), bar(1, 100), bar(2, 100), bar(3, 90), bar(4, 90)];
    const r = run(bars, def({ side: "short", exit: { stop_pct: -50, target_pct: 5, max_hold_days: null } }));
    const t = r.trades[0];
    expect(t?.side).toBe("SHORT");
    expect(t?.exitReason).toBe("TARGET");
    expect(t?.pnl).toBeGreaterThan(0);
    expect(t?.entryReason.startsWith("short:")).toBe(true);
  });

  it("side both — 롱 조건이 거짓이면 숏 조건을 본다", () => {
    const bars = [bar(0, 100), bar(1, 99), bar(2, 98), bar(3, 97), bar(4, 96)];
    const r = run(
      bars,
      def({
        side: "both",
        entry: { all: [{ indicator: "consecutive", min: 1 }] },
        entry_short: { all: [{ indicator: "consecutive", max: -1 }] },
      })
    );
    expect(r.state.open[0]?.side).toBe("SHORT");
  });
});

describe("분할 청산", () => {
  const exit = {
    stop_pct: -5,
    target_pct: null,
    scale_out: [
      { at_pct: 2, size: 0.5 },
      { trail: { pct: 1 }, size: 0.5 },
    ],
  };

  it("반은 +2% 에서 팔고 나머지는 고점에서 1% 밀릴 때 판다", () => {
    // 2봉째 신호 → 3봉째 시가 100 진입. 102 에서 반, 고점 105 뒤 103.95 에서 나머지.
    const bars = [
      bar(0, 100),
      bar(1, 100),
      bar(2, 100),
      bar(3, 102, { open: 100, high: 102, low: 100 }),
      bar(4, 105, { open: 102, high: 105, low: 102 }),
      bar(5, 103, { open: 105, high: 105, low: 103 }),
    ];
    const r = run(bars, def({ exit }));
    const t = r.trades[0];
    expect(t?.legs?.map((l) => [l.kind, Number(l.price.toFixed(4))])).toEqual([
      ["SCALE_OUT", 102],
      ["TRAIL", 103.95],
    ]);
    expect(t?.exitReason).toBe("STOP");
    // 반은 +2%, 반은 +3.95% — 합친 손익이 다리 합과 같고 현금과도 맞는다.
    expect(t?.pnl).toBeCloseTo(t!.qty * 0.5 * 2 + t!.qty * 0.5 * 3.95, 6);
    expect(r.state.cash).toBeCloseTo(100_000 + t!.pnl, 6);
  });

  it("같은 봉에서 손절과 목표가 다 닿으면 손절 — 보수적으로", () => {
    const position = {
      symbol: "BTC",
      side: "LONG",
      entryAt: new Date(T0),
      entryPrice: 100,
      entryReason: "x",
      qty: 10,
      stopPrice: 95,
      targetPrice: null,
      entryCost: 0,
      funding: 0,
      maxHoldBars: null,
      barsHeld: 0,
      exitSignalPending: false,
      initialQty: 10,
      legDone: [false, false],
      peak: 100,
    } as OpenPosition;
    const events = scaleOutEvents(position, bar(1, 100, { open: 100, high: 103, low: 94 }), exit);
    expect(events).toEqual([{ reason: "STOP", kind: "STOP", price: 95, qty: 10, leg: null }]);
  });

  it("본절 — 첫 분할 뒤 되밀리면 진입가에서 나온다", () => {
    const bars = [
      bar(0, 100),
      bar(1, 100),
      bar(2, 100),
      bar(3, 102, { open: 100, high: 102, low: 100 }),
      bar(4, 99, { open: 101, high: 101, low: 99 }),
    ];
    const r = run(bars, def({ exit: { ...exit, scale_out: [{ at_pct: 2, size: 0.5 }, { at_pct: 10, size: 0.5 }], breakeven_after_first: true } }));
    expect(r.trades[0]?.legs?.map((l) => [l.kind, l.price])).toEqual([
      ["SCALE_OUT", 102],
      ["STOP", 100],
    ]);
  });

  it("나눠 돌려도 한 번에 돈 것과 같다 — 페이퍼 재시작", () => {
    const bars = Array.from({ length: 40 }, (_, i) => {
      const c = 100 + 6 * Math.sin(i / 3);
      return bar(i, c, { open: c - 0.5, high: c + 1.5, low: c - 1.5 });
    });
    const d = def({ exit });
    const whole = run(bars, d);
    const first = run(bars.slice(0, 17), d);
    const state = reviveState(JSON.parse(JSON.stringify(first.state)));
    const rest = execute({ definition: d, source: new HistoricalSource({ symbol: "BTC", bars: bars.slice(17) }), config: CLEAN, state: state! });
    const pnl = (ts: { pnl: number }[]) => ts.map((t) => t.pnl.toFixed(6));
    expect(pnl([...first.trades, ...rest.trades])).toEqual(pnl(whole.trades));
  });
});

describe("쉬기", () => {
  it("연속 손실 2번이면 그 뒤 진입을 막는다", () => {
    // 매 봉 진입 → 다음 봉에 손절. 2연패 뒤 120분(2봉)은 들어가지 않는다.
    const bars = Array.from({ length: 14 }, (_, i) => bar(i, 100, { open: 100, high: 100, low: i >= 3 ? 80 : 100 }));
    const base = run(bars, def({ exit: { stop_pct: -10, target_pct: null } }));
    const paused = run(bars, def({ exit: { stop_pct: -10, target_pct: null }, pause: { after_consecutive_losses: 2, minutes: 120 } }));
    expect(paused.blocked.pause).toBeGreaterThan(0);
    expect(paused.trades.length).toBeLessThan(base.trades.length);
    expect(paused.state.consecutiveLosses).toBeLessThan(2);
  });
});

describe("featureSeries — 실행기와 같은 값을 낸다", () => {
  it("조건이 참인 봉 = 실행기가 신호를 낸 봉", () => {
    const bars = Array.from({ length: 30 }, (_, i) => bar(i, 100 + 5 * Math.sin(i / 2)));
    const cond = { indicator: "rsi", period: 5, max: 40 };
    const [values] = featureSeries({ bars, specs: [cond] });
    const fired = values!.map((v, i) => (v !== null && v <= 40 ? i : -1)).filter((i) => i >= 0);
    const r = run(bars, def({ entry: { all: [cond] }, exit: { stop_pct: -50, target_pct: null, max_hold_days: 1 / 24 } }));
    // 신호 봉 i → i+1 봉 시가 진입. 보유 중엔 신호를 안 본다 → 진입 시각은 신호 봉 + 1 의 부분집합.
    const entries = r.trades.map((t) => (t.entryAt.getTime() - T0) / H);
    for (const e of entries) expect(fired).toContain(e - 1);
  });
});
