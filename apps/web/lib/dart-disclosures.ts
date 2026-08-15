import { STOCK_VOCAB, decodeHtmlEntities } from "@fomo/core";

export interface DartDisclosureHit {
  ticker: string;
  label: string;
  source: string;
  asOf: string;
  url?: string;
  insiderPurchase?: {
    ownerRole: string;
    shares?: number;
    price?: number;
    value?: number;
    transactionDate: string;
  };
}

interface DartListItem {
  stock_code?: string;
  corp_name?: string;
  report_nm?: string;
  rcept_dt?: string;
  rcept_no?: string;
}

interface DartListResponse {
  status?: string;
  message?: string;
  list?: DartListItem[];
  page_no?: number;
  total_page?: number;
}

const DART_LIST_URL = "https://opendart.fss.or.kr/api/list.json";
const DART_PAGE_COUNT = 100;
const DART_MAX_PAGES = 3;
const DART_MATERIAL_REPORT =
  /단일판매|공급계약|수주|주요사항보고|유상증자|무상증자|자기주식|타법인|합병|분할|영업양수|영업양도|소송|조회공시|투자판단|시설투자|신규시설|특허권|임상|기술이전|라이선스/i;
const DART_ROUTINE_REPORT =
  /사업보고서|반기보고서|분기보고서|증권발행실적|투자설명서|첨부정정|정정신고|임원ㆍ주요주주|임원·주요주주|주식등의대량보유|최대주주등소유주식변동/i;
const DART_INSIDER_OWNERSHIP_REPORT = /임원[ㆍ·]?\s*주요주주.*특정증권.*소유상황보고서/i;
const DART_INSIDER_PURCHASE_TEXT = /장내매수|매수|취득/i;
const DART_INSIDER_LOOKBACK_DAYS = 7;

/**
 * 내부자 스캔 시간 예산 (WO-OPS-504 PHASE 2 실측 대응).
 *
 * 이 스캔은 **완전 직렬**이다 — 7일 × 최대 3페이지(목록 fetch, 각 8초 타임아웃) + 매칭된
 * 항목마다 문서 fetch(6초 타임아웃). 최악은 분 단위이고 **상한이 없다.** 프리뷰 실측
 * (2026-08-15): `discovery?country=KR` 이 이 단계에서 19.97초를 쓰고도 안 끝나 25초 마감을
 * 넘겼다. 공시가 쌓일수록 이 값은 커진다 — 그래서 "왜 하필 지금 임계를 넘었나" 의 답이 여기 있다.
 *
 * 예산을 넘기면 **그때까지 찾은 것만 돌려준다.** 호출부는 이미 `.catch(() => ({}))` 로
 * fail-open 이므로 부분 결과는 계약 위반이 아니다 — 다만 **잘렸다는 사실은 로그로 남긴다**
 * (조용한 절단 금지). 근본 수리(병렬화·크론 이관)는 PHASE 4 다.
 */
const DART_INSIDER_BUDGET_MS = 8_000;

function dartKey(): string | undefined {
  if (process.env.DISCOVERY_DART_LIVE === "0") return undefined;
  return process.env.DART_API_KEY || process.env.DART_CRTFC_KEY;
}

function yyyymmdd(date: string): string {
  return date.replace(/-/g, "").slice(0, 8);
}

function isoFromDartDate(date: string | undefined, fallback: string): string {
  if (!date || !/^\d{8}$/.test(date)) return fallback;
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function isoOffset(date: string, offsetDays: number): string {
  const base = new Date(`${date.slice(0, 10)}T12:00:00+09:00`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

function recentDates(date: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => isoOffset(date, -index));
}

function dartReportUrl(rceptNo: string | undefined): string | undefined {
  const no = rceptNo?.trim();
  return no && /^\d+$/.test(no) ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${no}` : undefined;
}

function cleanReportName(name: string | undefined): string | undefined {
  const cleaned = decodeHtmlEntities(name ?? "")
    .replace(/^\s*(?:\[[^\]]+\]|\([^)]*\))\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || DART_ROUTINE_REPORT.test(cleaned) || !DART_MATERIAL_REPORT.test(cleaned)) return undefined;
  return cleaned.length > 44 ? `${cleaned.slice(0, 42).trim()}…` : cleaned;
}

function cleanInsiderReportName(name: string | undefined): string | undefined {
  const cleaned = decodeHtmlEntities(name ?? "")
    .replace(/^\s*(?:\[[^\]]+\]|\([^)]*\))\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return DART_INSIDER_OWNERSHIP_REPORT.test(cleaned) ? cleaned : undefined;
}

function numberFromKoreanText(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactWon(value: number): string {
  if (value >= 100_000_000) return `${Math.round(value / 100_000_000).toLocaleString("ko-KR")}억`;
  if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만`;
  return value.toLocaleString("ko-KR");
}

function compactShares(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만주`;
  return `${value.toLocaleString("ko-KR")}주`;
}

async function fetchDartReportText(rceptNo: string | undefined): Promise<string | undefined> {
  const url = dartReportUrl(rceptNo);
  if (!url) return undefined;
  const res = await fetch(url, {
    headers: { accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(6_000),
    next: { revalidate: 3_600 },
  });
  if (!res.ok) return undefined;
  return stripHtml(await res.text());
}

async function insiderPurchaseFromDartItem(
  ticker: string,
  item: DartListItem,
  asOf: string,
): Promise<DartDisclosureHit | null> {
  if (!cleanInsiderReportName(item.report_nm)) return null;
  const text = await fetchDartReportText(item.rcept_no).catch(() => undefined);
  if (!text || !DART_INSIDER_PURCHASE_TEXT.test(text)) return null;
  const shares = numberFromKoreanText(text.match(/(?:매수|취득|장내매수)[^\d]{0,24}(\d[\d,]*)\s*주/)?.[1])
    ?? numberFromKoreanText(text.match(/(\d[\d,]*)\s*주[^\n]{0,40}(?:매수|취득|장내매수)/)?.[1]);
  const price = numberFromKoreanText(text.match(/(?:단가|취득가액|가격)[^\d]{0,16}(\d[\d,]*)\s*원/)?.[1]);
  const value = shares && price ? shares * price : undefined;
  const reportedAt = isoFromDartDate(item.rcept_dt, asOf);
  const amountText = value ? `${compactWon(value)}원 규모` : shares ? `${compactShares(shares)}` : "특정증권";
  const hit: DartDisclosureHit = {
    ticker,
    label: `임원·주요주주가 ${amountText} 취득 신고 · ${Number(reportedAt.slice(5, 7))}/${Number(reportedAt.slice(8, 10))}`,
    source: "DART 내부자 공시",
    asOf: reportedAt,
    insiderPurchase: {
      ownerRole: "임원·주요주주",
      ...(shares ? { shares } : {}),
      ...(price ? { price } : {}),
      ...(value ? { value } : {}),
      transactionDate: reportedAt,
    },
  };
  const url = dartReportUrl(item.rcept_no);
  if (url) hit.url = url;
  return hit;
}

async function fetchDartPage(key: string, date: string, page: number): Promise<DartListResponse | null> {
  const url = new URL(DART_LIST_URL);
  url.searchParams.set("crtfc_key", key);
  url.searchParams.set("bgn_de", yyyymmdd(date));
  url.searchParams.set("end_de", yyyymmdd(date));
  url.searchParams.set("page_no", String(page));
  url.searchParams.set("page_count", String(DART_PAGE_COUNT));
  url.searchParams.set("sort", "date");
  url.searchParams.set("sort_mth", "desc");
  const res = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
    next: { revalidate: 900 },
  });
  if (!res.ok) return null;
  return (await res.json()) as DartListResponse;
}

export async function fetchDartDisclosuresByStock(asOf: string): Promise<Record<string, DartDisclosureHit>> {
  const key = dartKey();
  if (!key) return {};

  const byCode = new Map(STOCK_VOCAB.filter((stock) => stock.naverCode).map((stock) => [stock.naverCode!, stock.canonical]));
  const out: Record<string, DartDisclosureHit> = {};

  for (let page = 1; page <= DART_MAX_PAGES; page += 1) {
    const data = await fetchDartPage(key, asOf, page).catch(() => null);
    if (!data?.list?.length || (data.status && data.status !== "000")) break;
    for (const item of data.list) {
      const code = item.stock_code?.trim();
      const ticker = code ? byCode.get(code) : undefined;
      if (!ticker || out[ticker]) continue;
      const label = cleanReportName(item.report_nm);
      if (!label) continue;
      const url = dartReportUrl(item.rcept_no);
      const hit: DartDisclosureHit = {
        ticker,
        label,
        source: "DART 공시",
        asOf: isoFromDartDate(item.rcept_dt, asOf),
      };
      if (url) hit.url = url;
      out[ticker] = hit;
    }
    if (typeof data.total_page === "number" && page >= data.total_page) break;
  }

  return out;
}

export async function fetchDartInsiderPurchasesByStock(asOf: string): Promise<Record<string, DartDisclosureHit>> {
  const key = dartKey();
  if (!key) return {};

  const byCode = new Map(STOCK_VOCAB.filter((stock) => stock.naverCode).map((stock) => [stock.naverCode!, stock.canonical]));
  const out: Record<string, DartDisclosureHit> = {};

  const startedAt = Date.now();
  const overBudget = () => Date.now() - startedAt > DART_INSIDER_BUDGET_MS;
  let truncatedAt: string | undefined;

  for (const date of recentDates(asOf, DART_INSIDER_LOOKBACK_DAYS)) {
    if (overBudget()) { truncatedAt = date; break; }
    for (let page = 1; page <= DART_MAX_PAGES; page += 1) {
      const data = await fetchDartPage(key, date, page).catch(() => null);
      if (!data?.list?.length || (data.status && data.status !== "000")) break;
      for (const item of data.list) {
        const code = item.stock_code?.trim();
        const ticker = code ? byCode.get(code) : undefined;
        if (!ticker || out[ticker] || !cleanInsiderReportName(item.report_nm)) continue;
        // 문서 fetch 는 항목당 최대 6초다 — 예산을 넘긴 뒤에는 새로 시작하지 않는다.
        if (overBudget()) { truncatedAt = date; break; }
        const hit = await insiderPurchaseFromDartItem(ticker, item, date);
        if (hit) out[ticker] = hit;
      }
      if (truncatedAt || (typeof data.total_page === "number" && page >= data.total_page)) break;
    }
  }

  if (truncatedAt) {
    // 조용히 자르지 않는다 — 커버리지가 줄었다는 사실이 남아야 한다.
    console.warn(
      `[dart-disclosures] 내부자 스캔 예산 초과 — ${Date.now() - startedAt}ms, ${truncatedAt} 이전 날짜 미조회, ` +
        `${Object.keys(out).length}종목 확보`
    );
  }

  return out;
}

export async function fetchDartDisclosuresForCode(
  code: string,
  stock: string,
  asOf: string
): Promise<DartDisclosureHit[]> {
  const key = dartKey();
  const normalized = code.trim();
  if (!key || !/^\d{6}$/.test(normalized)) return [];

  const out: DartDisclosureHit[] = [];
  for (let page = 1; page <= DART_MAX_PAGES; page += 1) {
    const data = await fetchDartPage(key, asOf, page).catch(() => null);
    if (!data?.list?.length || (data.status && data.status !== "000")) break;
    for (const item of data.list) {
      if (item.stock_code?.trim() !== normalized) continue;
      const label = cleanReportName(item.report_nm);
      if (!label) continue;
      const url = dartReportUrl(item.rcept_no);
      const hit: DartDisclosureHit = {
        ticker: stock,
        label,
        source: "DART 공시",
        asOf: isoFromDartDate(item.rcept_dt, asOf),
      };
      if (url) hit.url = url;
      out.push(hit);
    }
    if (typeof data.total_page === "number" && page >= data.total_page) break;
  }
  return out;
}

export async function fetchDartInsiderPurchasesForCode(
  code: string,
  stock: string,
  asOf: string
): Promise<DartDisclosureHit[]> {
  const key = dartKey();
  const normalized = code.trim();
  if (!key || !/^\d{6}$/.test(normalized)) return [];

  const out: DartDisclosureHit[] = [];
  for (const date of recentDates(asOf, DART_INSIDER_LOOKBACK_DAYS)) {
    for (let page = 1; page <= DART_MAX_PAGES; page += 1) {
      const data = await fetchDartPage(key, date, page).catch(() => null);
      if (!data?.list?.length || (data.status && data.status !== "000")) break;
      for (const item of data.list) {
        if (item.stock_code?.trim() !== normalized || !cleanInsiderReportName(item.report_nm)) continue;
        const hit = await insiderPurchaseFromDartItem(stock, item, date);
        if (hit) out.push(hit);
      }
      if (typeof data.total_page === "number" && page >= data.total_page) break;
    }
  }
  return out;
}
