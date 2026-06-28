import { parseFredCsvLatest, buildFredDoc, FRED_SERIES, stockDef, sectorOf, type SourceDoc } from "@fomo/core";

/**
 * FRED 수집 — DATA_ENGINE_STRATEGY §4.5 C-2. (네트워크)
 *
 * 기본은 **키리스 공개 엔드포인트**(fredgraph.csv) — API 키 없이 동작.
 * FRED_API_KEY 가 있으면 공식 JSON API 로 업그레이드(더 견고). 둘 다 실패 시 빈 배열(정직한 폴백).
 *
 * 키리스 CSV 는 전체 히스토리가 커서 타임아웃 → cosd(최근 시작일)로 구간 제한.
 */

const FRED_API_KEY = process.env["FRED_API_KEY"] ?? "";
const UA = "Mozilla/5.0 (compatible; FomoClubBot/1.0)";
/** 최근 N일만 — 월간(FEDFUNDS/CPI)도 충분히 커버하면서 페이로드를 작게. */
const LOOKBACK_DAYS = 150;

/** 테마 → FRED 시리즈. 공개 공식 데이터로 설명 가능한 축만 매핑한다. */
const FRED_THEME_SERIES: Record<string, string[]> = {
  금리: ["FEDFUNDS", "DGS10", "DGS2"],
  거시: ["SP500", "NASDAQCOM", "VIXCLS", "DGS10"],
  시장: ["SP500", "NASDAQCOM", "VIXCLS"],
  미국: ["SP500", "NASDAQCOM", "VIXCLS"],
  AI: ["NASDAQCOM", "SP500", "DGS10"],
  반도체: ["NASDAQCOM", "SP500", "DGS10"],
  클라우드: ["NASDAQCOM", "SP500", "DGS10"],
  소프트웨어: ["NASDAQCOM", "SP500", "DGS10"],
  보안: ["NASDAQCOM", "SP500", "DGS10"],
  전기차: ["NASDAQCOM", "DCOILWTICO", "DGS10"],
  자동차: ["DCOILWTICO", "DGS10", "SP500"],
  "2차전지": ["DCOILWTICO", "DGS10", "NASDAQCOM"],
  바이오: ["NASDAQCOM", "DGS10", "SP500"],
  제약: ["NASDAQCOM", "DGS10", "SP500"],
  유통: ["CPIAUCSL", "UNRATE", "DGS10"],
  건설: ["DGS10", "T10YIE", "SP500"],
  조선: ["DCOILWTICO", "DEXKOUS", "SP500"],
  방산: ["SP500", "DGS10", "DEXKOUS"],
  원자력: ["DCOILWTICO", "DGS10", "SP500"],
  에너지: ["DCOILWTICO", "VIXCLS", "DGS10"],
  정유: ["DCOILWTICO", "VIXCLS", "DGS10"],
  화장품: ["DEXKOUS", "CPIAUCSL", "NASDAQCOM"],
  금융: ["DGS10", "DGS2", "FEDFUNDS"],
};

const STOCK_THEME_HINTS: readonly [RegExp, readonly string[]][] = [
  [/반도체|하이닉스|원익|테크|칩|소재|전자|마이크론|엔비디아|AMD|TSMC|브로드컴/i, ["반도체"]],
  [/AI|인공지능|클라우드|소프트|데이터|보안|사운드하운드|팔란티어|마이크로소프트/i, ["AI"]],
  [/전기차|자동차|배터리|2차전지|리튬|테슬라|리비안|루시드/i, ["전기차", "2차전지"]],
  [/바이오|제약|헬스|신약|임상|릴리|노보|모더나/i, ["바이오"]],
  [/건설|시멘트|부동산|인프라/i, ["건설"]],
  [/조선|해운|선박|엔진/i, ["조선"]],
  [/방산|항공|우주|로켓/i, ["방산"]],
  [/원전|원자력|에너지|전력|태양광|정유|오일|석유/i, ["에너지"]],
  [/유통|소비|화장품|면세|백화점/i, ["유통", "화장품"]],
  [/은행|증권|금융|핀테크|코인|로빈후드|코인베이스/i, ["금융"]],
];

export interface FredStockOptions {
  market?: string;
  country?: string;
}

function cosd(): string {
  const d = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(d); // YYYY-MM-DD
}

/** 키리스 CSV 경로. 실패 시 null. */
async function fetchCsvLatest(seriesId: string): Promise<{ date: string; value: number } | null> {
  try {
    const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}&cosd=${cosd()}`;
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/csv,*/*" },
      signal: AbortSignal.timeout(15_000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return parseFredCsvLatest(await res.text());
  } catch (err) {
    console.warn(`[fred] csv ${seriesId} error`, err);
    return null;
  }
}

interface FredJsonResp {
  observations?: { date: string; value: string }[];
}

/** 키 있을 때 공식 JSON API(더 견고). 실패 시 null → CSV 폴백. */
async function fetchJsonLatest(seriesId: string): Promise<{ date: string; value: number } | null> {
  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}` +
      `&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=10&observation_start=${cosd()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as FredJsonResp;
    for (const o of data.observations ?? []) {
      const v = Number.parseFloat(o.value);
      if (Number.isFinite(v)) return { date: o.date, value: v };
    }
    return null;
  } catch (err) {
    console.warn(`[fred] json ${seriesId} error`, err);
    return null;
  }
}

/** 테마의 FRED 공식 데이터 SourceDoc[]. idStart 부터 id 부여(S{n}). 미매핑/실패 시 빈 배열. */
export async function fetchFredDocs(theme: string, makeId: () => string): Promise<SourceDoc[]> {
  const series = FRED_THEME_SERIES[theme];
  if (!series || series.length === 0) return [];
  return fetchFredDocsForSeries(series, makeId);
}

function uniqueSeries(series: readonly string[]): string[] {
  return [...new Set(series.filter((id) => FRED_SERIES[id]))];
}

function stockThemes(stock: string, opts: FredStockOptions = {}): string[] {
  const def = stockDef(stock);
  const themes = new Set<string>();
  const sector = def ? sectorOf(def.canonical) : undefined;
  if (sector) themes.add(sector);
  for (const [pattern, values] of STOCK_THEME_HINTS) {
    if (pattern.test(stock)) values.forEach((value) => themes.add(value));
  }
  const country = opts.country ?? def?.country;
  const market = opts.market ?? def?.market;
  if (country === "US" || /NYSE|NASDAQ|AMEX/i.test(market ?? "")) themes.add("미국");
  if (themes.size === 0) themes.add("거시");
  return [...themes];
}

export function fredSeriesForStock(stock: string, opts: FredStockOptions = {}): string[] {
  const series = stockThemes(stock, opts).flatMap((theme) => FRED_THEME_SERIES[theme] ?? []);
  const country = opts.country ?? stockDef(stock)?.country;
  const broad = country === "US" ? ["SP500", "NASDAQCOM", "VIXCLS"] : ["DEXKOUS", "VIXCLS", "DGS10"];
  return uniqueSeries([...series, ...broad]).slice(0, 4);
}

/** 종목 상세용 공식 거시 지표. 개별 종목의 주장으로 해석하지 않고 배경 지표로만 노출한다. */
export async function fetchFredDocsForStock(
  stock: string,
  opts: FredStockOptions,
  makeId: () => string
): Promise<SourceDoc[]> {
  return fetchFredDocsForSeries(fredSeriesForStock(stock, opts), makeId);
}

async function fetchFredDocsForSeries(series: readonly string[], makeId: () => string): Promise<SourceDoc[]> {
  const target = uniqueSeries(series);
  if (target.length === 0) return [];
  const settled = await Promise.allSettled(
    target.map(async (s) => {
      // 키 있으면 JSON 우선, 실패하면 키리스 CSV 로 폴백.
      const obs = (FRED_API_KEY && (await fetchJsonLatest(s))) || (await fetchCsvLatest(s));
      return obs ? { seriesId: s, obs } : null;
    })
  );

  const docs: SourceDoc[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value && FRED_SERIES[r.value.seriesId]) {
      const doc = buildFredDoc(makeId(), r.value.seriesId, r.value.obs);
      if (doc) docs.push(doc);
    }
  }
  return docs;
}
