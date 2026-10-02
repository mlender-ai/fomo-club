/**
 * TRADER-02 B-3 — 조건 하나하나의 값을 **봉마다** 낸다.
 *
 * 규칙 후보를 고를 때(파이썬 `scripts/trader`) 지표를 따로 다시 구현하면 후보 점수와 엔진 재생이
 * 서로 다른 것을 재게 된다. 그래서 **실행기가 쓰는 바로 그 `indicatorValue`** 를 같은 창 ·
 * 같은 고래 창으로 부른다. i 번째 값은 i 번째 봉이 **닫힌 뒤** 실행기가 보는 값과 같다
 * (그 신호로는 i+1 번째 봉 시가에 들어간다).
 */
import type { Condition } from "../strategy-definition";
import { indicatorValue, type ExternalContext } from "./conditions";
import { DEFAULT_MAX_WINDOW_BARS, whaleNetAt, type WhalePoint } from "./executor";
import type { Bar } from "./types";

const DEFAULT_WHALE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface FeatureSeriesInput {
  bars: readonly Bar[];
  specs: readonly Condition[];
  /** 봉 여는 시각(ms) → 고래 순포지션(USD). */
  whaleNet?: ReadonlyMap<number, number>;
  maxWindowBars?: number;
}

/** `specs[j]` 의 값 배열 j 개. 값은 봉 수만큼, 못 재면 null. */
export function featureSeries(input: FeatureSeriesInput): (number | null)[][] {
  const maxWindow = input.maxWindowBars ?? DEFAULT_MAX_WINDOW_BARS;
  const out = input.specs.map(() => [] as (number | null)[]);
  const history: WhalePoint[] = [];
  const window: Bar[] = [];
  for (const bar of input.bars) {
    window.push(bar);
    if (window.length > maxWindow) window.splice(0, window.length - maxWindow);
    const now = input.whaleNet?.get(bar.at.getTime()) ?? null;
    // 실행기와 같다: 봉이 2개 이상 쌓인 뒤부터 고래 이력을 쌓는다.
    if (now !== null && window.length >= 2) history.push({ at: bar.at, net: now });
    input.specs.forEach((spec, j) => {
      // 실행기와 같다: 봉이 2개 미만이면 평가하지 않는다.
      if (window.length < 2) {
        (out[j] as (number | null)[]).push(null);
        return;
      }
      const hours = spec.indicator === "whale_flow" && typeof spec.window_hours === "number" ? spec.window_hours : null;
      const windowMs = hours && hours > 0 ? hours * 60 * 60 * 1000 : DEFAULT_WHALE_WINDOW_MS;
      const context: ExternalContext = {
        whaleNetNow: now,
        whaleNetPast: whaleNetAt(history, bar.at.getTime() - windowMs),
      };
      (out[j] as (number | null)[]).push(indicatorValue(spec.indicator, spec as Record<string, unknown>, window, context));
    });
  }
  return out;
}
