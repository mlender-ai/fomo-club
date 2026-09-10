import type { DailyClose, FactSheetClassification, FactSheetConsensus, PointObservation, QuarterRecord, SharesPoint } from "@fomo/core";
import { krIndustryName } from "@fomo/core";
import type { ReportedNumber } from "@fomo/core";

/**
 * 네이버 종목 API 어댑터 (WO-SUB-01 §7-1, KR 시장데이터·보조 재무).
 *
 * 이미 프로덕션이 쓰는 무료·무인증 소스(`apps/web/lib/stock-basics.ts` 와 동일 계열)다.
 *
 * 실측으로 확인한 함정:
 *  · 시총·PER·PBR·EPS·BPS·배당은 `/basic` 이 아니라 **`/integration` 의 `totalInfos[]`** 에 있고,
 *    각 항목이 `valueDesc`(기준 분기)를 함께 준다 → `as_of` 를 만들 수 있다.
 *  · `trTitleList[].isConsensus` 는 **문자열 `"Y"`/`"N"`** 이다. WO-SUB-00 실사는 이걸 boolean 으로
 *    읽어 "전 컬럼 true" 라고 기록했는데, 문자열 `"N"` 이 truthy 였을 뿐이다.
 *    실제로는 **마지막 한 컬럼만 `"Y"`(예상치)** 이며, 그 컬럼이 매출·EPS 컨센서스다.
 *  · `consensusInfo` 의 `priceTargetMean`(목표주가)은 **우리 원칙상 금지 값**이라 읽지 않는다.
 *  · 재무 표 단위: 매출/이익 = **억원**, EPS/BPS/주당배당금 = 원, 비율 = %.
 *  · 재무 표에는 **공시일이 없다.** 법정 제출기한을 보수적 상한으로 쓴다(`filed_at_source`).
 *  · 일별 차트(`api.stock.naver.com/chart/domestic/item/{code}/day`)는 **액면분할 조정 종가**다.
 *    실측 검증: 카카오(035720) 2021-04-14 종가가 112,000(분할 전 명목가 560,000이 아니다).
 */

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const TIMEOUT_MS = 15_000;
const DELAY_MS = 250;
/** 억원 → 원. */
const EOK = 100_000_000;
/** 정기보고서 법정 제출기한(사업연도/분기 종료 후 일수) — 자본시장법 §159·§160. */
const ANNUAL_DEADLINE_DAYS = 90;
const QUARTER_DEADLINE_DAYS = 45;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 재시도할 상태 — 409(네이버 레이트리밋 실측)·5xx·타임아웃. 404 는 재시도하지 않는다. */
function retryable(status: string): boolean {
  return status === "409" || status === "429" || status.startsWith("5") || status === "TimeoutError";
}

async function getJson<T>(url: string, retries = 2): Promise<{ data: T | null; status: string }> {
  let last = "unknown";
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(700 * attempt);
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

interface NaverTotalInfo {
  code?: string;
  key?: string;
  value?: string;
  valueDesc?: string;
}

interface NaverIntegration {
  stockName?: string;
  totalInfos?: NaverTotalInfo[];
  industryCode?: string;
  consensusInfo?: { createDate?: string; recommMean?: string } | null;
}

interface NaverFinanceRow {
  title?: string;
  columns?: Record<string, { value?: string } | undefined>;
}

interface NaverFinance {
  financeInfo?: {
    trTitleList?: Array<{ isConsensus?: string | boolean; title?: string; key?: string }>;
    rowList?: NaverFinanceRow[];
  };
  corporationSummary?: { comment1?: string; comment2?: string; comment3?: string } | null;
}

interface NaverChartRow {
  localDate?: string;
  closePrice?: number;
}

/** "9,469억" · "1.2조" · "68,600" · "12.05배" · "0.73%" → 숫자. 실패는 null. */
export function parseNaverNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const text = raw.replace(/,/g, "").trim();
  if (!text || text === "-" || text === "N/A") return null;
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*(조|억|만)?/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2];
  if (unit === "조") return value * 1_000_000_000_000;
  if (unit === "억") return value * EOK;
  if (unit === "만") return value * 10_000;
  return value;
}

/** "2026.03." → "2026-03-31"(그 분기 말일). */
export function periodKeyToEnd(key: string): string | null {
  const match = key.match(/^(\d{4})(\d{2})$/) ?? key.match(/^(\d{4})\.(\d{2})\.?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function periodLabel(periodEnd: string, annual: boolean): string {
  const year = periodEnd.slice(0, 4);
  if (annual) return `${year}FY`;
  return `${year}Q${Math.ceil(Number(periodEnd.slice(5, 7)) / 3)}`;
}

/** 표 행 조회 — 공백을 제거하고 부분일치. */
function rowValue(rows: readonly NaverFinanceRow[], key: string, titles: readonly string[]): number | null {
  for (const title of titles) {
    const row = rows.find((r) => (r.title ?? "").replace(/\s/g, "") === title);
    const raw = row?.columns?.[key]?.value;
    const parsed = parseNaverNumber(raw);
    if (parsed !== null) return parsed;
  }
  return null;
}

/**
 * 업종 코드 → `classification`. 네이버는 숫자 코드만 주므로 이름은 고정 표(`KR_INDUSTRY_NAMES`)로 해석한다.
 * 표에 없는 코드(잔여 버킷 `25 기타` 포함)는 **업종을 모르는 것**이므로 `sector`·`industry` 를 비운다 —
 * 그래야 WO-SUB-02 가 `UNCLASSIFIED` 로 안전하게 떨어진다. 코드 자체는 감사용으로 `source` 에 남긴다.
 */
export function classificationOf(industryCode: string | null | undefined): FactSheetClassification {
  const code = industryCode?.trim() || null;
  const name = krIndustryName(code);
  if (!name) {
    return {
      sector: null,
      industry: null,
      scheme: null,
      source: code ? `naver_integration.industryCode=${code}(미등재)` : null,
    };
  }
  return {
    // 네이버 업종 체계는 GICS 계열 단일 레벨이다 — 섹터와 산업을 나눌 상위 축이 없으므로 같은 값을 넣고
    // scheme 으로 그 사실을 밝힌다(WO-SUB-02 는 scheme 별 매핑 테이블로 읽는다).
    sector: name,
    industry: name,
    scheme: "naver_industry",
    source: `naver_integration.industryCode=${code}`,
  };
}

export interface NaverFundamentals {
  displayName: string | null;
  quarters: QuarterRecord[];
  annual: QuarterRecord[];
  /** 자기자본 시점값 — BPS × 기준주식수로 만든다(주식수를 모르면 비어 있다). */
  equity: PointObservation[];
  /**
   * 연간 주당배당금 — 네이버 연간표 `주당배당금` 행. **주당 기준으로 직접 오는 값이다.**
   * 배당총액 ÷ 주식수로 역산하지 않는다(연도별 주식수가 없어 과거 연도가 틀린 값이 된다).
   * 컨센서스 열은 `parseFinanceTable` 이 실적 레코드에서 제외하므로 여기에도 안 들어온다.
   */
  dpsAnnual: PointObservation[];
  closes: DailyClose[];
  sharesSeries: SharesPoint[];
  marketData: {
    market_cap: number | null;
    shares_outstanding: number | null;
    price: number | null;
    price_as_of: string | null;
    source: string;
  };
  consensus: FactSheetConsensus;
  classification: FactSheetClassification;
  reported: {
    per_ttm?: ReportedNumber;
    pbr?: ReportedNumber;
    per_forward?: ReportedNumber;
    dividend_yield?: ReportedNumber;
  };
  /** 사업 설명 3문장(WO-SUB-03 이 3슬롯에 매핑할 원문). 여기서는 보관만 한다. */
  businessSummary: string[];
  /** 부채비율(%) — 소스가 직접 준 값. */
  reportedDebtRatioPct: ReportedNumber | null;
  errors: string[];
  fetchedAt: string;
}

function emptyConsensus(): FactSheetConsensus {
  return {
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
}

/** 예상 컬럼 판정 — `isConsensus` 는 문자열 "Y"/"N" 으로 온다(boolean 아님). */
export function isConsensusColumn(flag: string | boolean | undefined): boolean {
  if (typeof flag === "boolean") return flag;
  return typeof flag === "string" && flag.trim().toUpperCase() === "Y";
}

/** 재무 표 → 분기/연간 레코드. 공시일이 없으므로 법정 제출기한을 보수적으로 쓴다. */
export function parseFinanceTable(
  finance: NaverFinance | null,
  annual: boolean,
  source: string
): { records: QuarterRecord[]; consensusKey: string | null; rows: readonly NaverFinanceRow[] } {
  const rows = finance?.financeInfo?.rowList ?? [];
  const titles = finance?.financeInfo?.trTitleList ?? [];
  const records: QuarterRecord[] = [];
  let consensusKey: string | null = null;
  for (const column of titles) {
    const key = column.key?.trim();
    if (!key) continue;
    if (isConsensusColumn(column.isConsensus)) {
      consensusKey = key;
      continue; // 예상치는 실적 레코드가 아니다 — consensus 블록으로 간다
    }
    const periodEnd = periodKeyToEnd(key);
    if (!periodEnd) continue;
    const revenue = rowValue(rows, key, ["매출액", "영업수익"]);
    const operating = rowValue(rows, key, ["영업이익"]);
    // 지배주주순이익을 우선한다 — PER/EPS 의 표준 분자이고, 비지배지분을 섞으면 주당지표가 어긋난다.
    const net = rowValue(rows, key, ["지배주주순이익", "당기순이익"]);
    const eps = rowValue(rows, key, ["EPS"]);
    if (revenue === null && operating === null && net === null && eps === null) continue;
    records.push({
      period: periodLabel(periodEnd, annual),
      period_end: periodEnd,
      filed_at: addDays(periodEnd, annual ? ANNUAL_DEADLINE_DAYS : QUARTER_DEADLINE_DAYS),
      filed_at_source: "statutory_deadline",
      revenue: revenue === null ? null : revenue * EOK,
      operating_income: operating === null ? null : operating * EOK,
      net_income: net === null ? null : net * EOK,
      eps_diluted: eps,
      source,
      concepts: {
        revenue: "매출액",
        operating_income: "영업이익",
        net_income: "지배주주순이익",
        eps_diluted: "EPS",
      },
    });
  }
  return { records, consensusKey, rows };
}

/** 종목코드(6자리)로 네이버 펀더멘털 일체. */
export async function fetchNaverFundamentals(naverCode: string, closesFrom: string): Promise<NaverFundamentals> {
  const fetchedAt = new Date().toISOString();
  const errors: string[] = [];
  const code = naverCode.trim();
  const base = `https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}`;

  const empty: NaverFundamentals = {
    displayName: null,
    quarters: [],
    annual: [],
    equity: [],
    dpsAnnual: [],
    closes: [],
    sharesSeries: [],
    marketData: { market_cap: null, shares_outstanding: null, price: null, price_as_of: null, source: "naver_integration" },
    consensus: emptyConsensus(),
    classification: { sector: null, industry: null, scheme: null, source: null },
    reported: {},
    businessSummary: [],
    reportedDebtRatioPct: null,
    errors,
    fetchedAt,
  };
  if (!/^\d{6}$/.test(code)) {
    errors.push(`naver: 종목코드 형식 오류(${naverCode})`);
    return empty;
  }

  const { data: integration, status: integrationStatus } = await getJson<NaverIntegration>(`${base}/integration`);
  if (!integration) errors.push(`naver: integration ${integrationStatus}`);
  await sleep(DELAY_MS);
  const { data: quarter, status: quarterStatus } = await getJson<NaverFinance>(`${base}/finance/quarter`);
  if (!quarter) errors.push(`naver: finance/quarter ${quarterStatus}`);
  await sleep(DELAY_MS);
  const { data: annualRaw, status: annualStatus } = await getJson<NaverFinance>(`${base}/finance/annual`);
  if (!annualRaw) errors.push(`naver: finance/annual ${annualStatus}`);
  await sleep(DELAY_MS);
  const start = closesFrom.replace(/-/g, "");
  const end = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const { data: chart, status: chartStatus } = await getJson<NaverChartRow[]>(
    `https://api.stock.naver.com/chart/domestic/item/${encodeURIComponent(code)}/day?startDateTime=${start}0000&endDateTime=${end}0000`
  );
  if (!Array.isArray(chart)) errors.push(`naver: chart/day ${chartStatus}`);

  const infos = integration?.totalInfos ?? [];
  const info = (code2: string): NaverTotalInfo | undefined => infos.find((i) => i.code === code2);
  const asOfOf = (entry: NaverTotalInfo | undefined): string | null => {
    const end2 = entry?.valueDesc ? periodKeyToEnd(entry.valueDesc.replace(/\./g, "").trim()) : null;
    return end2;
  };
  const reportedOf = (code2: string, source: string): ReportedNumber | undefined => {
    const entry = info(code2);
    const value = parseNaverNumber(entry?.value);
    return value === null ? undefined : { value, source, as_of: asOfOf(entry) };
  };

  const marketCap = parseNaverNumber(info("marketValue")?.value);
  const price = parseNaverNumber(info("lastClosePrice")?.value);
  const shares = marketCap !== null && price !== null && price > 0 ? Math.round(marketCap / price) : null;

  const quarterParsed = parseFinanceTable(quarter ?? null, false, "naver_finance_quarter");
  const annualParsed = parseFinanceTable(annualRaw ?? null, true, "naver_finance_annual");

  // 연간 예상 컬럼 = FY1 컨센서스. 분기 예상 컬럼은 다음 분기 예상이라 FY 슬롯에 넣지 않는다.
  const consensus = emptyConsensus();
  const consensusKey = annualParsed.consensusKey;
  if (consensusKey) {
    const revenue = rowValue(annualParsed.rows, consensusKey, ["매출액", "영업수익"]);
    const eps = rowValue(annualParsed.rows, consensusKey, ["EPS"]);
    if (revenue !== null || eps !== null) {
      consensus.available = true;
      consensus.revenue_fy1 = revenue === null ? null : revenue * EOK;
      consensus.eps_fy1 = eps;
      consensus.source = "naver_finance_annual.isConsensus";
      // 컨센서스 산출일 — integration.consensusInfo.createDate 가 있으면 그것이 기준일이다.
      consensus.as_of = integration?.consensusInfo?.createDate?.trim() || periodKeyToEnd(consensusKey);
      consensus.periods = [consensusKey];
    }
  }

  const closes: DailyClose[] = (Array.isArray(chart) ? chart : [])
    .filter((row) => typeof row.closePrice === "number" && /^\d{8}$/.test(row.localDate ?? ""))
    .map((row) => ({
      date: `${row.localDate!.slice(0, 4)}-${row.localDate!.slice(4, 6)}-${row.localDate!.slice(6, 8)}`,
      close: row.closePrice!,
    }));

  // 자기자본 시점값 = BPS × 기준주식수. BPS 는 연간 표에서 온다(공시일은 분기 표와 같은 기준).
  const equity: PointObservation[] = [];
  if (shares !== null) {
    for (const record of annualParsed.records) {
      const key = `${record.period_end.slice(0, 4)}${record.period_end.slice(5, 7)}`;
      const bps = rowValue(annualParsed.rows, key, ["BPS"]);
      if (bps === null) continue;
      equity.push({ period_end: record.period_end, filed_at: record.filed_at, value: bps * shares });
    }
  }

  /**
   * 연간 주당배당금 (2026-08-06).
   *
   * `MATURE_INCOME` 막대축(`annual_dps`)이 소스에 없다고 판정돼 유니버스 10장 전원 차트가
   * 숨겨져 있었다. 실측하니 **네이버 연간표가 `주당배당금` 행을 그대로 준다** — 총액에서
   * 역산할 필요가 없다. 원 단위이므로 억원 환산(EOK)을 하지 않는다.
   */
  const dpsAnnual: PointObservation[] = [];
  for (const record of annualParsed.records) {
    const key = `${record.period_end.slice(0, 4)}${record.period_end.slice(5, 7)}`;
    const dps = rowValue(annualParsed.rows, key, ["주당배당금"]);
    // 0 은 "배당을 하지 않았다"는 사실이므로 버리지 않는다. null 만 건너뛴다.
    if (dps === null) continue;
    // **출처를 점에 직접 싣는다.** 비워두면 조립 단계의 회계 소스 폴백(분기 표)이 찍혀
    // 연간표에서 온 값이 `naver_finance_quarter` 로 기록된다 — 실측으로 겪은 결함이다.
    dpsAnnual.push({
      period_end: record.period_end,
      filed_at: record.filed_at,
      value: dps,
      source: "naver_finance_annual.주당배당금",
    });
  }

  const summary = [
    quarter?.corporationSummary?.comment1,
    quarter?.corporationSummary?.comment2,
    quarter?.corporationSummary?.comment3,
  ].filter((c): c is string => !!c && c.trim().length > 0);

  const debtRatio = annualParsed.records.length > 0
    ? (() => {
        const last = annualParsed.records[annualParsed.records.length - 1]!;
        const key = `${last.period_end.slice(0, 4)}${last.period_end.slice(5, 7)}`;
        const value = rowValue(annualParsed.rows, key, ["부채비율"]);
        return value === null ? null : { value, source: "naver_finance_annual.부채비율", as_of: last.period_end };
      })()
    : null;

  return {
    displayName: integration?.stockName?.trim() || null,
    quarters: quarterParsed.records,
    annual: annualParsed.records,
    equity,
    dpsAnnual,
    closes,
    sharesSeries: shares !== null ? [{ as_of: closes[closes.length - 1]?.date ?? new Date().toISOString().slice(0, 10), shares }] : [],
    marketData: {
      market_cap: marketCap,
      shares_outstanding: shares,
      price,
      price_as_of: closes[closes.length - 1]?.date ?? null,
      source: "naver_integration.totalInfos",
    },
    consensus,
    classification: classificationOf(integration?.industryCode),
    reported: {
      ...(reportedOf("per", "naver_integration.per") ? { per_ttm: reportedOf("per", "naver_integration.per")! } : {}),
      ...(reportedOf("pbr", "naver_integration.pbr") ? { pbr: reportedOf("pbr", "naver_integration.pbr")! } : {}),
      ...(reportedOf("cnsPer", "naver_integration.cnsPer") ? { per_forward: reportedOf("cnsPer", "naver_integration.cnsPer")! } : {}),
      ...(reportedOf("dividendYieldRatio", "naver_integration.dividendYieldRatio")
        ? { dividend_yield: reportedOf("dividendYieldRatio", "naver_integration.dividendYieldRatio")! }
        : {}),
    },
    businessSummary: summary,
    reportedDebtRatioPct: debtRatio,
    errors,
    fetchedAt,
  };
}
