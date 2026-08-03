import { STDEV_QUARTERS, TTM_QUARTERS } from "./ttm";
import type { BalancePoint, FactSheetBalance, FactSheetCashflow, FactSheetGrowth, FactSheetMargin, MarginTrend, QuarterRecord } from "./types";
import type { TtmResult } from "./ttm";

/**
 * 파생 지표 (WO-SUB-01 §6-4·§6-5 + growth/margin/balance).
 *
 * 전부 순수 함수다. 값이 없으면 `null` — 앞 분기 복사·연환산·보간 금지.
 */

/** 마진 추세 판정 임계값(퍼센트 포인트). 상수로 고정해 결정론을 지킨다. */
export const MARGIN_TREND_THRESHOLD_PP = 1.5;

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function pct(value: number | null): number | null {
  return value === null ? null : Number((value * 100).toFixed(2));
}

/** 전년동기 대비 — 최근 분기와 4분기 전(같은 계절) 비교. 분모가 0·음수면 null(왜곡 방지). */
function yoy(quarters: readonly QuarterRecord[], field: "revenue" | "operating_income"): number | null {
  if (quarters.length < TTM_QUARTERS + 1) return null;
  const latest = quarters[quarters.length - 1]![field];
  const prior = quarters[quarters.length - 1 - TTM_QUARTERS]![field];
  if (typeof latest !== "number" || typeof prior !== "number") return null;
  if (prior <= 0) return null; // 적자→적자 증감률은 부호가 뒤집혀 오해를 만든다
  return pct((latest - prior) / prior);
}

/**
 * 3년 CAGR — 연간 매출 4개 관측(t-3 … t)이 있어야 계산한다. 관측이 적으면 null.
 * 시작값이 0 이하면 계산 불가(음수의 분수승).
 */
export function cagr3y(annual: readonly QuarterRecord[]): number | null {
  const revenues = annual
    .filter((a) => typeof a.revenue === "number" && Number.isFinite(a.revenue))
    .slice(-4);
  if (revenues.length < 4) return null;
  const first = revenues[0]!.revenue!;
  const last = revenues[revenues.length - 1]!.revenue!;
  if (first <= 0 || last <= 0) return null;
  const years = (Date.parse(revenues[revenues.length - 1]!.period_end) - Date.parse(revenues[0]!.period_end)) / (365 * 86_400_000);
  if (!Number.isFinite(years) || years < 2.5) return null;
  return pct((last / first) ** (1 / years) - 1);
}

export function deriveGrowth(quarters: readonly QuarterRecord[], annual: readonly QuarterRecord[]): FactSheetGrowth {
  return {
    revenue_yoy: yoy(quarters, "revenue"),
    revenue_cagr_3y: cagr3y(annual),
    operating_income_yoy: yoy(quarters, "operating_income"),
  };
}

/** 분기별 영업이익률(%) — 매출이 0 이하인 분기는 제외한다. */
export function quarterlyOperatingMargins(quarters: readonly QuarterRecord[]): number[] {
  const out: number[] = [];
  for (const q of quarters) {
    if (typeof q.revenue !== "number" || q.revenue <= 0) continue;
    if (typeof q.operating_income !== "number") continue;
    out.push((q.operating_income / q.revenue) * 100);
  }
  return out;
}

/** 표본표준편차(n-1). 관측 2개 미만이면 null. */
export function sampleStdev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Number(Math.sqrt(variance).toFixed(2));
}

/** 최근 4분기 평균 마진 vs 이전 4분기 평균 마진. 8분기 미만이면 unknown. */
export function marginTrend(margins: readonly number[]): MarginTrend {
  if (margins.length < STDEV_QUARTERS) return "unknown";
  const recent = margins.slice(-TTM_QUARTERS);
  const prior = margins.slice(-STDEV_QUARTERS, -TTM_QUARTERS);
  const avg = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const delta = avg(recent) - avg(prior);
  if (delta > MARGIN_TREND_THRESHOLD_PP) return "expanding";
  if (delta < -MARGIN_TREND_THRESHOLD_PP) return "contracting";
  return "flat";
}

export function deriveMargin(
  quarters: readonly QuarterRecord[],
  ttm: TtmResult,
  annual: readonly QuarterRecord[] = []
): FactSheetMargin {
  const margins = quarterlyOperatingMargins(quarters);
  const annualMargins = quarterlyOperatingMargins(annual);
  return {
    operating_ttm: pct(ratio(ttm.operating_income, ttm.revenue)),
    net_ttm: pct(ratio(ttm.net_income, ttm.revenue)),
    // 8분기 미만이면 null → WO-SUB-02 가 시클리컬 판정 불가로 처리한다.
    operating_stdev_8q: margins.length >= STDEV_QUARTERS ? sampleStdev(margins) : null,
    // 연간 대체 입력 — KR 은 분기 통계가 구조적으로 없다(네이버 5분기 상한).
    operating_stdev_annual: sampleStdev(annualMargins),
    operating_stdev_annual_years: annualMargins.length,
    trend_8q: marginTrend(margins),
  };
}

/** 시점값(대차대조표·현금흐름) 관측. `filed_at` 은 look-ahead 판정용. */
export interface PointObservation {
  period_end: string;
  filed_at: string;
  value: number;
  /**
   * 이 관측을 만든 소스(감사용). 시계열을 팩트시트에 노출할 때 §4 규칙 2(모든 수치에 출처)를
   * 지키려면 점마다 출처가 있어야 한다. 값이 없으면 소비 측이 회계 소스로 대체한다.
   */
  source?: string;
}

export interface BalanceInput {
  equity: readonly PointObservation[];
  liabilities: readonly PointObservation[];
  totalDebt: readonly PointObservation[];
  cash: readonly PointObservation[];
  /** 분기 영업현금흐름(기간값) — 런웨이 계산 입력. */
  operatingCashFlow: readonly PointObservation[];
  /** 분기 이자비용(기간값). */
  interestExpense: readonly PointObservation[];
  ttmOperatingIncome: number | null;
  /** 시계열 점에 출처가 없을 때 쓸 대체 출처(회계 소스). */
  seriesFallbackSource?: string | null;
}

function latest(points: readonly PointObservation[]): number | null {
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => a.period_end.localeCompare(b.period_end) || a.filed_at.localeCompare(b.filed_at));
  return sorted[sorted.length - 1]?.value ?? null;
}

function lastN(points: readonly PointObservation[], n: number): number[] {
  const byPeriod = new Map<string, number>();
  for (const p of [...points].sort((a, b) => a.period_end.localeCompare(b.period_end) || a.filed_at.localeCompare(b.filed_at))) {
    if (Number.isFinite(p.value)) byPeriod.set(p.period_end, p.value);
  }
  return [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-n).map(([, v]) => v);
}

/**
 * 현금 런웨이 (§6-4) — **최근 4분기 영업현금흐름 합이 음수인 경우에만** 계산한다.
 * 양수면 `null`. "무한"이라고 쓰지 않는다.
 */
export function cashRunwayQuarters(cash: number | null, ocfQuarters: readonly number[]): number | null {
  if (cash === null || cash <= 0) return null;
  if (ocfQuarters.length < TTM_QUARTERS) return null;
  const recent = ocfQuarters.slice(-TTM_QUARTERS);
  const total = recent.reduce((a, b) => a + b, 0);
  if (total >= 0) return null;
  const burnPerQuarter = Math.abs(total) / TTM_QUARTERS;
  if (burnPerQuarter <= 0) return null;
  return Number((cash / burnPerQuarter).toFixed(1));
}

export interface CashflowInput {
  /** 분기 영업활동현금흐름(기간값). 원부호. */
  operatingCashFlow: readonly PointObservation[];
  /** 분기 유형자산 취득(기간값). 부호 관행이 섞여 절대값으로 쓴다. */
  capex: readonly PointObservation[];
  /** 분기 배당금지급(기간값). 절대값으로 쓴다. */
  dividendPaid: readonly PointObservation[];
}

/** 기간 라벨과 값을 함께 뽑는다 — `composed_of` 가 "왜 null 인지"를 보여줘야 한다. */
function lastNWithPeriods(points: readonly PointObservation[], n: number): Array<[string, number]> {
  const byPeriod = new Map<string, number>();
  for (const p of [...points].sort((a, b) => a.period_end.localeCompare(b.period_end) || a.filed_at.localeCompare(b.filed_at))) {
    if (Number.isFinite(p.value)) byPeriod.set(p.period_end, p.value);
  }
  return [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-n);
}

/** 4분기가 다 있을 때만 합. 부분 합은 TTM 이 아니다(3분기 합을 1년치로 읽게 된다). */
function ttmSum(points: readonly PointObservation[], absolute: boolean): number | null {
  const recent = lastNWithPeriods(points, TTM_QUARTERS);
  if (recent.length < TTM_QUARTERS) return null;
  const total = recent.reduce((sum, [, value]) => sum + (absolute ? Math.abs(value) : value), 0);
  return Number(total.toFixed(0));
}

export function deriveCashflow(input: CashflowInput): FactSheetCashflow {
  const composed = lastNWithPeriods(input.operatingCashFlow, TTM_QUARTERS);
  const operating = ttmSum(input.operatingCashFlow, false);
  const capex = ttmSum(input.capex, true);
  const dividend = ttmSum(input.dividendPaid, true);
  const observed = new Set(input.operatingCashFlow.filter((p) => Number.isFinite(p.value)).map((p) => p.period_end)).size;

  return {
    operating_ttm: operating,
    capex_ttm: capex,
    // 하나라도 없으면 null. 결측을 0 으로 읽으면 CapEx 가 큰 기업의 FCF 가 부풀려진다.
    free_cash_flow_ttm: operating !== null && capex !== null ? operating - capex : null,
    dividend_paid_ttm: dividend,
    // 적자(영업CF ≤ 0)에서 배당 비율은 의미가 없다 — 배당을 이익이 아니라 곳간에서 준 것이라
    // 비율로 표현하면 "0.3배라 안전"처럼 읽힌다.
    dividend_coverage:
      dividend !== null && operating !== null && operating > 0 ? Number((dividend / operating).toFixed(3)) : null,
    burn_per_quarter:
      operating !== null && operating < 0 ? Number((Math.abs(operating) / TTM_QUARTERS).toFixed(0)) : null,
    composed_of: composed.map(([period]) => period),
    observed_quarters: observed,
    coverage_flag: operating === null ? (observed > 0 ? "partial" : "none") : "full",
  };
}

/** 상한 — 5년. 밴드 윈도우와 같은 기간이라 화면이 다른 기간을 섞지 않는다. */
export const BALANCE_SERIES_QUARTERS = 20;

/** "2026-03-31" → "2026Q1". 기간말 기준 라벨(회계연도 기준이 아니다). */
function quarterLabel(periodEnd: string): string {
  const month = Number(periodEnd.slice(5, 7));
  return `${periodEnd.slice(0, 4)}Q${Math.min(4, Math.max(1, Math.ceil(month / 3)))}`;
}

/**
 * 시점값 시계열 → 팩트시트 노출 형태.
 *
 * 같은 기간말이 여러 보고서에서 오면 **나중에 공시된 것을 쓴다**(정정공시 반영).
 * 오름차순 고정 + 상한 20분기.
 */
export function toBalanceSeries(points: readonly PointObservation[], fallbackSource: string | null): BalancePoint[] {
  const byPeriod = new Map<string, PointObservation>();
  for (const point of points) {
    if (!Number.isFinite(point.value)) continue;
    const prior = byPeriod.get(point.period_end);
    if (prior === undefined || prior.filed_at.localeCompare(point.filed_at) <= 0) byPeriod.set(point.period_end, point);
  }
  return [...byPeriod.values()]
    .sort((a, b) => a.period_end.localeCompare(b.period_end))
    .slice(-BALANCE_SERIES_QUARTERS)
    .map((point) => ({
      period: quarterLabel(point.period_end),
      period_end: point.period_end,
      filed_at: point.filed_at,
      value: point.value,
      // 점 출처가 없는 경로(SEC)는 회계 소스로 대체한다. 빈 문자열로 두면 출처 없는 수치가 된다.
      source: point.source ?? fallbackSource ?? "unknown",
    }));
}

export function deriveBalance(input: BalanceInput): FactSheetBalance {
  const equity = latest(input.equity);
  const liabilities = latest(input.liabilities);
  const debt = latest(input.totalDebt);
  const cash = latest(input.cash);
  const interestTtm = lastN(input.interestExpense, TTM_QUARTERS);
  const interestSum = interestTtm.length === TTM_QUARTERS ? interestTtm.reduce((a, b) => a + b, 0) : null;
  return {
    total_equity: equity,
    // 부채비율 — 총부채/자기자본. 차입금만이 아니라 총부채 기준(국내 관행)이며, 소스에 총부채가 없으면 null.
    debt_to_equity: equity !== null && equity > 0 && liabilities !== null ? Number((liabilities / equity).toFixed(3)) : null,
    // 순현금 = 현금성자산 − 총차입금. 총차입금이 없으면 계산하지 않는다(총부채로 대체하지 않는다).
    net_cash: cash !== null && debt !== null ? cash - debt : null,
    cash_and_equivalents: cash,
    cash_runway_quarters: cashRunwayQuarters(cash, lastN(input.operatingCashFlow, TTM_QUARTERS)),
    interest_coverage:
      input.ttmOperatingIncome !== null && interestSum !== null && interestSum > 0
        ? Number((input.ttmOperatingIncome / interestSum).toFixed(2))
        : null,
    // 이미 수집하던 시계열을 버리지 않고 남긴다 — WO-SUB-04 막대축 입력.
    equity_quarters: toBalanceSeries(input.equity, input.seriesFallbackSource ?? null),
    cash_quarters: toBalanceSeries(input.cash, input.seriesFallbackSource ?? null),
  };
}
