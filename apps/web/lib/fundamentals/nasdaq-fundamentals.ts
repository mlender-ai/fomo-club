import type { FactSheetClassification, FactSheetConsensus, ReportedNumber } from "@fomo/core";

/**
 * Nasdaq 공개 API 어댑터 (WO-SUB-01 §7-1, US 시장데이터·컨센서스·분류).
 *
 * 실측으로 확인한 함정:
 *  · **브라우저 UA 필수.** 비브라우저 UA 는 차단된다.
 *  · `summary` 에 **`PERatio`·`BookValue` 키가 없다.** PER 은 시가총액 ÷ SEC TTM 순이익으로 계산한다.
 *  · `summary` 는 간헐적으로 `summaryData: {}` 를 준다(실측). 재시도하고, 그래도 비면 결측으로 남긴다.
 *  · `summary` 의 **키 집합이 종목마다 다르다**(실측: IBM 에는 `Yield`·`AnnualizedDividend` 가 없다).
 *    없는 키를 결측으로 두고, `PreviousClose` 는 `info` 실패 시 가격 폴백으로 쓴다.
 *  · `analyst/earnings-forecast` 는 **EPS 예상만** 준다. 매출 예상 필드가 없다 → `revenue_fy*` 는 null.
 *  · `consensusEPSForecast` 는 **문자열로도 숫자로도** 온다. 문자열로 강제하지 않으면 예외가 난다.
 *  · `historical` 은 5년을 요청해도 소수 행만 주거나 타임아웃한다 → 일별 종가는
 *    이미 확보된 `us-candle-cache`(픽 크론이 봉인한 260거래일)를 쓴다. 5년 밴드는 계산 불가다.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
const DELAY_MS = 350;
const SUMMARY_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 재시도할 상태 — 429·5xx·타임아웃. Nasdaq 은 연속 호출에서 타임아웃이 잦다(실측). */
function retryable(status: string): boolean {
  return status === "429" || status.startsWith("5") || status === "TimeoutError";
}

async function getJson<T>(url: string, retries = 2): Promise<{ data: T | null; status: string }> {
  let last = "unknown";
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(900 * attempt);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return { data: (await res.json()) as T, status: "200" };
      last = String(res.status);
    } catch (error) {
      last = error instanceof Error ? error.name : "error";
    }
    if (!retryable(last)) break;
  }
  return { data: null, status: last };
}

interface LabelValue {
  label?: string;
  value?: string;
}

/** "$1.2B" · "$416,161,000" · "1,234" → 숫자. 실패는 null. */
export function parseNasdaqNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).replace(/[$,\s]/g, "").trim();
  if (!text || text === "N/A" || text === "--") return null;
  const match = text.match(/^(-?\d+(?:\.\d+)?)([TBMK])?%?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] ?? "").toUpperCase();
  const mult = unit === "T" ? 1e12 : unit === "B" ? 1e9 : unit === "M" ? 1e6 : unit === "K" ? 1e3 : 1;
  return value * mult;
}

/**
 * "Jul 22, 2026 8:01 AM ET" → "2026-07-22". 날짜 부분만 뽑는다 —
 * 실측 형식에 `ET` 가 붙어 있어 `Date.parse` 를 그대로 쓰면 NaN 이다.
 */
export function parseNasdaqDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/([A-Za-z]{3,})\s+(\d{1,2}),\s*(\d{4})/);
  if (!match) return null;
  const parsed = Date.parse(`${match[1]} ${match[2]}, ${match[3]} 12:00:00 UTC`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

export interface NasdaqFundamentals {
  displayName: string | null;
  marketData: {
    market_cap: number | null;
    shares_outstanding: number | null;
    price: number | null;
    price_as_of: string | null;
    source: string;
  };
  consensus: FactSheetConsensus;
  classification: FactSheetClassification;
  reported: { dividend_yield?: ReportedNumber };
  errors: string[];
  fetchedAt: string;
}

export async function fetchNasdaqFundamentals(symbol: string): Promise<NasdaqFundamentals> {
  const fetchedAt = new Date().toISOString();
  const errors: string[] = [];
  const upper = symbol.trim().toUpperCase();
  const consensus: FactSheetConsensus = {
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
  };
  const result: NasdaqFundamentals = {
    displayName: null,
    marketData: { market_cap: null, shares_outstanding: null, price: null, price_as_of: null, source: "nasdaq_summary" },
    consensus,
    classification: { sector: null, industry: null, scheme: null, source: null },
    reported: {},
    errors,
    fetchedAt,
  };
  if (!upper) {
    errors.push("nasdaq: 심볼 없음");
    return result;
  }

  // 가격 — info 엔드포인트가 summary 보다 안정적이다(실측: summary 는 비는 경우가 있다).
  const { data: info, status: infoStatus } = await getJson<{
    data?: { companyName?: string; primaryData?: { lastSalePrice?: string; lastTradeTimestamp?: string } };
  }>(`https://api.nasdaq.com/api/quote/${encodeURIComponent(upper)}/info?assetclass=stocks`);
  if (!info) errors.push(`nasdaq: info ${infoStatus}`);
  result.displayName = info?.data?.companyName?.trim() || null;
  const price = parseNasdaqNumber(info?.data?.primaryData?.lastSalePrice);
  const priceAsOf = parseNasdaqDate(info?.data?.primaryData?.lastTradeTimestamp);

  let summary: Record<string, LabelValue> | undefined;
  for (let attempt = 0; attempt < SUMMARY_RETRIES; attempt += 1) {
    if (attempt > 0) await sleep(800 * attempt);
    else await sleep(DELAY_MS);
    const { data, status } = await getJson<{ data?: { summaryData?: Record<string, LabelValue> } }>(
      `https://api.nasdaq.com/api/quote/${encodeURIComponent(upper)}/summary?assetclass=stocks`
    );
    const candidate = data?.data?.summaryData;
    if (candidate && Object.keys(candidate).length > 0) {
      summary = candidate;
      break;
    }
    if (attempt === SUMMARY_RETRIES - 1) errors.push(`nasdaq: summary 빈 응답(${status}) — 시총·섹터 미확인`);
  }

  const marketCap = parseNasdaqNumber(summary?.MarketCap?.value);
  // info 가 실패했을 때의 가격 폴백 — summary 에 전일 종가가 있다. 기준시각은 모르므로 null 로 둔다(추측 금지).
  const previousClose = parseNasdaqNumber(summary?.PreviousClose?.value);
  const effectivePrice = price ?? previousClose;
  const priceSource = price !== null ? "info.lastSalePrice" : previousClose !== null ? "summary.PreviousClose" : "none";
  result.marketData = {
    market_cap: marketCap,
    // Nasdaq 은 상장주식수를 주지 않는다. 시총 ÷ 현재가로 역산하고, SEC 보고 주식수가 있으면 상위에서 덮는다.
    shares_outstanding:
      marketCap !== null && effectivePrice !== null && effectivePrice > 0 ? Math.round(marketCap / effectivePrice) : null,
    price: effectivePrice,
    price_as_of: price !== null ? priceAsOf : null,
    source: `nasdaq_summary.MarketCap+${priceSource}`,
  };
  const sector = summary?.Sector?.value?.trim();
  const industry = summary?.Industry?.value?.trim();
  result.classification = {
    sector: sector && sector !== "N/A" ? sector : null,
    industry: industry && industry !== "N/A" ? industry : null,
    scheme: sector || industry ? "nasdaq_industry" : null,
    source: sector || industry ? "nasdaq_summary.Sector/Industry" : null,
  };
  // 배당수익률 — `Yield` 키는 **종목마다 있기도 없기도 하다**(실측: IBM 은 summary 에 Yield·AnnualizedDividend 가
  // 아예 없고 SpecialDividend* 만 N/A 로 온다). 연간배당금이 있으면 가격으로 나눠 쓰고, 그 사실을 출처에 남긴다.
  const reportedYield = parseNasdaqNumber(summary?.Yield?.value);
  const annualDividend = parseNasdaqNumber(summary?.AnnualizedDividend?.value);
  if (reportedYield !== null) {
    result.reported.dividend_yield = { value: reportedYield, source: "nasdaq_summary.Yield", as_of: priceAsOf };
  } else if (annualDividend !== null && effectivePrice !== null && effectivePrice > 0) {
    result.reported.dividend_yield = {
      value: Number(((annualDividend / effectivePrice) * 100).toFixed(2)),
      source: "computed:nasdaq_summary.AnnualizedDividend÷price",
      as_of: priceAsOf,
    };
  }

  await sleep(DELAY_MS);
  const { data: forecast, status: forecastStatus } = await getJson<{
    data?: {
      yearlyForecast?: { rows?: Array<Record<string, unknown>> };
    };
  }>(`https://api.nasdaq.com/api/analyst/${encodeURIComponent(upper)}/earnings-forecast`);
  if (!forecast) errors.push(`nasdaq: earnings-forecast ${forecastStatus}`);
  const rows = forecast?.data?.yearlyForecast?.rows ?? [];
  const asText = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
  const parsed = rows
    .map((row) => ({
      fiscalEnd: asText(row.fiscalEnd).trim(),
      eps: parseNasdaqNumber(asText(row.consensusEPSForecast)),
      analysts: parseNasdaqNumber(asText(row.noOfEstimates)),
    }))
    .filter((row) => row.eps !== null)
    .sort((a, b) => a.fiscalEnd.localeCompare(b.fiscalEnd));
  if (parsed.length > 0) {
    consensus.available = true;
    consensus.eps_fy1 = parsed[0]!.eps;
    consensus.eps_fy2 = parsed[1]?.eps ?? null;
    consensus.source = "nasdaq_analyst.earnings-forecast";
    consensus.as_of = fetchedAt.slice(0, 10);
    consensus.analyst_count = Math.max(0, ...parsed.map((row) => row.analysts ?? 0)) || null;
    consensus.periods = parsed.map((row) => row.fiscalEnd).filter((v) => !!v);
    // 매출 예상은 이 엔드포인트에 없다(실측). 추정으로 채우지 않는다.
    errors.push("nasdaq: 매출 컨센서스 필드 부재(EPS 예상만 제공) — revenue_fy* 는 결측");
  }

  return result;
}
