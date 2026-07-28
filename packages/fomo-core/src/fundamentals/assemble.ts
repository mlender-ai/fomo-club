import { computeBands, type DailyClose, type EquityPoint, type SharesPoint } from "./bands";
import { deriveBalance, deriveGrowth, deriveMargin, type PointObservation } from "./derive";
import { collectMissingFields } from "./missing";
import { composeFiscal, TTM_QUARTERS } from "./ttm";
import type {
  Currency,
  FactSheet,
  FactSheetClassification,
  FactSheetConsensus,
  Market,
  QuarterRecord,
  SourceManifestEntry,
} from "./types";

/**
 * 팩트시트 조립 (WO-SUB-01 §7-1 `compose/`).
 *
 * 어댑터는 **원시 응답 → 정규화 레코드**만 한다. 파생 계산은 전부 여기서 한다.
 * 이 함수는 순수하다 — 같은 입력이면 같은 출력(§4 규칙 6).
 */

/** 소스가 직접 준 수치(계산 불가일 때의 폴백). 출처·기준일 없이는 받지 않는다. */
export interface ReportedNumber {
  value: number;
  source: string;
  as_of: string | null;
}

export interface FactSheetInput {
  canonical: string;
  displayName: string;
  /** US=심볼, KR=6자리 코드. */
  symbol: string;
  market: Market;
  currency: Currency;
  snapshotAt: string;

  quarters: readonly QuarterRecord[];
  annual: readonly QuarterRecord[];

  equity: readonly PointObservation[];
  liabilities: readonly PointObservation[];
  totalDebt: readonly PointObservation[];
  cash: readonly PointObservation[];
  operatingCashFlow: readonly PointObservation[];
  interestExpense: readonly PointObservation[];
  /** 감가상각비(분기) — EV/EBITDA 계산에만 쓴다. 없으면 EV/EBITDA 는 null. */
  depreciation: readonly PointObservation[];

  closes: readonly DailyClose[];
  sharesSeries: readonly SharesPoint[];

  marketData: {
    market_cap: number | null;
    shares_outstanding: number | null;
    price: number | null;
    price_as_of: string | null;
    source: string;
  };
  consensus: FactSheetConsensus;
  classification: FactSheetClassification;

  /** 소스가 직접 준 밸류에이션(계산 실패 시 폴백). */
  reported: {
    per_ttm?: ReportedNumber;
    pbr?: ReportedNumber;
    psr_ttm?: ReportedNumber;
    per_forward?: ReportedNumber;
    dividend_yield?: ReportedNumber;
  };

  sourceManifest: Record<string, SourceManifestEntry>;
  sourceErrors: readonly string[];
}

interface Resolved {
  value: number | null;
  source: string | null;
  as_of: string | null;
}

function computed(value: number | null, source: string, asOf: string | null): Resolved {
  return value !== null && Number.isFinite(value) ? { value: Number(value.toFixed(4)), source, as_of: asOf } : { value: null, source: null, as_of: null };
}

/** 계산값이 우선. 없으면 소스가 직접 준 값(출처·기준일 그대로). 둘 다 없으면 null. */
function preferComputed(primary: Resolved, fallback: ReportedNumber | undefined): Resolved {
  if (primary.value !== null) return primary;
  if (fallback && Number.isFinite(fallback.value)) {
    return { value: fallback.value, source: fallback.source, as_of: fallback.as_of };
  }
  return { value: null, source: null, as_of: null };
}

function sumLastN(points: readonly PointObservation[], n: number): number | null {
  const byPeriod = new Map<string, number>();
  for (const p of [...points].sort((a, b) => a.period_end.localeCompare(b.period_end))) {
    if (Number.isFinite(p.value)) byPeriod.set(p.period_end, p.value);
  }
  const values = [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-n).map(([, v]) => v);
  return values.length === n ? values.reduce((a, b) => a + b, 0) : null;
}

function latestPoint(points: readonly PointObservation[]): PointObservation | null {
  const sorted = [...points].filter((p) => Number.isFinite(p.value)).sort((a, b) => a.period_end.localeCompare(b.period_end));
  return sorted[sorted.length - 1] ?? null;
}

export function assembleFactSheet(input: FactSheetInput): FactSheet {
  const fiscal = composeFiscal(input.quarters, input.annual);
  const growth = deriveGrowth(fiscal.quarters, fiscal.annual);
  const margin = deriveMargin(fiscal.quarters, fiscal.ttm, fiscal.annual);
  const balance = deriveBalance({
    equity: input.equity,
    liabilities: input.liabilities,
    totalDebt: input.totalDebt,
    cash: input.cash,
    operatingCashFlow: input.operatingCashFlow,
    interestExpense: input.interestExpense,
    ttmOperatingIncome: fiscal.ttm.operating_income,
  });

  const ttmAsOf = fiscal.quarters[fiscal.quarters.length - 1]?.period_end ?? null;
  const equityPoint = latestPoint(input.equity);
  const cap = input.marketData.market_cap;
  const capSource = input.marketData.source;

  // 계산 기준을 하나로 통일한다(시가총액 ÷ TTM 총액). 소스마다 다른 EPS 정의를 섞지 않기 위함이다.
  const perComputed = computed(
    cap !== null && fiscal.ttm.net_income !== null && fiscal.ttm.net_income > 0 ? cap / fiscal.ttm.net_income : null,
    `computed:${capSource}÷ttm_net_income`,
    ttmAsOf
  );
  const pbrComputed = computed(
    cap !== null && equityPoint && equityPoint.value > 0 ? cap / equityPoint.value : null,
    `computed:${capSource}÷total_equity`,
    equityPoint?.period_end ?? null
  );
  const psrComputed = computed(
    cap !== null && fiscal.ttm.revenue !== null && fiscal.ttm.revenue > 0 ? cap / fiscal.ttm.revenue : null,
    `computed:${capSource}÷ttm_revenue`,
    ttmAsOf
  );
  const forwardComputed = computed(
    input.marketData.price !== null && input.consensus.eps_fy1 !== null && input.consensus.eps_fy1 > 0
      ? input.marketData.price / input.consensus.eps_fy1
      : null,
    `computed:price÷${input.consensus.source ?? "consensus"}_eps_fy1`,
    input.consensus.as_of
  );

  // EV/EBITDA — EBITDA = TTM 영업이익 + TTM 감가상각비. 감가상각비가 없으면 계산하지 않는다.
  const daTtm = sumLastN(input.depreciation, TTM_QUARTERS);
  const ebitda = fiscal.ttm.operating_income !== null && daTtm !== null ? fiscal.ttm.operating_income + daTtm : null;
  const debtLatest = latestPoint(input.totalDebt)?.value ?? null;
  const cashLatest = latestPoint(input.cash)?.value ?? null;
  const ev = cap !== null && debtLatest !== null && cashLatest !== null ? cap + debtLatest - cashLatest : null;
  const evEbitda = computed(ev !== null && ebitda !== null && ebitda > 0 ? ev / ebitda : null, "computed:ev÷ebitda_ttm", ttmAsOf);

  const per = preferComputed(perComputed, input.reported.per_ttm);
  const pbr = preferComputed(pbrComputed, input.reported.pbr);
  const psr = preferComputed(psrComputed, input.reported.psr_ttm);
  const perForward = preferComputed(forwardComputed, input.reported.per_forward);
  const dividendYield = preferComputed({ value: null, source: null, as_of: null }, input.reported.dividend_yield);

  const equityPoints: EquityPoint[] = input.equity
    .filter((p) => Number.isFinite(p.value))
    .map((p) => ({ period_end: p.period_end, filed_at: p.filed_at, equity: p.value }));
  const sharesRef = input.marketData.shares_outstanding;
  const bands = computeBands({
    closes: input.closes,
    quarters: fiscal.quarters,
    equityPoints,
    sharesRef,
    sharesRefAsOf: input.marketData.price_as_of,
    sharesSeries: input.sharesSeries,
  });

  const fieldSources: FactSheet["field_sources"] = {};
  const note = (path: string, resolved: Resolved): void => {
    if (resolved.value !== null && resolved.source) fieldSources[path] = { source: resolved.source, as_of: resolved.as_of };
  };
  note("valuation.per_ttm", per);
  note("valuation.pbr", pbr);
  note("valuation.psr_ttm", psr);
  note("valuation.per_forward", perForward);
  note("valuation.dividend_yield", dividendYield);
  note("valuation.ev_ebitda", evEbitda);

  const fiscalSource = fiscal.quarters[fiscal.quarters.length - 1]?.source ?? input.annual[input.annual.length - 1]?.source ?? null;
  const derivedSource = fiscalSource ? `derived:${fiscalSource}` : null;
  const noteDerived = (path: string, value: number | null, asOf: string | null): void => {
    if (value !== null && derivedSource) fieldSources[path] = { source: derivedSource, as_of: asOf };
  };
  noteDerived("growth.revenue_yoy", growth.revenue_yoy, ttmAsOf);
  noteDerived("growth.revenue_cagr_3y", growth.revenue_cagr_3y, fiscal.annual[fiscal.annual.length - 1]?.period_end ?? null);
  noteDerived("growth.operating_income_yoy", growth.operating_income_yoy, ttmAsOf);
  noteDerived("margin.operating_ttm", margin.operating_ttm, ttmAsOf);
  noteDerived("margin.net_ttm", margin.net_ttm, ttmAsOf);
  noteDerived("margin.operating_stdev_8q", margin.operating_stdev_8q, ttmAsOf);
  const annualAsOf = fiscal.annual[fiscal.annual.length - 1]?.period_end ?? null;
  noteDerived("margin.operating_stdev_annual", margin.operating_stdev_annual, annualAsOf);
  noteDerived("margin.operating_stdev_annual_years", margin.operating_stdev_annual_years, annualAsOf);
  noteDerived("balance.total_equity", balance.total_equity, equityPoint?.period_end ?? null);
  noteDerived("balance.debt_to_equity", balance.debt_to_equity, equityPoint?.period_end ?? null);
  noteDerived("balance.net_cash", balance.net_cash, latestPoint(input.cash)?.period_end ?? null);
  noteDerived("balance.cash_and_equivalents", balance.cash_and_equivalents, latestPoint(input.cash)?.period_end ?? null);
  noteDerived("balance.cash_runway_quarters", balance.cash_runway_quarters, latestPoint(input.operatingCashFlow)?.period_end ?? null);
  noteDerived("balance.interest_coverage", balance.interest_coverage, ttmAsOf);

  for (const [path, value] of [
    ["market_data.market_cap", input.marketData.market_cap],
    ["market_data.shares_outstanding", input.marketData.shares_outstanding],
    ["market_data.price", input.marketData.price],
  ] as const) {
    if (value !== null) fieldSources[path] = { source: capSource, as_of: input.marketData.price_as_of };
  }
  if (input.consensus.available && input.consensus.source) {
    for (const path of [
      "consensus.revenue_fy1",
      "consensus.revenue_fy2",
      "consensus.revenue_fy3",
      "consensus.eps_fy1",
      "consensus.eps_fy2",
      "consensus.analyst_count",
    ] as const) {
      const key = path.split(".")[1] as keyof FactSheetConsensus;
      if (typeof input.consensus[key] === "number") {
        fieldSources[path] = { source: input.consensus.source, as_of: input.consensus.as_of };
      }
    }
  }

  const factsheet: FactSheet = {
    symbol: input.symbol,
    market: input.market,
    currency: input.currency,
    snapshot_at: input.snapshotAt,
    display_name: input.displayName,
    canonical: input.canonical,
    fiscal,
    growth,
    margin,
    valuation: {
      per_ttm: per.value,
      pbr: pbr.value,
      psr_ttm: psr.value,
      ev_ebitda: evEbitda.value,
      dividend_yield: dividendYield.value,
      per_forward: perForward.value,
      band_5y: {
        metric: null, // WO-SUB-02 가 아키타입에 따라 결정한다. 여기서는 계산만 한다.
        per: bands.per,
        pbr: bands.pbr,
        psr: bands.psr,
      },
    },
    balance,
    market_data: {
      market_cap: input.marketData.market_cap,
      shares_outstanding: input.marketData.shares_outstanding,
      price: input.marketData.price,
      price_as_of: input.marketData.price_as_of,
    },
    consensus: input.consensus,
    classification: input.classification,
    missing_fields: [],
    field_sources: fieldSources,
    source_manifest: input.sourceManifest,
    source_errors: [...input.sourceErrors],
  };

  factsheet.missing_fields = collectMissingFields(factsheet);
  return factsheet;
}

/** 소스가 하나도 안 열린 종목의 빈 팩트시트 — 레코드 부재는 불허(완료 조건 1). */
export function emptyFactSheet(seed: {
  canonical: string;
  displayName: string;
  symbol: string;
  market: Market;
  currency: Currency;
  snapshotAt: string;
  sourceErrors: readonly string[];
  sourceManifest?: Record<string, SourceManifestEntry>;
}): FactSheet {
  return assembleFactSheet({
    canonical: seed.canonical,
    displayName: seed.displayName,
    symbol: seed.symbol,
    market: seed.market,
    currency: seed.currency,
    snapshotAt: seed.snapshotAt,
    quarters: [],
    annual: [],
    equity: [],
    liabilities: [],
    totalDebt: [],
    cash: [],
    operatingCashFlow: [],
    interestExpense: [],
    depreciation: [],
    closes: [],
    sharesSeries: [],
    marketData: { market_cap: null, shares_outstanding: null, price: null, price_as_of: null, source: "none" },
    consensus: {
      available: false,
      revenue_fy1: null,
      revenue_fy2: null,
      revenue_fy3: null,
      eps_fy1: null,
      eps_fy2: null,
      source: null,
      as_of: null,
      analyst_count: null,
      periods: [],
    },
    classification: { sector: null, industry: null, scheme: null, source: null },
    reported: {},
    sourceManifest: seed.sourceManifest ?? {},
    sourceErrors: seed.sourceErrors,
  });
}
