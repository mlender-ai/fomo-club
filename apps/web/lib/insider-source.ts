/**
 * 내부자 클러스터 매수 발굴 소스 (US, DATA_ENGINE_STRATEGY 선행/수급 축).
 *
 * openinsider "latest cluster buys"(여러 내부자가 동반 매수한 공개시장 매수, SEC Form 4 집계)를
 * 매일 수집해 조용한 종목까지 발굴 카드로 띄운다. 현재가/스파크라인은 Yahoo chart(무료·무차단)로 보강한다.
 *
 * 순수 데이터(LLM 0). 관측 서술만 — 매수·매도 판단/예측 없음.
 * openinsider가 막히거나 비면 조용히 빈 배열(fail-open) — 제품은 기존 US 유니버스로 정상 동작.
 */

const OPENINSIDER_CLUSTER_URL = "http://openinsider.com/latest-cluster-buys";
/** Yahoo chart 호스트 폴백(둘 다 429 나면 시세는 best-effort 생략, 카드는 openinsider 근거로 정상). */
const YAHOO_CHART_HOSTS = [
  "https://query1.finance.yahoo.com/v8/finance/chart",
  "https://query2.finance.yahoo.com/v8/finance/chart",
] as const;
const UA = "Mozilla/5.0 (compatible; FomoClubBot/1.0)";
const YAHOO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** 노이즈 컷 — 소액·단독 매수 제외. 클러스터(내부자 2인+) & 총액 $100k+ 만 발굴. */
const MIN_INSIDER_COUNT = 2;
const MIN_TOTAL_VALUE_USD = 100_000;
/** 상위 N개만(비용·집중). 총액 큰 순. */
const MAX_CLUSTER_ROWS = 20;
/** 접수(공개) 후 N일 이내 공시만 — 오래된 매집은 발굴 대상에서 제외(최근 누적만). */
const MAX_FILING_AGE_DAYS = 21;
const YAHOO_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 12_000;

export interface InsiderClusterBuy {
  symbol: string;
  companyName: string;
  industry?: string;
  /** 동반 매수한 내부자 수(openinsider "Ins"). */
  insiderCount: number;
  /** 최근 거래일(YYYY-MM-DD). */
  tradeDate: string;
  /** 공시 접수일(YYYY-MM-DD). */
  filingDate: string;
  /** 매수 단가($). */
  buyPrice?: number;
  /** 지분 변동률(%) — openinsider "ΔOwn". */
  ownershipDeltaPct?: number;
  /** 총 매수 금액($). */
  valueUsd: number;
}

export interface InsiderClusterQuote {
  /** Yahoo 현재가($). */
  price?: number;
  currency?: string;
  changePct?: number;
  sparkline?: number[];
}

export type InsiderClusterCandidate = InsiderClusterBuy & { quote?: InsiderClusterQuote };

async function fetchText(url: string, ua: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": ua, Accept: "text/html,application/json" }, signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function numFrom(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const n = Number(text.replace(/[$,%+\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function isoDate(text: string | undefined): string {
  const m = (text ?? "").match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
}

/**
 * openinsider "latest cluster buys" 테이블 파싱.
 * 열: [0]X [1]Filing [2]Trade [3]Ticker [4]Company [5]Industry [6]Ins [7]TradeType [8]Price [9]Qty [10]Owned [11]ΔOwn [12]Value ...
 */
export function parseOpenInsiderClusterBuys(html: string): InsiderClusterBuy[] {
  const tableMatch = html.match(/<table[^>]*class="tinytable"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return [];
  const rows = (tableMatch[1] ?? "").match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const out: InsiderClusterBuy[] = [];
  for (const rowHtml of rows) {
    const cellMatches = rowHtml.match(/<td[^>]*>[\s\S]*?<\/td>/gi);
    if (!cellHasEnough(cellMatches)) continue;
    const cells = cellMatches.map((c) => stripTags(c));
    const tradeType = cells[7] ?? "";
    if (!/purchase/i.test(tradeType)) continue;
    // 티커: 셀[3]에 툴팁 잔여물이 붙으므로 href="/TICKER"에서 추출.
    const tickerMatch = rowHtml.match(/href="\/([A-Z][A-Z.]{0,5})"/);
    const symbol = tickerMatch?.[1]?.toUpperCase();
    if (!symbol) continue;
    const insiderCount = numFrom(cells[6]) ?? 0;
    const valueUsd = numFrom(cells[12]) ?? 0;
    if (insiderCount < MIN_INSIDER_COUNT) continue;
    if (valueUsd < MIN_TOTAL_VALUE_USD) continue;
    const buyPrice = numFrom(cells[8]);
    const ownershipDeltaPct = numFrom(cells[11]);
    out.push({
      symbol,
      companyName: cells[4] ?? symbol,
      ...(cells[5] ? { industry: cells[5] } : {}),
      insiderCount,
      tradeDate: isoDate(cells[2]),
      filingDate: isoDate(cells[1]),
      ...(buyPrice !== undefined ? { buyPrice } : {}),
      ...(ownershipDeltaPct !== undefined ? { ownershipDeltaPct } : {}),
      valueUsd,
    });
  }
  return out;
}

function cellHasEnough(cells: RegExpMatchArray | null): cells is RegExpMatchArray {
  return Boolean(cells && cells.length >= 13);
}

function filingAgeDays(filingDate: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filingDate)) return undefined;
  const filed = Date.parse(`${filingDate}T00:00:00Z`);
  if (!Number.isFinite(filed)) return undefined;
  return Math.floor((Date.now() - filed) / 86_400_000);
}

/** 최근 접수(공개)분만 유지 → 심볼 중복 제거(총액 큰 것) → 총액 내림차순 상위 N. */
function dedupeAndRank(rows: InsiderClusterBuy[]): InsiderClusterBuy[] {
  const best = new Map<string, InsiderClusterBuy>();
  for (const row of rows) {
    const age = filingAgeDays(row.filingDate);
    if (age === undefined || age < 0 || age > MAX_FILING_AGE_DAYS) continue;
    const prev = best.get(row.symbol);
    if (!prev || row.valueUsd > prev.valueUsd) best.set(row.symbol, row);
  }
  return [...best.values()].sort((a, b) => b.valueUsd - a.valueUsd).slice(0, MAX_CLUSTER_ROWS);
}

async function fetchYahooQuote(symbol: string): Promise<InsiderClusterQuote | undefined> {
  let text: string | null = null;
  for (const host of YAHOO_CHART_HOSTS) {
    text = await fetchText(`${host}/${encodeURIComponent(symbol)}?interval=1d&range=1mo`, YAHOO_UA);
    if (text && text.trimStart().startsWith("{")) break; // 429/HTML 응답이면 다음 호스트
    text = null;
  }
  if (!text) return undefined;
  try {
    const json = JSON.parse(text);
    const result = json?.chart?.result?.[0];
    if (!result) return undefined;
    const meta = result.meta ?? {};
    const closesRaw: Array<number | null> = result.indicators?.quote?.[0]?.close ?? [];
    const closes = closesRaw.filter((c): c is number => typeof c === "number" && Number.isFinite(c));
    const price: number | undefined = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : closes.at(-1);
    const prevClose =
      typeof meta.chartPreviousClose === "number"
        ? meta.chartPreviousClose
        : closes.length >= 2
          ? closes[closes.length - 2]
          : undefined;
    const changePct =
      typeof price === "number" && typeof prevClose === "number" && prevClose !== 0
        ? ((price - prevClose) / prevClose) * 100
        : undefined;
    return {
      ...(typeof price === "number" ? { price } : {}),
      ...(typeof meta.currency === "string" ? { currency: meta.currency } : {}),
      ...(typeof changePct === "number" ? { changePct } : {}),
      ...(closes.length >= 2 ? { sparkline: closes.slice(-30) } : {}),
    };
  } catch {
    return undefined;
  }
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await fn(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

/**
 * 오늘자 내부자 클러스터 매수 후보(현재가 보강 포함).
 * 실데이터만 — 소스 실패 시 빈 배열(fail-open).
 */
export async function fetchInsiderClusterCandidates(): Promise<InsiderClusterCandidate[]> {
  const html = await fetchText(OPENINSIDER_CLUSTER_URL, UA);
  if (!html) return [];
  const ranked = dedupeAndRank(parseOpenInsiderClusterBuys(html));
  if (ranked.length === 0) return [];
  const quotes = await mapLimit(ranked, YAHOO_CONCURRENCY, (row) => fetchYahooQuote(row.symbol).catch(() => undefined));
  return ranked.map((row, i) => ({ ...row, ...(quotes[i] ? { quote: quotes[i] } : {}) }));
}
