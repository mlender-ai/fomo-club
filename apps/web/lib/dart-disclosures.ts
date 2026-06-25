import { STOCK_VOCAB, decodeHtmlEntities } from "@fomo/core";

export interface DartDisclosureHit {
  ticker: string;
  label: string;
  source: string;
  asOf: string;
}

interface DartListItem {
  stock_code?: string;
  corp_name?: string;
  report_nm?: string;
  rcept_dt?: string;
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

function dartKey(): string | undefined {
  if (process.env.DISCOVERY_DART_LIVE !== "1") return undefined;
  return process.env.DART_API_KEY || process.env.DART_CRTFC_KEY;
}

function yyyymmdd(date: string): string {
  return date.replace(/-/g, "").slice(0, 8);
}

function isoFromDartDate(date: string | undefined, fallback: string): string {
  if (!date || !/^\d{8}$/.test(date)) return fallback;
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function cleanReportName(name: string | undefined): string | undefined {
  const cleaned = decodeHtmlEntities(name ?? "")
    .replace(/^\s*(?:\[[^\]]+\]|\([^)]*\))\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || DART_ROUTINE_REPORT.test(cleaned) || !DART_MATERIAL_REPORT.test(cleaned)) return undefined;
  return cleaned.length > 44 ? `${cleaned.slice(0, 42).trim()}…` : cleaned;
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
      out[ticker] = {
        ticker,
        label,
        source: "DART 공시",
        asOf: isoFromDartDate(item.rcept_dt, asOf),
      };
    }
    if (typeof data.total_page === "number" && page >= data.total_page) break;
  }

  return out;
}
