/**
 * LAB-04 PART C — 지표 7종.
 *
 * ## look-ahead 를 구조로 막는다 (PART C-2 · 완료확인 5)
 *
 * 모든 지표는 **`window` 하나만 받는다.** `window` 는 현재 봉까지 잘라낸 배열이고,
 * 마지막 원소가 **지금 평가 중인 봉**이다. 전체 배열과 인덱스를 받지 않는다.
 *
 * > 배열과 인덱스를 받으면 `series[i + 1]` 을 쓸 수 있다. 한 번만 실수하면
 * > 백테스트 전체가 거짓이 되고, 그 거짓은 성적이 좋아지는 쪽으로만 생긴다.
 * > **쓸 수 없게 만드는 것이 규율보다 싸다.**
 *
 * 구조로 막아도 새는 길은 남는다(실행기가 잘못 자를 수 있다). 그래서
 * `executor.test.ts` 가 **절단 불변성**을 검사한다 — N봉까지의 판단이 그 뒤 데이터를
 * 붙여도 똑같아야 한다. 어떤 방식으로 새든 그 테스트가 잡는다.
 *
 * 전부 순수 함수다. 같은 입력 → 같은 출력.
 */
import type { Bar } from "./types";

/** 계산할 수 없으면 `null` 이다. **0 으로 채우지 않는다** — 0 은 값이다. */
export type IndicatorValue = number | null;

/** 현재 봉까지 잘린 창. 마지막 원소가 지금 봉이다. */
export type Window = readonly Bar[];

function closes(window: Window): number[] {
  return window.map((bar) => bar.close);
}

function lastN<T>(items: readonly T[], n: number): T[] | null {
  if (n <= 0 || items.length < n) return null;
  return items.slice(items.length - n);
}

// ─────────────────────────────────────────────────────────────────────────────
// ma · ma_cross — 추세
// ─────────────────────────────────────────────────────────────────────────────

/** 단순이동평균. 봉이 `period` 개 미만이면 null. */
export function ma(window: Window, period: number): IndicatorValue {
  const slice = lastN(closes(window), period);
  if (!slice) return null;
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

/**
 * 이동평균 교차. `1` = 골든(빠른 게 느린 것을 위로 통과), `-1` = 데드, `0` = 교차 없음.
 *
 * **직전 봉과 비교해서 판정한다.** 단순히 "빠른 게 위에 있다" 가 아니다 —
 * 그러면 추세 내내 매 봉이 신호가 된다.
 */
export function maCross(window: Window, fast: number, slow: number): IndicatorValue {
  if (fast >= slow) return null;
  const now = { fast: ma(window, fast), slow: ma(window, slow) };
  const prevWindow = window.slice(0, -1);
  const prev = { fast: ma(prevWindow, fast), slow: ma(prevWindow, slow) };
  if (now.fast === null || now.slow === null || prev.fast === null || prev.slow === null) {
    return null;
  }
  if (prev.fast <= prev.slow && now.fast > now.slow) return 1;
  if (prev.fast >= prev.slow && now.fast < now.slow) return -1;
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// rsi — 과열·과매도
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RSI. 와일더 평활이 아니라 **단순평균** 방식이다.
 *
 * 와일더는 시계열 전체를 거슬러 올라가며 상태를 이어받는다. 그러면 같은 창을
 * 넣어도 그 앞에 뭐가 있었는지에 따라 값이 달라져 **순수 함수가 아니게 된다.**
 * 백테스트와 페이퍼가 같은 값을 내야 하므로 창만 보고 계산한다.
 */
export function rsi(window: Window, period = 14): IndicatorValue {
  const values = closes(window);
  const slice = lastN(values, period + 1);
  if (!slice) return null;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i < slice.length; i += 1) {
    const prev = slice[i - 1];
    const cur = slice[i];
    if (prev === undefined || cur === undefined) return null;
    const delta = cur - prev;
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  // 손실이 하나도 없으면 RS 가 무한대다. 100 이 정의값이다.
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ─────────────────────────────────────────────────────────────────────────────
// atr — 변동성 · 사이징
// ─────────────────────────────────────────────────────────────────────────────

/** True Range. 전 봉 종가를 쓰므로 창의 첫 봉에서는 고저폭만 본다. */
function trueRange(bar: Bar, prevClose: number | null): number {
  const highLow = bar.high - bar.low;
  if (prevClose === null) return highLow;
  return Math.max(highLow, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
}

/** ATR. RSI 와 같은 이유로 단순평균이다. */
export function atr(window: Window, period = 14): IndicatorValue {
  const slice = lastN(window, period + 1);
  if (!slice) return null;
  let sum = 0;
  for (let i = 1; i < slice.length; i += 1) {
    const bar = slice[i];
    const prev = slice[i - 1];
    if (!bar || !prev) return null;
    sum += trueRange(bar, prev.close);
  }
  return sum / period;
}

// ─────────────────────────────────────────────────────────────────────────────
// volume_ratio — 거래량 비율
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 현재 봉 거래량 / 직전 `period` 봉 평균.
 *
 * **현재 봉을 평균에 넣지 않는다.** 넣으면 자기 자신이 분모에 섞여 비율이 눌린다 —
 * 거래량이 10배 튄 봉도 평균을 끌어올려서 비율이 작아진다.
 */
export function volumeRatio(window: Window, period = 20): IndicatorValue {
  const current = window[window.length - 1];
  if (!current) return null;
  const past = lastN(window.slice(0, -1), period);
  if (!past) return null;
  const avg = past.reduce((sum, bar) => sum + bar.volume, 0) / past.length;
  if (avg <= 0) return null;
  return current.volume / avg;
}

// ─────────────────────────────────────────────────────────────────────────────
// pct_from_high · pct_from_low — 위치
// ─────────────────────────────────────────────────────────────────────────────

/** 최근 `period` 봉 고점 대비 현재 종가 위치(%). 고점이면 0, 아래면 음수. */
export function pctFromHigh(window: Window, period = 20): IndicatorValue {
  const slice = lastN(window, period);
  const current = window[window.length - 1];
  if (!slice || !current) return null;
  const high = Math.max(...slice.map((bar) => bar.high));
  if (!(high > 0)) return null;
  return ((current.close - high) / high) * 100;
}

/** 최근 `period` 봉 저점 대비 현재 종가 위치(%). 저점이면 0, 위면 양수. */
export function pctFromLow(window: Window, period = 20): IndicatorValue {
  const slice = lastN(window, period);
  const current = window[window.length - 1];
  if (!slice || !current) return null;
  const low = Math.min(...slice.map((bar) => bar.low));
  if (!(low > 0)) return null;
  return ((current.close - low) / low) * 100;
}

/**
 * 이동평균 대비 현재 종가 위치(%). 평균 위면 양수, 아래면 음수.
 *
 * `pct_from_high` 는 최근 고점 기준이라 상승장에서 늘 음수다. 평균 대비가
 * **평균회귀 전략의 진입 조건**으로 맞다 — "평소보다 얼마나 싼가" 를 재기 때문이다.
 * (LAB-06 PART C 가 `pct_from_ma` 를 쓴다.)
 */
export function pctFromMa(window: Window, period = 20): IndicatorValue {
  const average = ma(window, period);
  const current = window[window.length - 1];
  if (average === null || !current || !(average > 0)) return null;
  return ((current.close - average) / average) * 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// consecutive — 연속 조건
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 연속 상승/하락 봉 수. 양수면 상승 연속, 음수면 하락 연속, 0 이면 보합.
 *
 * 종가 기준이다. 마지막 봉부터 거슬러 올라가며 방향이 바뀌면 멈춘다.
 */
export function consecutive(window: Window): IndicatorValue {
  if (window.length < 2) return null;
  let count = 0;
  let direction = 0;
  for (let i = window.length - 1; i >= 1; i -= 1) {
    const cur = window[i];
    const prev = window[i - 1];
    if (!cur || !prev) break;
    const step = cur.close > prev.close ? 1 : cur.close < prev.close ? -1 : 0;
    if (step === 0) break;
    if (direction === 0) direction = step;
    else if (step !== direction) break;
    count += 1;
  }
  return direction * count;
}

// ─────────────────────────────────────────────────────────────────────────────
// whale_flow — 고래 순포지션 변화
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 고래 순포지션 **변화량(USD)**. 양수면 롱이 늘어난 것이다.
 *
 * 처음엔 변화율(%)을 냈는데 지시서(LAB-06 PART D)가 `min_usd` 로 임계를 건다.
 * 비율은 기준이 작을 때 폭발한다 — 순포지션이 1만 달러에서 2만 달러가 되면
 * +100% 지만 **고래가 움직인 게 아니다.** 금액으로 재야 임계가 뜻을 갖는다.
 *
 * 값은 실행기가 `DataSource.whaleNet` 으로 넣어준다. 고래 데이터는 봉이 아니라
 * 스냅샷이라 창에서 뽑을 수 없다. 데이터가 없으면 null 이고,
 * **null 인 조건은 통과하지 않는다** — 모르는 것을 "참" 으로 만들지 않는다.
 */
export function whaleFlow(current: number | null, past: number | null): IndicatorValue {
  if (current === null || past === null) return null;
  return current - past;
}

/** 지표 이름 → 구현. 전략 정의는 **이름으로만** 참조한다(LAB-02 PART B-1). */
export const INDICATOR_NAMES = [
  "ma",
  "ma_cross",
  "rsi",
  "atr",
  "volume_ratio",
  "pct_from_high",
  "pct_from_low",
  "pct_from_ma",
  "consecutive",
  "whale_flow",
] as const;

export type IndicatorName = (typeof INDICATOR_NAMES)[number];

export function isIndicatorName(name: string): name is IndicatorName {
  return (INDICATOR_NAMES as readonly string[]).includes(name);
}
