import type {
  BelowRangeRecovery,
  DailyCandle,
  HigherLows,
  MaAlignment,
  RangeCompression,
  SupportTests,
  VolumeRatio,
  VolumeSpikeDays,
} from "../types";
import type { IndicatorWindows } from "../params/v1";

/**
 * §4 산출 지표 — 전부 순수 함수. 관측 사실만 낸다.
 *
 * **임계값을 상수로 박지 않는다.** 배수·허용오차 같은 값은 전부 인자로 받는다 —
 * §6 절차로 확정되기 전에 값이 코드로 새어들면 완료조건 3("근거 없는 임계값이 없다")이 깨진다.
 *
 * 산출 불가는 `null` 이다. 추정·보간하지 않는다.
 * 입력 `candles` 는 **날짜 오름차순**을 전제한다(마지막 원소가 최신).
 */

const avg = (xs: readonly number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

/** 뒤에서 `recent` 개, 그 앞 `prior` 개로 자른다. 둘 다 온전히 확보될 때만 값을 낸다. */
function split<T>(items: readonly T[], w: IndicatorWindows): { recent: T[]; prior: T[] } | null {
  if (w.recent <= 0 || w.prior <= 0) return null;
  if (items.length < w.recent + w.prior) return null;
  const recent = items.slice(items.length - w.recent);
  const prior = items.slice(items.length - w.recent - w.prior, items.length - w.recent);
  return { recent, prior };
}

/** ① 최근 N일 고저 폭 / 과거 M일 평균 폭. */
export function rangeCompression(candles: readonly DailyCandle[], w: IndicatorWindows): RangeCompression {
  const parts = split(candles, w);
  if (!parts) return { ratio: null, recentAvgRange: null, priorAvgRange: null };
  const recentAvgRange = avg(parts.recent.map((c) => c.high - c.low));
  const priorAvgRange = avg(parts.prior.map((c) => c.high - c.low));
  const ratio = recentAvgRange != null && priorAvgRange ? recentAvgRange / priorAvgRange : null;
  return { ratio, recentAvgRange, priorAvgRange };
}

/** ② 최근 N일 평균 거래량 / 과거 M일 평균. */
export function volumeRatio(candles: readonly DailyCandle[], w: IndicatorWindows): VolumeRatio {
  const parts = split(candles, w);
  if (!parts) return { ratio: null, recentAvgVolume: null, priorAvgVolume: null };
  const recentAvgVolume = avg(parts.recent.map((c) => c.volume));
  const priorAvgVolume = avg(parts.prior.map((c) => c.volume));
  const ratio = recentAvgVolume != null && priorAvgVolume ? recentAvgVolume / priorAvgVolume : null;
  return { ratio, recentAvgVolume, priorAvgVolume };
}

/**
 * ③ 평균 대비 임계 배수를 넘은 날 수와 날짜.
 * @param multiple 급증 판정 배수. **호출자가 준다** — §6 확정 전에는 확정값이 없다.
 */
export function volumeSpikeDays(
  candles: readonly DailyCandle[],
  w: IndicatorWindows,
  multiple: number
): VolumeSpikeDays {
  const parts = split(candles, w);
  if (!parts || !Number.isFinite(multiple)) return { count: 0, dates: [] };
  const base = avg(parts.prior.map((c) => c.volume));
  if (!base) return { count: 0, dates: [] };
  const dates = parts.recent.filter((c) => c.volume > base * multiple).map((c) => c.date);
  return { count: dates.length, dates };
}

/**
 * ④ 최근 N개 저점의 절상 여부.
 *
 * 스윙 저점 탐지는 피벗 파라미터를 새로 만들게 되므로, 최근 구간을 `segments` 등분해
 * **각 구간의 최저점**을 저점으로 본다. 결정론적이고 파라미터가 하나뿐이다.
 */
export function higherLows(
  candles: readonly DailyCandle[],
  lookback: number,
  segments: number
): HigherLows {
  if (segments < 2 || lookback < segments || candles.length < lookback) {
    return { isHigherLows: false, lows: [] };
  }
  const window = candles.slice(candles.length - lookback);
  const size = Math.floor(window.length / segments);
  const lows: Array<{ date: string; low: number }> = [];
  for (let i = 0; i < segments; i += 1) {
    const chunk = i === segments - 1 ? window.slice(i * size) : window.slice(i * size, (i + 1) * size);
    if (chunk.length === 0) return { isHigherLows: false, lows: [] };
    const min = chunk.reduce((a, b) => (b.low < a.low ? b : a));
    lows.push({ date: min.date, low: min.low });
  }
  const isHigherLows = lows.every((point, i) => i === 0 || point.low > lows[i - 1]!.low);
  return { isHigherLows, lows };
}

/**
 * ⑤ 특정 가격대 재접근 횟수. 기준 가격대는 구간 최저가로 잡는다.
 * @param tolerancePct 재접근으로 볼 허용 범위(%). **호출자가 준다.**
 */
export function supportTests(
  candles: readonly DailyCandle[],
  lookback: number,
  tolerancePct: number
): SupportTests {
  if (candles.length < lookback || lookback <= 0 || !Number.isFinite(tolerancePct)) {
    return { count: 0, level: null, dates: [] };
  }
  const window = candles.slice(candles.length - lookback);
  const level = Math.min(...window.map((c) => c.low));
  if (!Number.isFinite(level) || level <= 0) return { count: 0, level: null, dates: [] };
  const ceiling = level * (1 + tolerancePct / 100);
  const dates = window.filter((c) => c.low <= ceiling).map((c) => c.date);
  return { count: dates.length, level, dates };
}

/**
 * ⑥ 하단 이탈 후 되돌아온 사례 (날짜·깊이·회복일수).
 * 하단은 **과거 구간의 최저가**로 잡고, 최근 구간에서 그 아래로 내려간 날을 찾는다.
 */
export function belowRangeRecovery(
  candles: readonly DailyCandle[],
  w: IndicatorWindows
): BelowRangeRecovery {
  const parts = split(candles, w);
  if (!parts) return { events: [] };
  const floor = Math.min(...parts.prior.map((c) => c.low));
  if (!Number.isFinite(floor) || floor <= 0) return { events: [] };

  const events: BelowRangeRecovery["events"] = [];
  let open: { date: string; depthPct: number; index: number } | null = null;
  parts.recent.forEach((candle, index) => {
    if (candle.low < floor) {
      const depthPct = ((floor - candle.low) / floor) * 100;
      // 이탈이 이어지는 동안은 가장 깊은 지점을 유지한다.
      if (!open || depthPct > open.depthPct) open = { date: candle.date, depthPct, index };
      return;
    }
    // 종가가 하단 위로 돌아오면 회복. 회복하지 못한 이탈은 사례로 세지 않는다.
    if (open && candle.close >= floor) {
      events.push({ date: open.date, depthPct: open.depthPct, recoveryDays: index - open.index });
      open = null;
    }
  });
  return { events };
}

/** ⑦ 현재가의 최근 N일 레인지 내 백분위 0~100. */
export function positionInRange(candles: readonly DailyCandle[], lookback: number): number | null {
  if (lookback <= 0 || candles.length < lookback) return null;
  const window = candles.slice(candles.length - lookback);
  const low = Math.min(...window.map((c) => c.low));
  const high = Math.max(...window.map((c) => c.high));
  if (!Number.isFinite(low) || !Number.isFinite(high) || high === low) return null;
  const close = window[window.length - 1]!.close;
  return ((close - low) / (high - low)) * 100;
}

/** ⑧ 52주 고점 대비 낙폭 %. 고점 아래면 음수. */
export function drawdownFromHigh(candles: readonly DailyCandle[], lookback: number): number | null {
  if (lookback <= 0 || candles.length < lookback) return null;
  const window = candles.slice(candles.length - lookback);
  const high = Math.max(...window.map((c) => c.high));
  if (!Number.isFinite(high) || high <= 0) return null;
  const close = window[window.length - 1]!.close;
  return ((close - high) / high) * 100;
}

/** ⑨ 52주 고점 이후 경과 거래일. 고점이 오늘이면 0. */
export function daysSinceHigh(candles: readonly DailyCandle[], lookback: number): number | null {
  if (lookback <= 0 || candles.length < lookback) return null;
  const window = candles.slice(candles.length - lookback);
  let peak = 0;
  for (let i = 1; i < window.length; i += 1) {
    if (window[i]!.high > window[peak]!.high) peak = i;
  }
  return window.length - 1 - peak;
}

const sma = (candles: readonly DailyCandle[], period: number): number | null => {
  if (period <= 0 || candles.length < period) return null;
  return avg(candles.slice(candles.length - period).map((c) => c.close));
};

/** ⑩ 20/60/120일선 배열 상태. 화면에는 이 값을 그대로 쓰지 않고 일상어로 바꾼다. */
export function maAlignment(candles: readonly DailyCandle[]): MaAlignment {
  const ma20 = sma(candles, 20);
  const ma60 = sma(candles, 60);
  const ma120 = sma(candles, 120);
  if (ma20 == null || ma60 == null || ma120 == null) return null;
  if (ma20 > ma60 && ma60 > ma120) return "상승정렬";
  if (ma20 < ma60 && ma60 < ma120) return "하락정렬";
  return "혼조";
}
