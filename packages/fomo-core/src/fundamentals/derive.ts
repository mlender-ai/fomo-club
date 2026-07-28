import { STDEV_QUARTERS, TTM_QUARTERS } from "./ttm";
import type { FactSheetBalance, FactSheetGrowth, FactSheetMargin, MarginTrend, QuarterRecord } from "./types";
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
  };
}
