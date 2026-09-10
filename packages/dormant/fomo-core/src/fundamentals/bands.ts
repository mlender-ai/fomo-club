import { composeTtm, quartersAsOf } from "./ttm";
import type { BandMetric, BandStat, QuarterRecord } from "./types";

/**
 * 5년 밴드 백분위 (WO-SUB-01 §6-3).
 *
 * ```
 * window = [max(T - 5년, 최초 종가일), T]
 * for each trading day d:
 *   ttm(d) = filed_at <= d 인 최근 4분기 합         ← look-ahead 금지
 *   per(d) = close_adj(d) × shares_ref / ni_ttm(d)   if ni_ttm(d) > 0 else null
 * sufficient = |valid| >= 0.6 × (윈도우 거래일 수)  && 윈도우 길이 >= 3년
 * sufficient 가 아니면 current_percentile = null (계산하지 않는다)
 * ```
 *
 * **적자 구간은 null 로 빠진다. 버그가 아니라 사실이다.** 적자가 많은 종목은
 * `sufficient: false` 가 되고 값의 상태 층을 표시하지 않게 된다. 그것이 옳다.
 *
 * 주당 지표를 만드는 방식: 액면분할 조정 종가(`close_adj`)에 **기준주식수 하나**를 곱해
 * 시가총액을 만들고 TTM 총액으로 나눈다. 과거 시점의 as-reported 주당값(EPS/BPS)을 쓰면
 * 분할 전후로 축이 어긋나 밴드가 통째로 왜곡되기 때문이다. 기준주식수는 `BandStat.shares_ref`
 * 로 노출하고, 윈도우 안에서 주식수가 크게 변한 종목은 `sufficient: false` 로 떨어뜨린다.
 */

/** 유효 관측 하한 비율(§6-3). */
export const SUFFICIENT_RATIO = 0.6;
/** 윈도우 최소 길이(년) — PHASE 1 규칙 3 "3년 미만이면 null + 사유 기록". */
export const MIN_WINDOW_YEARS = 3;
/** 윈도우 내 주식수 변동 허용 상한. 넘으면 기준주식수 근사가 깨지므로 밴드를 만들지 않는다. */
export const MAX_SHARES_DRIFT = 0.2;
const DAY_MS = 86_400_000;
const WINDOW_YEARS = 5;

export interface DailyClose {
  /** "YYYY-MM-DD" */
  date: string;
  /** 액면분할·병합 조정 종가. 조정본인지 반드시 확인하고 source_manifest 에 기록한다. */
  close: number;
}

/** 자기자본 시점 관측(대차대조표 항목 — 기간 합산이 아니라 시점값). */
export interface EquityPoint {
  period_end: string;
  filed_at: string;
  equity: number;
}

export interface SharesPoint {
  as_of: string;
  shares: number;
}

export interface BandInput {
  closes: readonly DailyClose[];
  quarters: readonly QuarterRecord[];
  equityPoints: readonly EquityPoint[];
  sharesRef: number | null;
  sharesRefAsOf: string | null;
  sharesSeries?: readonly SharesPoint[];
  /** 기준 시점(기본 = 마지막 종가일). */
  asOf?: string;
}

function quantile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const weight = pos - lo;
  return sorted[lo]! * (1 - weight) + sorted[hi]! * weight;
}

/** 현재값이 분포에서 몇 %ile 인가(이하 비율 × 100). */
export function percentileRank(current: number, values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const below = values.reduce((acc, v) => acc + (v <= current ? 1 : 0), 0);
  return Number(((below / values.length) * 100).toFixed(1));
}

function emptyBand(
  windowStart: string,
  windowEnd: string,
  tradingDays: number,
  reason: string,
  sharesRef: number | null,
  sharesRefAsOf: string | null
): BandStat {
  return {
    p20: null,
    p50: null,
    p80: null,
    current: null,
    current_percentile: null,
    observations: 0,
    window_trading_days: tradingDays,
    window_start: windowStart,
    window_end: windowEnd,
    sufficient: false,
    insufficient_reason: reason,
    basis: BAND_BASIS,
    shares_ref: sharesRef,
    shares_ref_as_of: sharesRefAsOf,
  };
}

export const BAND_BASIS = "close_adj × shares_ref ÷ TTM 총액(또는 자기자본)";

/**
 * 분할 미조정 의심 점프 탐지 (WO-SUB-01 §12 "분할 미조정 가격으로 밴드 계산" 방지).
 *
 * 하루 사이 종가가 절반 이하로 떨어지거나 두 배 이상 뛰면 액면분할·병합이 조정되지 않은
 * 시계열일 개연성이 압도적이다. 소스가 조정본이라고 **주장**하는지에 의존하지 않고
 * 데이터 자체로 검증한다 — 소스가 바뀌어도 이 가드는 계속 작동한다.
 * 반환값은 발견한 첫 점프(없으면 null).
 */
export function detectUnadjustedSplit(closes: readonly DailyClose[]): { date: string; ratio: number } | null {
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1]!.close;
    const cur = closes[i]!.close;
    if (prev <= 0 || cur <= 0) continue;
    const ratio = cur / prev;
    if (ratio <= 0.5 || ratio >= 2) return { date: closes[i]!.date, ratio: Number(ratio.toFixed(3)) };
  }
  return null;
}

/** 윈도우 안에서 주식수가 얼마나 움직였나(최대/최소 - 1). 관측 1개 이하면 0. */
export function sharesDrift(series: readonly SharesPoint[], windowStart: string): number {
  const inWindow = series.filter((s) => s.as_of >= windowStart && Number.isFinite(s.shares) && s.shares > 0);
  if (inWindow.length < 2) return 0;
  const values = inWindow.map((s) => s.shares);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min > 0 ? max / min - 1 : 0;
}

/**
 * 세 밴드(per/pbr/psr)를 한 번에 계산한다. 소스가 부족하면 각 밴드는
 * `sufficient: false` + `insufficient_reason` 을 갖는다(필드 자체를 없애지 않는다 —
 * "왜 못 만들었는지"가 WO-SUB-04 의 게이팅 입력이다).
 */
export function computeBands(input: BandInput): Record<BandMetric, BandStat> {
  const closes = [...input.closes]
    .filter((c) => c && typeof c.close === "number" && Number.isFinite(c.close) && c.close > 0 && /^\d{4}-\d{2}-\d{2}$/.test(c.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const end = input.asOf ?? closes[closes.length - 1]?.date ?? "";
  const cutoff = end ? new Date(Date.parse(end) - WINDOW_YEARS * 365 * DAY_MS).toISOString().slice(0, 10) : "";
  const window = closes.filter((c) => c.date >= cutoff && c.date <= end);
  const start = window[0]?.date ?? "";
  const tradingDays = window.length;
  const sharesRef = typeof input.sharesRef === "number" && input.sharesRef > 0 ? input.sharesRef : null;

  const bail = (reason: string): Record<BandMetric, BandStat> => ({
    per: emptyBand(start, end, tradingDays, reason, sharesRef, input.sharesRefAsOf),
    pbr: emptyBand(start, end, tradingDays, reason, sharesRef, input.sharesRefAsOf),
    psr: emptyBand(start, end, tradingDays, reason, sharesRef, input.sharesRefAsOf),
  });

  if (tradingDays === 0) return bail("일별 종가 없음");
  if (!sharesRef) return bail("기준주식수 없음 — 시가총액 시계열을 만들 수 없다");
  const spanYears = (Date.parse(end) - Date.parse(start)) / (365 * DAY_MS);
  if (spanYears < MIN_WINDOW_YEARS) {
    return bail(`종가 이력 ${spanYears.toFixed(1)}년 — ${MIN_WINDOW_YEARS}년 미만`);
  }
  const drift = sharesDrift(input.sharesSeries ?? [], start);
  if (drift > MAX_SHARES_DRIFT) {
    return bail(`윈도우 내 주식수 변동 ${(drift * 100).toFixed(0)}% — 기준주식수 근사 불가`);
  }
  const jump = detectUnadjustedSplit(window);
  if (jump) return bail(`종가 시계열에 하루 ${jump.ratio}배 점프(${jump.date}) — 분할 미조정 의심`);

  const perSeries: number[] = [];
  const pbrSeries: number[] = [];
  const psrSeries: number[] = [];
  let perCurrent: number | null = null;
  let pbrCurrent: number | null = null;
  let psrCurrent: number | null = null;

  // 같은 공시 상태가 이어지는 구간은 TTM 이 동일하다 → 공시일이 바뀔 때만 재계산(결정론 유지, 비용 절감).
  let cachedKey = "";
  let cachedNi: number | null = null;
  let cachedRevenue: number | null = null;
  let cachedEquity: number | null = null;

  for (const point of window) {
    const visible = quartersAsOf(input.quarters, point.date);
    const key = visible.length > 0 ? `${visible[visible.length - 1]!.period_end}|${visible.length}` : "none";
    if (key !== cachedKey) {
      cachedKey = key;
      const ttm = composeTtm(input.quarters, point.date);
      cachedNi = ttm.net_income;
      cachedRevenue = ttm.revenue;
      const equityVisible = input.equityPoints
        .filter((e) => e.filed_at <= point.date && Number.isFinite(e.equity))
        .sort((a, b) => a.period_end.localeCompare(b.period_end));
      cachedEquity = equityVisible[equityVisible.length - 1]?.equity ?? null;
    }
    const cap = point.close * sharesRef;
    const per = cachedNi !== null && cachedNi > 0 ? cap / cachedNi : null;
    const psr = cachedRevenue !== null && cachedRevenue > 0 ? cap / cachedRevenue : null;
    const pbr = cachedEquity !== null && cachedEquity > 0 ? cap / cachedEquity : null;
    if (per !== null && Number.isFinite(per)) {
      perSeries.push(per);
      perCurrent = per;
    }
    if (psr !== null && Number.isFinite(psr)) {
      psrSeries.push(psr);
      psrCurrent = psr;
    }
    if (pbr !== null && Number.isFinite(pbr)) {
      pbrSeries.push(pbr);
      pbrCurrent = pbr;
    }
  }

  const build = (values: readonly number[], current: number | null, label: string): BandStat => {
    const sufficient = values.length >= SUFFICIENT_RATIO * tradingDays && values.length > 0;
    const sorted = [...values].sort((a, b) => a - b);
    const round = (v: number | null) => (v === null ? null : Number(v.toFixed(2)));
    return {
      p20: sufficient ? round(quantile(sorted, 0.2)) : null,
      p50: sufficient ? round(quantile(sorted, 0.5)) : null,
      p80: sufficient ? round(quantile(sorted, 0.8)) : null,
      current: round(current),
      current_percentile: sufficient && current !== null ? percentileRank(current, sorted) : null,
      observations: values.length,
      window_trading_days: tradingDays,
      window_start: start,
      window_end: end,
      sufficient,
      insufficient_reason: sufficient
        ? null
        : `${label} 유효 관측 ${values.length}/${tradingDays}일 — 하한 ${Math.ceil(SUFFICIENT_RATIO * tradingDays)}일 미달`,
      basis: BAND_BASIS,
      shares_ref: sharesRef,
      shares_ref_as_of: input.sharesRefAsOf,
    };
  };

  return {
    per: build(perSeries, perCurrent, "PER"),
    pbr: build(pbrSeries, pbrCurrent, "PBR"),
    psr: build(psrSeries, psrCurrent, "PSR"),
  };
}
