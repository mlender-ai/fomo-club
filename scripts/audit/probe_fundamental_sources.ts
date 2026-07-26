/**
 * WO-SUB-00 §4-3 — 펀더멘털 데이터 커버리지 실사(GO/NO-GO 게이트).
 *
 * **문서 조사가 아니라 실제 조회다.** 각 셀은 요청 수/성공 수로 뒷받침된다.
 * 확보율이 낮게 나오면 낮게 적는다 — 추정값으로 메우지 않는다(원칙 3).
 *
 * 실행:
 *   npx tsx scripts/audit/probe_fundamental_sources.ts --base https://<prod> --out docs/audit/
 *
 * 주의: 개발 샌드박스는 외부 egress 가 차단돼 있어 여기서 실행하면 전부 실패로 잡힌다.
 * 실측은 egress 가 있는 환경(GitHub Actions 워크플로 substance-audit.yml)에서 돌린다.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { AUDIT_SEED, fetchPublishedUniverse, flag, numericFlag, seededShuffle, type UniverseEntry } from "./universe";

const NASDAQ_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
/** SEC 는 연락처가 담긴 UA 를 요구한다(없으면 403). */
const SEC_UA = process.env.SEC_USER_AGENT || "FOMO Club research contact@fomoclub.app";

const TIMEOUT_MS = 15_000;
/** 소스별 예의 지연 — SEC 10 req/s, Nasdaq·Naver 는 더 보수적으로. */
const DELAY_MS = { sec: 120, nasdaq: 350, naver: 250, dart: 250 } as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Group = "US-SMALL" | "US-MICRO" | "KR-SMALL" | "CONTROL" | "UNSIZED";

export const FIELDS = [
  "quarterly_revenue_8q",
  "quarterly_operating_income",
  "quarterly_net_income",
  "annual_financials_5y",
  "market_cap_shares",
  "sector_industry_code",
  "per_ttm",
  "pbr",
  "dividend_history",
  "daily_close_5y",
  "consensus_revenue_fwd",
  "consensus_eps_fwd",
  "business_description",
] as const;
export type Field = (typeof FIELDS)[number];

export interface ProbeResult {
  canonical: string;
  symbol?: string;
  naverCode?: string;
  country: "KR" | "US";
  group: Group;
  marketCapUsd?: number;
  /** 필드 → { ok, source, latestPeriod?, note? } */
  /** unknown=true 면 "없다"가 아니라 "재보지 못했다" — 집계에서 분모에도 넣지 않는다. */
  fields: Partial<Record<Field, { ok: boolean; unknown?: boolean; source: string; latestPeriod?: string; note?: string }>>;
  errors: string[];
}

interface Counter {
  requests: number;
  ok: number;
  failed: number;
  statusCounts: Record<string, number>;
}

const counters: Record<string, Counter> = {};

function bump(source: string, status: string, ok: boolean): void {
  const c = (counters[source] ??= { requests: 0, ok: 0, failed: 0, statusCounts: {} });
  c.requests += 1;
  if (ok) c.ok += 1;
  else c.failed += 1;
  c.statusCounts[status] = (c.statusCounts[status] ?? 0) + 1;
}

async function getJson<T>(url: string, source: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    bump(source, String(res.status), res.ok);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (error) {
    bump(source, error instanceof Error ? error.name : "error", false);
    return null;
  }
}

// ── SEC EDGAR ────────────────────────────────────────────────────────────────

let cikMap: Map<string, string> | null = null;
/** 매핑 로드가 실패했는지 — 실패했으면 US 필드를 "없음"이 아니라 "미확인"으로 처리해야 한다. */
export let cikMapFailed = false;

/**
 * ticker → CIK(10자리 zero-pad). SEC 공식 매핑 파일.
 *
 * 3차 실측에서 이 파일이 403 을 뱉어 CONTROL 그룹의 SEC 파생 필드가 전부 n=0 이 됐다.
 * 그때 결과를 그대로 적었으면 "대형주 재무 확보 0%"라는 명백한 거짓이 문서에 박혔을 것이다.
 * 백오프 재시도하고, 그래도 실패하면 실패 사실을 남겨 해당 필드를 집계에서 뺀다.
 */
async function loadCikMap(): Promise<Map<string, string>> {
  if (cikMap) return cikMap;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(1_500 * attempt);
    const json = await getJson<Record<string, { cik_str: number; ticker: string }>>(
      "https://www.sec.gov/files/company_tickers.json",
      "sec",
      { "User-Agent": SEC_UA, "Accept-Encoding": "gzip, deflate" }
    );
    const entries = Object.values(json ?? {});
    if (entries.length > 0) {
      cikMap = new Map();
      for (const row of entries) {
        if (row?.ticker) cikMap.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, "0"));
      }
      return cikMap;
    }
  }
  cikMapFailed = true;
  cikMap = new Map();
  return cikMap;
}

interface XbrlUnitEntry {
  end?: string;
  start?: string;
  val?: number;
  form?: string;
  fp?: string;
  fy?: number;
}
interface CompanyFacts {
  facts?: Record<string, Record<string, { units?: Record<string, XbrlUnitEntry[]> }>>;
}

/**
 * 개념 시계열. 네임스페이스를 us-gaap 으로 한정하면 **주식수(dei)를 못 찾는다** —
 * 2차 실측에서 대형주 PBR 이 0/11 로 나온 원인이었다. 전 네임스페이스를 훑는다.
 */
function conceptSeries(facts: CompanyFacts, concepts: readonly string[]): XbrlUnitEntry[] {
  for (const name of concepts) {
    for (const ns of Object.values(facts.facts ?? {})) {
      const units = ns?.[name]?.units;
      const series = units?.USD ?? units?.["USD/shares"] ?? units?.shares ?? units?.pure;
      if (series && series.length > 0) return series;
    }
  }
  return [];
}

/** 분기 보고(10-Q/10-K)의 서로 다른 기간 끝점 개수. */
function quarterlyCount(series: readonly XbrlUnitEntry[]): { count: number; latest?: string } {
  const ends = new Set<string>();
  let latest: string | undefined;
  for (const e of series) {
    if (!e.end || !e.form) continue;
    if (!/10-[QK]/.test(e.form)) continue;
    // 기간형(start 존재)은 대략 1분기 길이만 — 누적치(YTD) 배제
    if (e.start) {
      const days = (Date.parse(e.end) - Date.parse(e.start)) / 86_400_000;
      if (days > 115) continue;
    }
    ends.add(e.end);
    if (!latest || e.end > latest) latest = e.end;
  }
  return { count: ends.size, ...(latest ? { latest } : {}) };
}

function annualCount(series: readonly XbrlUnitEntry[]): number {
  const years = new Set<number>();
  for (const e of series) {
    if (e.form === "10-K" && typeof e.fy === "number") years.add(e.fy);
  }
  return years.size;
}

async function probeSec(entry: UniverseEntry, result: ProbeResult): Promise<void> {
  const symbol = entry.symbol?.toUpperCase();
  if (!symbol) return;
  const map = await loadCikMap();
  const cik = map.get(symbol);
  if (!cik) {
    const reason = cikMapFailed ? "sec: CIK 매핑 파일 로드 실패 — 미확인" : `sec: CIK 매핑 없음(${symbol})`;
    result.errors.push(reason);
    // 매핑 자체를 못 받은 경우는 "데이터가 없다"가 아니다. 미확인으로 남겨 분모에서 뺀다.
    if (cikMapFailed) {
      for (const f of ["quarterly_revenue_8q", "quarterly_operating_income", "quarterly_net_income", "annual_financials_5y", "pbr", "per_ttm"] as const) {
        result.fields[f] = { ok: false, unknown: true, source: "sec-xbrl", note: "CIK 매핑 로드 실패" };
      }
    }
    return;
  }
  await sleep(DELAY_MS.sec);
  const facts = await getJson<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, "sec", {
    "User-Agent": SEC_UA,
  });
  if (!facts) return;

  const revenue = conceptSeries(facts, [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "InterestAndDividendIncomeOperating", // 은행
  ]);
  const operating = conceptSeries(facts, ["OperatingIncomeLoss"]);
  const net = conceptSeries(facts, ["NetIncomeLoss", "ProfitLoss"]);
  const equity = conceptSeries(facts, [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ]);
  const shares = conceptSeries(facts, [
    "EntityCommonStockSharesOutstanding", // dei 네임스페이스
    "CommonStockSharesOutstanding",
    "CommonStockSharesIssued",
    "WeightedAverageNumberOfDilutedSharesOutstanding",
  ]);
  const eps = conceptSeries(facts, ["EarningsPerShareDiluted", "EarningsPerShareBasic"]);
  const dividend = conceptSeries(facts, ["CommonStockDividendsPerShareDeclared", "PaymentsOfDividendsCommonStock"]);

  const q = quarterlyCount(revenue);
  result.fields.quarterly_revenue_8q = {
    ok: q.count >= 8,
    source: "sec-xbrl",
    ...(q.latest ? { latestPeriod: q.latest } : {}),
    note: `분기 관측 ${q.count}개`,
  };
  const qo = quarterlyCount(operating);
  result.fields.quarterly_operating_income = { ok: qo.count >= 8, source: "sec-xbrl", note: `분기 관측 ${qo.count}개` };
  const qn = quarterlyCount(net);
  result.fields.quarterly_net_income = { ok: qn.count >= 8, source: "sec-xbrl", note: `분기 관측 ${qn.count}개` };
  result.fields.annual_financials_5y = {
    ok: annualCount(revenue) >= 5 || annualCount(net) >= 5,
    source: "sec-xbrl",
    note: `연간 매출 ${annualCount(revenue)}개 / 순이익 ${annualCount(net)}개`,
  };
  // PBR 계산 가능 = 자기자본 + 주식수(+가격). 가격은 Nasdaq 단계에서 별도 판정.
  result.fields.pbr = {
    ok: equity.length > 0 && shares.length > 0,
    source: "sec-xbrl",
    note: `자기자본 ${equity.length} / 주식수 ${shares.length}`,
  };
  // 배당은 Nasdaq summary(AnnualizedDividend/Yield)에도 있다 — 둘 중 하나면 확보로 본다.
  if (!result.fields.dividend_history?.ok) {
    result.fields.dividend_history = { ok: dividend.length > 0, source: "sec-xbrl", note: `관측 ${dividend.length}개` };
  }
  // PER TTM "계산 가능 여부" — 가격(Nasdaq)과 EPS(SEC)가 모두 있으면 계산 가능.
  const hasPrice = result.fields.market_cap_shares?.ok === true;
  result.fields.per_ttm = {
    ok: hasPrice && eps.length > 0,
    source: "nasdaq-price × sec-eps",
    note: `EPS 관측 ${eps.length}개`,
  };
}

// ── Nasdaq (현재 프로덕션이 쓰는 소스) ──────────────────────────────────────

interface NasdaqLabelValue {
  label?: string;
  value?: string;
}

async function probeNasdaq(entry: UniverseEntry, result: ProbeResult): Promise<void> {
  const symbol = entry.symbol?.toUpperCase();
  if (!symbol) return;
  await sleep(DELAY_MS.nasdaq);
  const summary = await getJson<{ data?: { summaryData?: Record<string, NasdaqLabelValue> } }>(
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/summary?assetclass=stocks`,
    "nasdaq",
    { "User-Agent": NASDAQ_UA }
  );
  // 실측한 키(2차 실측 CLBK 덤프): Exchange, Sector, Industry, OneYrTarget, TodayHighLow,
  // ShareVolume, AverageVolume, PreviousClose, FiftTwoWeekHighLow, MarketCap,
  // AnnualizedDividend, ExDividendDate, DividendPaymentDate, Yield
  // → PERatio·BookValue 는 **이 엔드포인트에 없다.** 추측 키로 세면 0% 가 잘못 나온다.
  const s = summary?.data?.summaryData;
  const capRaw = s?.MarketCap?.value?.replace(/[$,\s]/g, "");
  const cap = capRaw ? Number(capRaw) : Number.NaN;
  if (Number.isFinite(cap) && cap > 0) result.marketCapUsd = cap;

  result.fields.market_cap_shares = {
    ok: Number.isFinite(cap) && cap > 0,
    source: "nasdaq-summary.MarketCap",
  };
  result.fields.sector_industry_code = {
    ok: !!s?.Sector?.value || !!s?.Industry?.value,
    source: "nasdaq-summary.Sector/Industry",
  };
  const dividend = s?.AnnualizedDividend?.value?.trim();
  const yieldVal = s?.Yield?.value?.trim();
  result.fields.dividend_history = {
    ok: !!(dividend && dividend !== "N/A") || !!(yieldVal && yieldVal !== "N/A"),
    source: "nasdaq-summary.AnnualizedDividend/Yield",
    note: `배당 ${dividend ?? "-"} / 수익률 ${yieldVal ?? "-"}`,
  };

  await sleep(DELAY_MS.nasdaq);
  const profile = await getJson<{ data?: { CompanyDescription?: { value?: string } } }>(
    `https://api.nasdaq.com/api/company/${encodeURIComponent(symbol)}/company-profile`,
    "nasdaq",
    { "User-Agent": NASDAQ_UA }
  );
  const desc = profile?.data?.CompanyDescription?.value?.trim();
  result.fields.business_description = {
    ok: !!desc && desc.length > 40,
    source: "nasdaq-company-profile",
    note: desc ? `${desc.length}자` : "없음",
  };

  // 컨센서스 — 실측 구조: data.quarterlyForecast.rows[] / data.yearlyForecast.rows[]
  // 각 행 키: fiscalEnd, consensusEPSForecast, highEPSForecast, lowEPSForecast, noOfEstimates, up, down
  await sleep(DELAY_MS.nasdaq);
  const forecast = await getJson<{
    data?: {
      quarterlyForecast?: { rows?: Array<{ consensusEPSForecast?: string; noOfEstimates?: string }> };
      yearlyForecast?: { rows?: Array<{ consensusEPSForecast?: string; noOfEstimates?: string }> };
    };
  }>(`https://api.nasdaq.com/api/analyst/${encodeURIComponent(symbol)}/earnings-forecast`, "nasdaq", {
    "User-Agent": NASDAQ_UA,
  });
  const yearly = forecast?.data?.yearlyForecast?.rows ?? [];
  const quarterly = forecast?.data?.quarterlyForecast?.rows ?? [];
  const epsRows = [...yearly, ...quarterly].filter((r) => {
    const v = r.consensusEPSForecast?.replace(/[$,\s]/g, "");
    return !!v && v !== "N/A" && Number.isFinite(Number(v));
  });
  const estimates = Math.max(
    0,
    ...[...yearly, ...quarterly].map((r) => Number(r.noOfEstimates ?? 0)).filter((n) => Number.isFinite(n))
  );
  result.fields.consensus_eps_fwd = {
    ok: epsRows.length > 0,
    source: "nasdaq-analyst.earnings-forecast",
    note: `예상 행 ${epsRows.length}개 / 애널리스트 최대 ${estimates}명`,
  };
  // 매출 컨센서스는 이 엔드포인트에 **없다**(EPS 만 제공) — 실측 결과 그대로.
  result.fields.consensus_revenue_fwd = {
    ok: false,
    source: "nasdaq-analyst.earnings-forecast",
    note: "EPS 예상만 제공. 매출 예상 필드 부재(실측)",
  };

  // 일별 종가 5년 — historical 엔드포인트. limit 을 충분히 올려 실제 반환 행수를 센다.
  await sleep(DELAY_MS.nasdaq);
  const from = new Date(Date.now() - 5 * 365 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const hist = await getJson<{ data?: { totalRecords?: number; tradesTable?: { rows?: unknown[] } } }>(
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=stocks&fromdate=${from}&todate=${to}&limit=9999`,
    "nasdaq",
    { "User-Agent": NASDAQ_UA }
  );
  const rows = hist?.data?.tradesTable?.rows?.length ?? 0;
  result.fields.daily_close_5y = {
    ok: rows > 1000,
    source: "nasdaq-historical",
    note: `반환 행 ${rows}개(총 ${hist?.data?.totalRecords ?? 0})`,
  };
}

// ── Naver (KR, 현재 프로덕션이 쓰는 소스) ───────────────────────────────────

async function probeNaver(entry: UniverseEntry, result: ProbeResult): Promise<void> {
  const code = entry.naverCode;
  if (!code) {
    result.errors.push("naver: 종목코드 없음");
    return;
  }
  const base = `https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}`;

  // integration — 실측 구조: totalInfos[{code,key,value}](18개), industryCode, consensusInfo,
  // industryCompareInfo[].marketValue. 시총·PER·PBR 은 **basic 이 아니라 여기** 있다.
  await sleep(DELAY_MS.naver);
  const integration = await getJson<{
    totalInfos?: Array<{ code?: string; key?: string; value?: string }>;
    industryCode?: string;
    consensusInfo?: { recommMean?: string; priceTargetMean?: string } | null;
  }>(`${base}/integration`, "naver");

  const infos = integration?.totalInfos ?? [];
  const info = (...needles: string[]): string | undefined => {
    const hit = infos.find((i) => needles.some((n) => i.code === n || i.key === n));
    const v = hit?.value?.trim();
    return v && v !== "-" && v !== "N/A" ? v : undefined;
  };
  result.fields.market_cap_shares = {
    ok: !!info("marketValue", "시가총액", "marketValueHangeul"),
    source: "naver-integration.totalInfos",
    note: `totalInfos ${infos.length}개`,
  };
  result.fields.per_ttm = { ok: !!info("per", "PER"), source: "naver-integration.totalInfos" };
  result.fields.pbr = { ok: !!info("pbr", "PBR"), source: "naver-integration.totalInfos" };
  result.fields.dividend_history = {
    ok: !!info("dividendYieldRatio", "배당수익률", "dvr"),
    source: "naver-integration.totalInfos",
  };
  result.fields.sector_industry_code = {
    ok: !!integration?.industryCode,
    source: "naver-integration.industryCode",
    note: integration?.industryCode ? `업종코드 ${integration.industryCode}` : "없음",
  };
  // 컨센서스 — 실측: recommMean(투자의견 평균)·priceTargetMean(목표주가)만 있다.
  // **매출·EPS 예상치가 아니다.** 목표주가는 우리 원칙상 쓰지도 않는다.
  result.fields.consensus_revenue_fwd = {
    ok: false,
    source: "naver-integration.consensusInfo",
    note: "투자의견·목표주가만 제공. 매출 예상 부재(실측)",
  };

  // finance/quarter — 실측 구조: financeInfo.trTitleList[{isConsensus,title,key}],
  // financeInfo.rowList[{title,columns}](16개), corporationSummary.comment1..3
  await sleep(DELAY_MS.naver);
  const quarter = await getJson<{
    financeInfo?: {
      trTitleList?: Array<{ isConsensus?: boolean; title?: string; key?: string }>;
      rowList?: Array<{ title?: string; columns?: Record<string, unknown> }>;
    };
    corporationSummary?: { comment1?: string; comment2?: string; comment3?: string } | null;
  }>(`${base}/finance/quarter`, "naver");

  const rowList = quarter?.financeInfo?.rowList ?? [];
  const titles = quarter?.financeInfo?.trTitleList ?? [];
  const rowTitled = (...needles: string[]) =>
    rowList.some((r) => needles.some((n) => (r.title ?? "").replace(/\s/g, "").includes(n)));
  const periodCount = titles.filter((t) => !t.isConsensus).length;

  // 매출 행 존재 여부만 본다. 앞선 실행에서 `periodCount >= 4` 조건을 걸었더니 매출만 0/45 가 됐는데,
  // 영업이익·순이익은 44/45 였다 — 즉 데이터가 없는 게 아니라 **내 조건이 틀렸다**.
  // trTitleList.isConsensus 의 의미를 확인하지 못했으므로 판정에 쓰지 않고 관측치만 남긴다.
  result.fields.quarterly_revenue_8q = {
    ok: rowTitled("매출액", "영업수익", "매출"),
    source: "naver-finance-quarter.rowList",
    note: `기간 컬럼 ${titles.length}개(비예상 ${periodCount}) / 행 ${rowList.length}개`,
  };
  result.fields.quarterly_operating_income = {
    ok: rowTitled("영업이익"),
    source: "naver-finance-quarter.rowList",
  };
  result.fields.quarterly_net_income = {
    ok: rowTitled("당기순이익"),
    source: "naver-finance-quarter.rowList",
  };
  // 예상 컬럼(isConsensus)이 있으면 forward 추정이 실제로 붙어 있다는 뜻.
  // isConsensus 가 "예상치 컬럼"을 뜻하는지 확인하지 못했다. 의미 미확인 플래그를 근거로
  // 확보율을 세면 잘못된 GO 판정으로 이어진다 → 미확인(unknown)으로 남긴다.
  const consensusCols = titles.filter((t) => t.isConsensus).length;
  result.fields.consensus_eps_fwd = {
    ok: false,
    unknown: true,
    source: "naver-finance-quarter.trTitleList[isConsensus]",
    note: `isConsensus 컬럼 ${consensusCols}개 — 플래그 의미 미확인`,
  };

  // **사업 설명이 있다** — 2차 실측에서 corporationSummary.comment1~3(한국어 3문장) 확인.
  // 1차에서 하드코딩 false 로 둔 것은 틀린 판정이었다.
  const summary = [quarter?.corporationSummary?.comment1, quarter?.corporationSummary?.comment2, quarter?.corporationSummary?.comment3]
    .filter((c): c is string => !!c && c.trim().length > 0);
  result.fields.business_description = {
    ok: summary.join("").trim().length > 40,
    source: "naver-finance-quarter.corporationSummary",
    note: `문장 ${summary.length}개 / ${summary.join("").length}자`,
  };

  await sleep(DELAY_MS.naver);
  const annual = await getJson<{ financeInfo?: { rowList?: unknown[] } }>(`${base}/finance/annual`, "naver");
  result.fields.annual_financials_5y = {
    ok: (annual?.financeInfo?.rowList?.length ?? 0) > 0,
    source: "naver-finance-annual.rowList",
  };

  await sleep(DELAY_MS.naver);
  const prices = await getJson<unknown[]>(
    `https://api.stock.naver.com/chart/domestic/item/${encodeURIComponent(code)}/day?startDateTime=202107150000&endDateTime=202607150000`,
    "naver"
  );
  result.fields.daily_close_5y = {
    ok: Array.isArray(prices) && prices.length > 1000,
    source: "naver-chart-day",
    note: Array.isArray(prices) ? `${prices.length}일` : "실패",
  };
}

// ── DART (KR 공시 — 키 필요) ────────────────────────────────────────────────

async function probeDart(entry: UniverseEntry, result: ProbeResult): Promise<void> {
  const key = process.env.DART_API_KEY || process.env.DART_CRTFC_KEY;
  if (!key) {
    result.errors.push("dart: API 키 없음 — 미확인");
    return;
  }
  const code = entry.naverCode;
  if (!code) return;
  await sleep(DELAY_MS.dart);
  // corpCode 매핑 없이 stock_code 로 바로 조회되지 않으므로, 정기공시 존재만 실측한다.
  const year = new Date().getUTCFullYear();
  const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${key}&bgn_de=${year - 1}0101&pblntf_ty=A&page_count=10`;
  const json = await getJson<{ status?: string; list?: unknown[] }>(url, "dart");
  const ok = json?.status === "000" && (json.list?.length ?? 0) > 0;
  result.fields.business_description = {
    ok,
    source: "dart-periodic",
    note: ok ? "정기공시 목록 조회 성공(본문 파싱은 별도 스파이크 필요)" : "조회 실패",
  };
}

// ── 실행 ────────────────────────────────────────────────────────────────────

function groupOf(entry: UniverseEntry, capUsd?: number): Group {
  if (entry.country === "KR") return "KR-SMALL";
  if (capUsd === undefined) return "UNSIZED";
  if (capUsd < 300_000_000) return "US-MICRO";
  if (capUsd <= 2_000_000_000) return "US-SMALL";
  return "CONTROL";
}

export async function probeAll(entries: readonly UniverseEntry[]): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  for (const [i, entry] of entries.entries()) {
    const result: ProbeResult = {
      canonical: entry.canonical,
      ...(entry.symbol ? { symbol: entry.symbol } : {}),
      ...(entry.naverCode ? { naverCode: entry.naverCode } : {}),
      country: entry.country,
      group: "UNSIZED",
      fields: {},
      errors: [],
    };
    try {
      if (entry.country === "US") {
        await probeNasdaq(entry, result);
        await probeSec(entry, result);
        // 일별 종가 5년 — SEC/Nasdaq 무료 경로에 없음. 실측 결과를 그대로 남긴다.
        result.fields.daily_close_5y = { ok: false, source: "-", note: "무료 경로 미확보(실측)" };
      } else {
        await probeNaver(entry, result);
        await probeDart(entry, result);
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
    result.group = groupOf(entry, result.marketCapUsd);
    results.push(result);
    if ((i + 1) % 10 === 0) console.log(`  … ${i + 1}/${entries.length} 완료`);
  }
  return results;
}

export function summarize(
  results: readonly ProbeResult[]
): Record<Group, Record<Field, { ok: number; n: number; unknown: number }>> {
  const groups: Group[] = ["US-SMALL", "US-MICRO", "KR-SMALL", "CONTROL", "UNSIZED"];
  const out = {} as Record<Group, Record<Field, { ok: number; n: number; unknown: number }>>;
  for (const g of groups) {
    out[g] = {} as Record<Field, { ok: number; n: number; unknown: number }>;
    for (const f of FIELDS) out[g][f] = { ok: 0, n: 0, unknown: 0 };
  }
  for (const r of results) {
    for (const f of FIELDS) {
      const cell = r.fields[f];
      if (!cell) continue;
      // 미확인은 분모에서 뺀다 — "재보지 못한 것"을 "없는 것"으로 세면 확보율이 낮게 왜곡된다.
      if (cell.unknown) {
        out[r.group][f].unknown += 1;
        continue;
      }
      out[r.group][f].n += 1;
      if (cell.ok) out[r.group][f].ok += 1;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const base = flag(args, "--base") ?? process.env.AUDIT_BASE_URL ?? "";
  const outDir = flag(args, "--out") ?? "docs/audit";
  const limit = numericFlag(args, "--limit", 130);
  if (!base) {
    console.error("--base <프로덕션 URL> 필요 (발행 카드 유니버스를 여기서 가져온다)");
    process.exit(2);
  }

  console.log(`[probe] 유니버스 로드 — ${base}`);
  const universe = await fetchPublishedUniverse(base);
  console.log(`[probe] 발행 카드 유니버스 ${universe.length}종목 (시드 ${AUDIT_SEED} 로 셔플)`);
  if (universe.length === 0) throw new Error("유니버스가 비었다 — 표본 없이 매트릭스를 채우지 않는다");

  const sample = seededShuffle(universe, AUDIT_SEED).slice(0, limit);
  console.log(`[probe] 표본 ${sample.length}종목 조회 시작`);
  const results = await probeAll(sample);

  mkdirSync(outDir, { recursive: true });
  const payload = {
    seed: AUDIT_SEED,
    probedAt: new Date().toISOString(),
    baseUrl: base,
    universeSize: universe.length,
    sampleSize: sample.length,
    requestCounters: counters,
    summary: summarize(results),
    results,
  };
  writeFileSync(join(outDir, "fundamental_coverage_raw.json"), JSON.stringify(payload, null, 2));
  console.log(`[probe] 저장 — ${join(outDir, "fundamental_coverage_raw.json")}`);
  console.log(JSON.stringify({ counters, summary: payload.summary }, null, 2));
}

if (process.argv[1] && process.argv[1].includes("probe_fundamental_sources")) {
  main().catch((error) => {
    console.error("[probe] 실패", error);
    process.exit(1);
  });
}
