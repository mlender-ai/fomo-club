import type { FactSheet } from "@fomo/core";
import { kstDate } from "../fomo";
import { readFactSheet } from "./repository";
import { loadFundamentalsUniverse } from "./universe";

/**
 * 커버리지 대시보드 (WO-SUB-01 §9, 완료 조건 7).
 *
 * 필드별 확보율 · 최신성(갱신 지연) · 실패 종목 목록. 전부 저장된 팩트시트에서 센다 —
 * 여기서 소스를 다시 조회하지 않는다(대시보드가 소스를 두들기면 그게 요청 시점 계산이다).
 */

/** 확보율을 세는 필드 — WO-SUB-00 실사 매트릭스와 맞춰야 ±5%p 비교가 가능하다(완료 조건 7). */
export const COVERAGE_FIELDS = [
  "fiscal.quarters",
  "fiscal.annual",
  "fiscal.ttm.revenue",
  "fiscal.ttm.net_income",
  "growth.revenue_yoy",
  "growth.revenue_cagr_3y",
  "margin.operating_ttm",
  "margin.operating_stdev_8q",
  "valuation.per_ttm",
  "valuation.pbr",
  "valuation.psr_ttm",
  "valuation.dividend_yield",
  "valuation.per_forward",
  "balance.total_equity",
  "market_data.market_cap",
  "market_data.shares_outstanding",
  "market_data.price",
  "classification.industry",
  "consensus.eps_fy1",
  "consensus.revenue_fy1",
] as const;
export type CoverageField = (typeof COVERAGE_FIELDS)[number];

export interface CoverageCell {
  ok: number;
  n: number;
  pct: number | null;
}

export interface CoverageGroupReport {
  group: string;
  count: number;
  fields: Record<string, CoverageCell>;
  coverage_flags: Record<string, number>;
  /** 밴드 백분위가 계산된 종목 수 / 전체. */
  band_sufficient: number;
  /** 최신 분기 기간말 → 오늘까지의 일수 중앙값(갱신 지연). */
  lag_days_median: number | null;
}

export interface CoverageFailure {
  canonical: string;
  market: string;
  coverage_flag: string;
  missing_count: number;
  errors: string[];
}

export interface CoverageReport {
  generatedAt: string;
  date: string;
  universe: number;
  /** 레코드가 존재하는 종목 수. 완료 조건 1 = universe 와 같아야 한다. */
  records: number;
  groups: CoverageGroupReport[];
  failures: CoverageFailure[];
  /** 밴드가 왜 안 만들어졌는지 사유별 건수 — WO-SUB-04 게이팅 근거. */
  band_insufficient_reasons: Record<string, number>;
}

function pathValue(factsheet: FactSheet, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, factsheet);
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** 저장된 팩트시트에서 커버리지 리포트를 만든다. */
export function summarizeCoverage(
  factsheets: readonly FactSheet[],
  options: { universe: number; date?: string } = { universe: 0 }
): CoverageReport {
  const date = options.date ?? kstDate();
  const byGroup = new Map<string, FactSheet[]>();
  for (const factsheet of factsheets) {
    const group = factsheet.market;
    byGroup.set(group, [...(byGroup.get(group) ?? []), factsheet]);
  }

  const groups: CoverageGroupReport[] = [];
  const reasons: Record<string, number> = {};
  const failures: CoverageFailure[] = [];

  for (const [group, members] of [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const fields: Record<string, CoverageCell> = {};
    for (const field of COVERAGE_FIELDS) {
      const ok = members.reduce((acc, factsheet) => acc + (hasValue(pathValue(factsheet, field)) ? 1 : 0), 0);
      fields[field] = { ok, n: members.length, pct: members.length > 0 ? Number(((ok / members.length) * 100).toFixed(1)) : null };
    }
    const flags: Record<string, number> = {};
    let bandSufficient = 0;
    const lags: number[] = [];
    for (const factsheet of members) {
      flags[factsheet.fiscal.coverage_flag] = (flags[factsheet.fiscal.coverage_flag] ?? 0) + 1;
      const bands = factsheet.valuation.band_5y;
      if (bands.per?.sufficient || bands.pbr?.sufficient || bands.psr?.sufficient) bandSufficient += 1;
      for (const band of [bands.per, bands.pbr, bands.psr]) {
        if (band && !band.sufficient && band.insufficient_reason) {
          // 사유를 종목별 수치까지 남기면 집계가 안 된다 — 앞부분(사유 종류)만 센다.
          const key = band.insufficient_reason.replace(/\d[\d.,]*/g, "N");
          reasons[key] = (reasons[key] ?? 0) + 1;
        }
      }
      const latest = factsheet.fiscal.quarters[factsheet.fiscal.quarters.length - 1]?.period_end;
      if (latest) {
        const days = (Date.parse(date) - Date.parse(latest)) / 86_400_000;
        if (Number.isFinite(days)) lags.push(Math.round(days));
      }
      if (factsheet.fiscal.coverage_flag === "none" || factsheet.source_errors.length > 0) {
        failures.push({
          canonical: factsheet.canonical,
          market: factsheet.market,
          coverage_flag: factsheet.fiscal.coverage_flag,
          missing_count: factsheet.missing_fields.length,
          errors: factsheet.source_errors,
        });
      }
    }
    groups.push({
      group,
      count: members.length,
      fields,
      coverage_flags: flags,
      band_sufficient: bandSufficient,
      lag_days_median: median(lags),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    date,
    universe: options.universe,
    records: factsheets.length,
    groups,
    failures: failures.sort((a, b) => a.canonical.localeCompare(b.canonical)),
    band_insufficient_reasons: reasons,
  };
}

/** 저장소에서 전 유니버스 팩트시트를 읽어 리포트를 만든다(크론·스크립트·어드민 API 공용). */
export async function buildCoverageReport(): Promise<CoverageReport> {
  const universe = await loadFundamentalsUniverse();
  const factsheets: FactSheet[] = [];
  for (const entry of universe) {
    const record = await readFactSheet(entry.country, entry.canonical);
    if (record) factsheets.push(record.factsheet);
  }
  return summarizeCoverage(factsheets, { universe: universe.length });
}
