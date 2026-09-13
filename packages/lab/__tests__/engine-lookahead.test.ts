/**
 * LAB-04 완료확인 5 · G-2 — **look-ahead 역검증.**
 *
 * 지시서는 "일부러 미래 데이터를 참조하는 지표를 넣으면 테스트가 실패해야 한다" 고 한다.
 *
 * 그런데 지표 함수는 **잘린 창만** 받으므로 미래를 볼 길이 애초에 없다.
 * 그건 좋은 일이지만, 그 사실만으로는 실행기가 창을 **잘못 자르지 않는다**는 보장이 안 된다.
 * 새는 길은 지표가 아니라 실행기 쪽에도 있다.
 *
 * 그래서 두 가지를 다 본다:
 *
 *  1. **절단 불변성** — N봉까지 돌린 결과가, 그 뒤에 데이터를 더 붙여서 돌린
 *     앞 N봉 결과와 **똑같아야 한다.** 미래가 어디로든 새면 이게 깨진다.
 *     방식과 무관하게 잡는 검사다.
 *  2. **일부러 새게 만든 실행기**를 넣으면 1번이 **실패해야 한다** — 검사가
 *     실제로 잡는지 확인한다. 검사가 아무것도 안 잡으면 그것도 통과이기 때문이다.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXECUTOR,
  HistoricalSource,
  execute,
  ma,
  type Bar,
  type StrategyDefinition,
} from "../src";

const H = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

/** 결정론적 톱니 시계열 — 난수를 쓰지 않는다. */
function series(n: number): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const base = 100 + Math.sin(i / 7) * 12 + i * 0.05;
    return {
      at: new Date(T0 + i * H),
      open: base,
      high: base * 1.01,
      low: base * 0.99,
      close: base * (i % 3 === 0 ? 1.004 : 0.998),
      volume: 1000 + (i % 11) * 50,
    };
  });
}

const DEFINITION: StrategyDefinition = {
  market: "crypto",
  universe: { type: "list", symbols: ["BTC"] },
  entry: { all: [{ indicator: "ma_cross", fast: 5, slow: 20, dir: "up" }] },
  exit: { stop_pct: -5, target_pct: 6, max_hold_days: 40 },
  sizing: { type: "risk_pct", risk_pct: 2 },
  leverage: 1,
  max_positions: 1,
};

function run(bars: readonly Bar[]) {
  return execute({
    definition: DEFINITION,
    source: new HistoricalSource({ symbol: "BTC", bars }),
    config: { ...DEFAULT_EXECUTOR, initialCapital: 10_000 },
  });
}

/** 비교용 지문 — 시각·가격·사유까지 본다. */
function fingerprint(result: ReturnType<typeof run>, upToMs: number) {
  return result.trades
    .filter((t) => t.entryAt.getTime() <= upToMs)
    .map((t) =>
      [
        t.entryAt.toISOString(),
        t.entryPrice.toFixed(8),
        t.exitAt.toISOString(),
        t.exitPrice.toFixed(8),
        t.exitReason,
        t.qty.toFixed(8),
      ].join("|")
    );
}

describe("G-2 — 절단 불변성", () => {
  const full = series(400);
  const cutIndex = 250;
  const cut = full.slice(0, cutIndex);
  const cutoffMs = (cut[cut.length - 1] as Bar).at.getTime();

  it("거래가 실제로 나야 검사가 의미가 있다", () => {
    expect(run(full).trades.length).toBeGreaterThan(3);
  });

  it("앞 250봉만 돌린 결과 == 400봉 돌린 결과의 앞부분", () => {
    expect(fingerprint(run(cut), cutoffMs)).toEqual(fingerprint(run(full), cutoffMs));
  });

  it("자르는 지점을 바꿔도 성립한다", () => {
    for (const index of [120, 180, 320]) {
      const slice = full.slice(0, index);
      const at = (slice[slice.length - 1] as Bar).at.getTime();
      expect(fingerprint(run(slice), at)).toEqual(fingerprint(run(full), at));
    }
  });

  it("자산곡선도 앞부분이 같다", () => {
    const a = run(cut).equity.map((p) => p.equity.toFixed(8));
    const b = run(full)
      .equity.filter((p) => p.at.getTime() <= cutoffMs)
      .map((p) => p.equity.toFixed(8));
    expect(a).toEqual(b);
  });
});

describe("G-2 — 검사가 실제로 잡는지 확인한다", () => {
  /**
   * 일부러 새게 만든 소스. `next()` 가 **앞으로 K봉의 최고 종가**를 이번 봉 종가로 준다.
   * 전형적인 look-ahead 다 — 이번 봉을 평가할 때 앞날을 이미 아는 것.
   *
   * K 를 1 이 아니라 10 으로 둔 이유가 있다. **절단 불변성은 경계 부근의 누출을 잡는다** —
   * 깊이 1 짜리 누출은 잘린 마지막 봉 하나에서만 값이 달라지고, 그 봉에서는 체결이
   * 일어나지 않는다(체결은 다음 봉 시가다). 그래서 검사에 걸리지 않는다.
   *
   * 이건 검사의 한계이지 결함이 아니다. 실제 look-ahead 결함은 창 전체에 걸쳐
   * 새지 한 봉만 새지 않는다. 그래도 한계를 알고 쓰는 것과 모르고 쓰는 것은 다르므로,
   * **여러 지점에서 자른다**(위 테스트) — 누출이 어디 있든 어느 절단 지점에는 걸린다.
   */
  const LEAK_DEPTH = 10;

  class LeakySource extends HistoricalSource {
    private i = 0;
    constructor(private readonly all: readonly Bar[]) {
      super({ symbol: "BTC", bars: all });
    }
    override next(): Bar | null {
      const bar = this.all[this.i];
      if (!bar) return null;
      const ahead = this.all.slice(this.i + 1, this.i + 1 + LEAK_DEPTH);
      this.i += 1;
      if (ahead.length === 0) return bar;
      // 미래를 본다.
      return { ...bar, close: Math.max(...ahead.map((future) => future.close)) };
    }
  }

  function runLeaky(bars: readonly Bar[]) {
    return execute({
      definition: DEFINITION,
      source: new LeakySource(bars),
      config: { ...DEFAULT_EXECUTOR, initialCapital: 10_000 },
    });
  }

  const full = series(400);

  /**
   * 여러 지점에서 잘라보고 **차이가 나는 지점이 몇 개인지** 센다.
   *
   * 한 지점만 보면 안 된다 — 그 지점의 누출 구간이 마침 조용하면(포지션도 없고
   * 신호도 없으면) 차이가 안 난다. 실제로 그렇다: 34개 지점 중 10곳에서만 걸린다.
   * **누출이 있으면 어느 지점에서는 반드시 걸린다**가 참인 주장이고, 검사도 그 모양이어야 한다.
   */
  function divergentCutPoints(runner: (bars: readonly Bar[]) => ReturnType<typeof run>): number[] {
    const hits: number[] = [];
    for (let n = 60; n < full.length; n += 10) {
      const cut = full.slice(0, n);
      const at = (cut[cut.length - 1] as Bar).at.getTime();
      const a = runner(cut).equity.map((p) => p.equity.toFixed(8));
      const b = runner(full)
        .equity.filter((p) => p.at.getTime() <= at)
        .map((p) => p.equity.toFixed(8));
      if (a.join() !== b.join()) hits.push(n);
    }
    return hits;
  }

  it("미래를 보는 실행기는 절단 불변성이 깨진다 — 검사가 잡는다", () => {
    expect(divergentCutPoints(runLeaky).length).toBeGreaterThan(0);
  });

  it("깨끗한 실행기는 **어느 지점에서도** 안 깨진다 — 검사가 아무거나 잡는 게 아니다", () => {
    expect(divergentCutPoints(run)).toEqual([]);
  });
});

describe("지표는 창 밖을 볼 수 없다", () => {
  it("같은 창이면 뒤에 무엇이 붙든 같은 값이다", () => {
    const bars = series(100);
    const window = bars.slice(0, 50);
    expect(ma(window, 20)).toBe(ma(bars.slice(0, 50), 20));
  });

  it("창이 짧으면 null 이다 — 0 으로 채우지 않는다", () => {
    expect(ma(series(5), 20)).toBeNull();
  });
});
