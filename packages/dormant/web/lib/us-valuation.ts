import type { CompanyFinancialScoreInput, StockBasics } from "@fomo/core";

export type UsValuationFailureReason =
  | "basics-missing"
  | "market-cap-missing"
  | "revenue-missing"
  | "latest-price-missing"
  | "closes-insufficient"
  | "psr-series-insufficient";

export interface UsValuationDiagnostic {
  reason?: UsValuationFailureReason;
  closeCount: number;
  hasBasics: boolean;
  hasMarketCap: boolean;
  hasRevenue: boolean;
  hasLatestPrice: boolean;
}

export interface UsValuationBandResult {
  band?: Partial<CompanyFinancialScoreInput>;
  diagnostic: UsValuationDiagnostic;
}

/**
 * US 밸류에이션 밴드 역산 (WO-VAL) — 미장 밸류축 전종목 결손 복구.
 *
 * 미장은 무료 소스에 PER/PBR/PSR·과거 밴드가 없다(Yahoo quoteSummary=crumb 차단·확인됨,
 * Nasdaq summary/financials=밸류 비율 미제공·실측 확인). 그래서 **가짜 밴드 대신 실데이터로 역산**:
 *   PSR_t = (종가_t × 발행주식수) / 최근 매출,  발행주식수 = 시가총액 ÷ 현재가
 * 이미 확보한 최근 1년 일봉(≈250거래일)로 PSR 분포(밴드)를 만들고, 현재 PSR 의 밴드 내 위치를 낸다.
 * 전부 실측치(일봉·매출·시총) — 지어낸 값 0. 발행주식수는 1년간 대략 일정하다는 근사만 둔다("최근 1년 밴드" 라벨로 정직).
 */

/** "$25.9B"·"$416.2M"·"$1.2T" → USD 숫자. 실패 시 null. */
export function parseUsdCompact(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/,/g, "").match(/\$?\s*(-?\d+(?:\.\d+)?)\s*([TBM])?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? "").toUpperCase();
  const mult = unit === "T" ? 1e12 : unit === "B" ? 1e9 : unit === "M" ? 1e6 : 1;
  return n * mult;
}

function latestRawValue(basics: StockBasics, labelIncludes: string): number | null {
  const row = basics.financials?.rows.find((r) => r.label.includes(labelIncludes));
  const raw = row?.rawValues ?? [];
  for (let i = raw.length - 1; i >= 0; i -= 1) {
    const v = raw[i];
    if (typeof v === "number" && Number.isFinite(v) && v !== 0) return v;
  }
  return null;
}

/**
 * 미장 종목의 PSR 현재값 + 최근 1년 밴드를 실역산해 CompanyFinancialScoreInput 조각으로 돌려준다.
 * 매출/시총/현재가/일봉 중 하나라도 없으면 undefined(정직 — 억지 생성 금지).
 */
export function usValuationBandWithDiagnostics(
  basics: StockBasics | null | undefined,
  closes: readonly number[],
  latestPrice: number | undefined
): UsValuationBandResult {
  const clean = closes.filter((c) => Number.isFinite(c) && c > 0);
  const price = typeof latestPrice === "number" && latestPrice > 0 ? latestPrice : undefined;
  const diagnosticBase = {
    closeCount: clean.length,
    hasBasics: Boolean(basics),
    hasMarketCap: false,
    hasRevenue: false,
    hasLatestPrice: Boolean(price),
  };
  if (!basics) {
    return { diagnostic: { ...diagnosticBase, reason: "basics-missing" } };
  }
  const marketCap = parseUsdCompact(basics.marketCap);
  const revenue = latestRawValue(basics, "매출"); // Nasdaq financials 는 천달러 단위 → 비율은 단위 상쇄
  const revenueUsd = revenue !== null ? revenue * 1000 : null;
  const diagnostic = {
    ...diagnosticBase,
    hasMarketCap: Boolean(marketCap),
    hasRevenue: Boolean(revenueUsd && revenueUsd > 0),
  };
  if (!marketCap) return { diagnostic: { ...diagnostic, reason: "market-cap-missing" } };
  if (!revenueUsd || revenueUsd <= 0) return { diagnostic: { ...diagnostic, reason: "revenue-missing" } };
  if (!price) return { diagnostic: { ...diagnostic, reason: "latest-price-missing" } };
  if (clean.length < 3) return { diagnostic: { ...diagnostic, reason: "closes-insufficient" } };

  const shares = marketCap / price; // 발행주식수 근사(시총÷현재가)
  const psrSeries = clean.map((c) => (c * shares) / revenueUsd).filter((v) => Number.isFinite(v) && v > 0);
  if (psrSeries.length < 3) return { diagnostic: { ...diagnostic, reason: "psr-series-insufficient" } };
  const currentPsr = (price * shares) / revenueUsd;
  const months = Math.max(1, Math.round(clean.length / 21));
  return {
    band: {
      currentPsr: Number(currentPsr.toFixed(2)),
      psrHistory: psrSeries.map((v) => Number(v.toFixed(2))),
      valuationHistoryLabel: months >= 11 ? "최근 1년" : `최근 ${months}개월`,
    },
    diagnostic,
  };
}

export function usValuationBand(
  basics: StockBasics | null | undefined,
  closes: readonly number[],
  latestPrice: number | undefined
): Partial<CompanyFinancialScoreInput> | undefined {
  return usValuationBandWithDiagnostics(basics, closes, latestPrice).band;
}
