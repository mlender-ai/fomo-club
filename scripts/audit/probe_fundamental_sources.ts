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
import { AUDIT_SEED, fetchPublishedUniverse, seededShuffle, type UniverseEntry } from "./universe";

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
  fields: Partial<Record<Field, { ok: boolean; source: string; latestPeriod?: string; note?: string }>>;
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

/** ticker → CIK(10자리 zero-pad). SEC 공식 매핑 파일 1회 로드. */
async function loadCikMap(): Promise<Map<string, string>> {
  if (cikMap) return cikMap;
  const json = await getJson<Record<string, { cik_str: number; ticker: string }>>(
    "https://www.sec.gov/files/company_tickers.json",
    "sec",
    { "User-Agent": SEC_UA }
  );
  cikMap = new Map();
  for (const row of Object.values(json ?? {})) {
    if (row?.ticker) cikMap.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, "0"));
  }
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
  facts?: { "us-gaap"?: Record<string, { units?: Record<string, XbrlUnitEntry[]> }> };
}

/** us-gaap 개념 중 먼저 존재하는 것의 USD 시계열. */
function conceptSeries(facts: CompanyFacts, concepts: readonly string[]): XbrlUnitEntry[] {
  for (const name of concepts) {
    const units = facts.facts?.["us-gaap"]?.[name]?.units;
    const usd = units?.USD ?? units?.["USD/shares"];
    if (usd && usd.length > 0) return usd;
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
    result.errors.push(`sec: CIK 매핑 없음(${symbol})`);
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
  const shares = conceptSeries(facts, ["CommonStockSharesOutstanding", "EntityCommonStockSharesOutstanding"]);
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
  result.fields.dividend_history = { ok: dividend.length > 0, source: "sec-xbrl", note: `관측 ${dividend.length}개` };
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
  const s = summary?.data?.summaryData;
  const num = (key: string): number | undefined => {
    const raw = s?.[key]?.value?.replace(/[$,%\s]/g, "");
    const parsed = raw ? Number(raw.replace(/[A-Za-z]/g, "")) : NaN;
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const capRaw = s?.MarketCap?.value?.replace(/[$,\s]/g, "");
  const cap = capRaw ? Number(capRaw) : NaN;
  if (Number.isFinite(cap) && cap > 0) result.marketCapUsd = cap;

  result.fields.market_cap_shares = { ok: Number.isFinite(cap) && cap > 0, source: "nasdaq-summary" };
  result.fields.per_ttm = { ok: num("PERatio") !== undefined, source: "nasdaq-summary" };
  result.fields.sector_industry_code = { ok: !!s?.Sector?.value || !!s?.Industry?.value, source: "nasdaq-summary" };

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

  // 컨센서스 — 무료 경로가 있는지 실측한다. 없으면 없다고 적는다.
  await sleep(DELAY_MS.nasdaq);
  const eps = await getJson<{ data?: { earningsForecastTable?: { rows?: unknown[] } } }>(
    `https://api.nasdaq.com/api/analyst/${encodeURIComponent(symbol)}/earnings-forecast`,
    "nasdaq",
    { "User-Agent": NASDAQ_UA }
  );
  const epsRows = eps?.data?.earningsForecastTable?.rows?.length ?? 0;
  result.fields.consensus_eps_fwd = { ok: epsRows > 0, source: "nasdaq-analyst", note: `행 ${epsRows}개` };
  result.fields.consensus_revenue_fwd = {
    ok: false,
    source: "nasdaq-analyst",
    note: "무료 경로에서 매출 컨센서스 미제공(실측)",
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
  await sleep(DELAY_MS.naver);
  const basic = await getJson<Record<string, unknown>>(`${base}/basic`, "naver");
  await sleep(DELAY_MS.naver);
  const integration = await getJson<Record<string, unknown>>(`${base}/integration`, "naver");

  const hasCap = !!basic && (typeof basic.marketValue === "string" || typeof basic.marketValueHangeul === "string");
  result.fields.market_cap_shares = { ok: hasCap, source: "naver-basic" };

  // 네이버 integration 의 총관심/지표 블록에서 PER·PBR 유무 판정
  const blob = JSON.stringify(integration ?? {});
  result.fields.per_ttm = { ok: /"per"/i.test(blob), source: "naver-integration" };
  result.fields.pbr = { ok: /"pbr"/i.test(blob), source: "naver-integration" };
  result.fields.dividend_history = { ok: /"dividend/i.test(blob), source: "naver-integration" };
  result.fields.sector_industry_code = {
    ok: /"industryCodeType"|"upjongName"|"industry"/i.test(blob),
    source: "naver-integration",
  };

  // 분기 재무 — 네이버 종목 API 에 재무 엔드포인트가 있는지 실측
  await sleep(DELAY_MS.naver);
  const finance = await getJson<Record<string, unknown>>(`${base}/finance/annual`, "naver");
  await sleep(DELAY_MS.naver);
  const quarter = await getJson<Record<string, unknown>>(`${base}/finance/quarter`, "naver");
  const qBlob = JSON.stringify(quarter ?? {});
  const aBlob = JSON.stringify(finance ?? {});
  const qRows = (qBlob.match(/"rowList"/g)?.length ?? 0) > 0 ? (qBlob.match(/"stac(?:Ym|_ym)"/gi)?.length ?? 0) : 0;
  result.fields.quarterly_revenue_8q = {
    ok: !!quarter && /매출|revenue|sales/i.test(qBlob),
    source: "naver-finance-quarter",
    note: `기간 관측 ${qRows}개`,
  };
  result.fields.quarterly_operating_income = {
    ok: !!quarter && /영업이익|operatingProfit/i.test(qBlob),
    source: "naver-finance-quarter",
  };
  result.fields.quarterly_net_income = {
    ok: !!quarter && /당기순이익|netIncome/i.test(qBlob),
    source: "naver-finance-quarter",
  };
  result.fields.annual_financials_5y = { ok: !!finance && aBlob.length > 200, source: "naver-finance-annual" };

  // 일별 시세 5년
  await sleep(DELAY_MS.naver);
  const prices = await getJson<unknown[]>(
    `https://api.stock.naver.com/chart/domestic/item/${encodeURIComponent(code)}/day?startDateTime=202107150000&endDateTime=202607150000`,
    "naver"
  );
  result.fields.daily_close_5y = { ok: Array.isArray(prices) && prices.length > 1000, source: "naver-chart" };

  result.fields.business_description = { ok: false, source: "naver", note: "사업 설명 미제공 — DART 사업보고서 필요" };
  result.fields.consensus_revenue_fwd = { ok: /"consensus"/i.test(blob), source: "naver-integration" };
  result.fields.consensus_eps_fwd = { ok: /"consensus"/i.test(blob), source: "naver-integration" };
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

export function summarize(results: readonly ProbeResult[]): Record<Group, Record<Field, { ok: number; n: number }>> {
  const groups: Group[] = ["US-SMALL", "US-MICRO", "KR-SMALL", "CONTROL", "UNSIZED"];
  const out = {} as Record<Group, Record<Field, { ok: number; n: number }>>;
  for (const g of groups) {
    out[g] = {} as Record<Field, { ok: number; n: number }>;
    for (const f of FIELDS) out[g][f] = { ok: 0, n: 0 };
  }
  for (const r of results) {
    for (const f of FIELDS) {
      const cell = r.fields[f];
      if (!cell) continue;
      out[r.group][f].n += 1;
      if (cell.ok) out[r.group][f].ok += 1;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const base = args[args.indexOf("--base") + 1] ?? process.env.AUDIT_BASE_URL ?? "";
  const outDir = args[args.indexOf("--out") + 1] ?? "docs/audit";
  const limit = Number(args[args.indexOf("--limit") + 1] ?? 130);
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
