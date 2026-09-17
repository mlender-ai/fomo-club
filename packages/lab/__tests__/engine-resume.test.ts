/**
 * LAB-07 완료확인 1·3·7 — **실행기를 새로 만들지 않았다.**
 *
 * 페이퍼는 같은 `execute()` 를 매 실행마다 **한 조각씩** 부른다. 그게 백테스트와
 * 같은 엔진이라는 주장인데, 주장만으로는 부족하다. 증명은 이거다:
 *
 * > 시계열을 **한 번에** 돌린 결과와, **여러 조각으로 나눠** 상태를 이어 돌린 결과가
 * > **완전히 같아야 한다.**
 *
 * 다르면 페이퍼 성과와 백테스트 성과를 비교할 수 없고, `LAB-07` PART G 의
 * "이 비교가 실매매 전 마지막 관문" 이 통째로 무의미해진다.
 *
 * 상태가 DB 를 오가며 JSON 이 되는 것도 같이 본다 — `Date` 가 문자열로 바뀌어
 * 돌아오는 것이 조용히 틀린 답을 내는 흔한 길이다.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXECUTOR,
  MultiSymbolSource,
  execute,
  reviveState,
  type Bar,
  type ExecutorState,
  type StrategyDefinition,
} from "../src";

const H = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

/** 결정론적 시계열. 종목마다 위상을 달리해 동시 보유가 실제로 겹치게 만든다. */
function series(n: number, phase: number): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const base = 100 + Math.sin((i + phase) / 9) * 14 + i * 0.04;
    const close = base * (i % 3 === 0 ? 1.005 : 0.997);
    return {
      at: new Date(T0 + i * H),
      open: base,
      high: Math.max(base, close) * 1.006,
      low: Math.min(base, close) * 0.994,
      close,
      volume: 900 + ((i * 7 + phase) % 13) * 60,
    };
  });
}

const SYMBOLS = ["BTC", "ETH", "SOL"] as const;
const N = 420;

function allBars(): Record<string, Bar[]> {
  return {
    BTC: series(N, 0),
    ETH: series(N, 5),
    SOL: series(N, 11),
  };
}

const DEFINITION: StrategyDefinition = {
  market: "crypto",
  universe: { type: "list", symbols: [...SYMBOLS] },
  entry: {
    all: [
      { indicator: "rsi", window: 14, max: 45 },
      { indicator: "pct_from_ma", window: 20, max: -1 },
    ],
  },
  exit: {
    stop_pct: -6,
    target_pct: 5,
    max_hold_days: 2,
    any: [{ indicator: "rsi", window: 14, min: 60 }],
  },
  sizing: { type: "risk_pct", risk_pct: 2 },
  leverage: 1,
  max_positions: 3,
};

const CONFIG = { ...DEFAULT_EXECUTOR, initialCapital: 10_000 };

function slice(bySymbol: Record<string, Bar[]>, from: number, to: number) {
  const out: Record<string, Bar[]> = {};
  for (const symbol of SYMBOLS) out[symbol] = (bySymbol[symbol] ?? []).slice(from, to);
  return out;
}

function runOnce(bySymbol: Record<string, Bar[]>, state?: ExecutorState) {
  return execute({
    definition: DEFINITION,
    source: new MultiSymbolSource({ bySymbol }),
    config: CONFIG,
    ...(state ? { state } : {}),
  });
}

/** 거래를 시각·가격·사유까지 지문으로 만든다. */
function tradeFingerprint(trades: readonly { entryAt: Date; entryPrice: number; exitAt: Date; exitPrice: number; exitReason: string; qty: number; symbol: string }[]) {
  return trades.map((t) =>
    [
      t.symbol,
      t.entryAt.toISOString(),
      t.entryPrice.toFixed(8),
      t.exitAt.toISOString(),
      t.exitPrice.toFixed(8),
      t.exitReason,
      t.qty.toFixed(8),
    ].join("|")
  );
}

function equityFingerprint(points: readonly { at: Date; equity: number }[]) {
  return points.map((p) => `${p.at.toISOString()}|${p.equity.toFixed(8)}`);
}

describe("완료확인 1 — 한 번에 돌린 것 == 나눠 돌린 것", () => {
  const bars = allBars();
  const whole = runOnce(bars);

  it("거래가 실제로 나야 검사가 의미가 있다", () => {
    expect(whole.trades.length).toBeGreaterThan(5);
  });

  it("동시 보유가 실제로 겹쳐야 다종목 상태까지 검사된다", () => {
    const symbols = new Set(whole.trades.map((t) => t.symbol));
    expect(symbols.size).toBeGreaterThan(1);
  });

  it("**조각으로 나눠 이어 돌려도 거래가 완전히 같다**", () => {
    let state: ExecutorState | undefined;
    const trades: typeof whole.trades = [];
    for (let from = 0; from < N; from += 60) {
      const result = runOnce(slice(bars, from, Math.min(from + 60, N)), state);
      trades.push(...result.trades);
      state = result.state;
    }
    expect(tradeFingerprint(trades)).toEqual(tradeFingerprint(whole.trades));
  });

  it("자산곡선도 완전히 같다", () => {
    let state: ExecutorState | undefined;
    const equity: typeof whole.equity = [];
    for (let from = 0; from < N; from += 60) {
      const result = runOnce(slice(bars, from, Math.min(from + 60, N)), state);
      equity.push(...result.equity);
      state = result.state;
    }
    expect(equityFingerprint(equity)).toEqual(equityFingerprint(whole.equity));
  });

  it("조각 크기를 바꿔도 같다 — 봉 하나씩 돌려도", () => {
    let state: ExecutorState | undefined;
    const trades: typeof whole.trades = [];
    for (let from = 0; from < N; from += 1) {
      const result = runOnce(slice(bars, from, from + 1), state);
      trades.push(...result.trades);
      state = result.state;
    }
    expect(tradeFingerprint(trades)).toEqual(tradeFingerprint(whole.trades));
  });
});

describe("상태가 JSON 을 오가도 같다 — DB 왕복 (PART B-1)", () => {
  const bars = allBars();
  const whole = runOnce(bars);

  it("**JSON 직렬화·복원을 끼워도 거래가 같다**", () => {
    let state: ExecutorState | undefined;
    const trades: typeof whole.trades = [];
    for (let from = 0; from < N; from += 45) {
      const result = runOnce(slice(bars, from, Math.min(from + 45, N)), state);
      trades.push(...result.trades);
      // DB 왕복을 흉내낸다.
      const revived = reviveState(JSON.parse(JSON.stringify(result.state)));
      expect(revived).not.toBeNull();
      state = revived ?? undefined;
    }
    expect(tradeFingerprint(trades)).toEqual(tradeFingerprint(whole.trades));
  });

  it("되살린 상태의 Date 가 진짜 Date 다 — 문자열이면 조용히 틀린다", () => {
    const result = runOnce(slice(bars, 0, 120));
    const revived = reviveState(JSON.parse(JSON.stringify(result.state)));
    expect(revived).not.toBeNull();
    for (const position of revived?.open ?? []) {
      expect(position.entryAt).toBeInstanceOf(Date);
      expect(Number.isNaN(position.entryAt.getTime())).toBe(false);
    }
    for (const window of Object.values(revived?.windows ?? {})) {
      for (const bar of window) expect(bar.at).toBeInstanceOf(Date);
    }
  });

  it("망가진 상태는 null 이다 — 억지로 이어 돌지 않는다", () => {
    expect(reviveState(null)).toBeNull();
    expect(reviveState("nope")).toBeNull();
    expect(reviveState({})).toBeNull();
  });
});

describe("상태 크기 — DB 에 쓸 만한가", () => {
  it("창이 상한을 넘지 않는다", () => {
    const result = runOnce(allBars());
    for (const window of Object.values(result.state.windows)) {
      expect(window.length).toBeLessThanOrEqual(500);
    }
  });

  it("직렬화 크기가 1MB 를 넘지 않는다", () => {
    const result = runOnce(allBars());
    const bytes = JSON.stringify(result.state).length;
    expect(bytes).toBeLessThan(1_000_000);
  });
});

describe("LAB-07 PART C — 시세가 끊기면 신규 진입을 막는다", () => {
  const bars = allBars();

  it("평소에는 진입한다", () => {
    expect(runOnce(bars).trades.length).toBeGreaterThan(0);
  });

  it("**blockNewEntries 면 새 거래가 하나도 없다**", () => {
    const blocked = execute({
      definition: DEFINITION,
      source: new MultiSymbolSource({ bySymbol: bars }),
      config: CONFIG,
      blockNewEntries: true,
    });
    expect(blocked.trades).toHaveLength(0);
    expect(blocked.blocked.feed_stale).toBeGreaterThan(0);
  });

  it("보유는 유지되고 **청산은 그대로 평가된다** — 끊긴 동안 손절을 넘었으면 나온다", () => {
    // 먼저 포지션을 만든 상태를 얻는다.
    const primed = runOnce(slice(bars, 0, 200));
    expect(primed.state.open.length).toBeGreaterThan(0);

    // 그 상태로 이어 돌리되 신규 진입만 막는다.
    const after = execute({
      definition: DEFINITION,
      source: new MultiSymbolSource({ bySymbol: slice(bars, 200, N) }),
      config: CONFIG,
      state: primed.state,
      blockNewEntries: true,
    });
    // 들고 있던 것은 청산돼 거래로 남는다 — 막힌 것은 진입뿐이다.
    expect(after.trades.length).toBeGreaterThan(0);
    expect(after.trades.length).toBeLessThanOrEqual(primed.state.open.length);
  });

  it("자본은 그대로다 — 막혔다고 돈이 사라지지 않는다", () => {
    const blocked = execute({
      definition: DEFINITION,
      source: new MultiSymbolSource({ bySymbol: bars }),
      config: CONFIG,
      blockNewEntries: true,
    });
    expect(blocked.state.cash).toBeCloseTo(CONFIG.initialCapital, 6);
  });
});
