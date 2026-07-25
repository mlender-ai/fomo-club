/**
 * 내부자 클러스터 매수 발굴 소스 (US, DATA_ENGINE_STRATEGY 선행/수급 축).
 *
 * openinsider "latest cluster buys"(여러 내부자가 동반 매수한 공개시장 매수, SEC Form 4 집계)를
 * 매일 수집해 조용한 종목까지 발굴 카드로 띄운다. 현재가/스파크라인은 Nasdaq(Vercel egress 통과)
 * 우선·Yahoo 폴백으로 보강한다.
 *
 * 순수 데이터(LLM 0). 관측 서술만 — 매수·매도 판단/예측 없음.
 * openinsider가 막히거나 비면 조용히 빈 배열(fail-open) — 제품은 기존 US 유니버스로 정상 동작.
 */

import { fetchNasdaqQuote } from "./us-market-source";

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

/**
 * 종목별 "지난 12개월 내부자 매수 건수"(빈도 이례성용, WO-G1A2). 최근 N일(현재 클러스터)은 제외한
 * baseline — "지난 1년 2건뿐인데 이번에 16명" 서사의 분모. openinsider screener 재사용(새 소스 아님).
 * 실패/무결과면 undefined(가짜 금지 — 지표 생략).
 */
export async function fetchInsiderPriorBuys(
  symbol: string,
  excludeRecentDays = 14
): Promise<number | undefined> {
  const sym = symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z.]{0,5}$/.test(sym)) return undefined;
  const url = `http://openinsider.com/screener?s=${encodeURIComponent(sym)}&fd=365&xp=1&xs=0&cnt=500&sortcol=0&page=1`;
  const html = await fetchText(url, UA);
  if (html === null) return undefined; // 네트워크 실패 → 지표 생략(0 으로 둔갑 금지)
  return parseTickerPriorPurchases(html, excludeRecentDays);
}

/**
 * openinsider screener/종목 페이지 파싱 → [1년 전, 최근 excludeRecentDays일 전) 구간의 '매수(P)' 행 수.
 * 16열: [1]Filing [2]Trade [3]Ticker [4]Insider [5]Title [6]TradeType [7]Price [8]Qty ... [11]Value.
 * 클러스터 테이블과 열 인덱스가 다르므로 전용 파서. 결과 0이면 tinytable 부재 → 0.
 */
function parseTickerPriorPurchases(html: string, excludeRecentDays: number): number {
  const tableMatch = html.match(/<table[^>]*class="tinytable"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return 0;
  const rows = (tableMatch[1] ?? "").match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const now = Date.now();
  const upper = now - excludeRecentDays * 86_400_000;
  const lower = now - 365 * 86_400_000;
  let count = 0;
  for (const rowHtml of rows) {
    const cellMatches = rowHtml.match(/<td[^>]*>[\s\S]*?<\/td>/gi);
    if (!cellHasEnough(cellMatches)) continue;
    const cells = cellMatches.map((c) => stripTags(c));
    if (!/purchase/i.test(cells[6] ?? "")) continue; // [6] TradeType
    const trade = isoDate(cells[2]); // [2] Trade date
    const t = trade ? Date.parse(`${trade}T00:00:00Z`) : NaN;
    if (!Number.isFinite(t) || t < lower || t >= upper) continue;
    count += 1;
  }
  return count;
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

/** 시세 보강: Nasdaq(Vercel egress 통과) 우선, 실패 시 Yahoo 폴백. */
async function fetchSymbolQuote(symbol: string): Promise<InsiderClusterQuote | undefined> {
  const nasdaq = await fetchNasdaqQuote(symbol).catch(() => null);
  if (nasdaq) {
    return {
      price: nasdaq.price,
      currency: "USD",
      ...(typeof nasdaq.changePct === "number" ? { changePct: nasdaq.changePct } : {}),
      ...(nasdaq.sparkline && nasdaq.sparkline.length >= 2 ? { sparkline: nasdaq.sparkline } : {}),
    };
  }
  return fetchYahooQuote(symbol);
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
  const quotes = await mapLimit(ranked, YAHOO_CONCURRENCY, (row) => fetchSymbolQuote(row.symbol).catch(() => undefined));
  return ranked.map((row, i) => ({ ...row, ...(quotes[i] ? { quote: quotes[i] } : {}) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 과거 클러스터 매수 아카이브 (WO-P2 §1 — 신호 성적 백테스트 표본)
//
// openinsider 는 "최신 클러스터" 페이지만 제공한다(latest-cluster-buys). 과거 12개월 클러스터는
// 종목별 screener(fd=365)로 매수 행을 받아 **우리가 클러스터를 재구성**해서 얻는다 —
// 새 외부 소스 없이 기존 엔드포인트(fetchInsiderPriorBuys 와 동일 URL 규약)만 재사용.
// 순수 관측: 과거에 "며칠 안에 내부자 N명이 같이 샀다"는 사실만 뽑는다(판단·예측 0).
// ─────────────────────────────────────────────────────────────────────────────

/** screener 한 행 — 매수 1건(거래일 + 내부자명). */
export interface InsiderPurchaseRow {
  /** 거래일 YYYY-MM-DD. */
  tradeDate: string;
  /** 내부자 이름(동일인 중복 제거용). */
  insider: string;
}

/**
 * screener HTML → 매수(P) 행 목록. 16열 규약은 parseTickerPriorPurchases 와 동일:
 * [2]Trade date, [4]Insider, [6]TradeType. 파싱 실패/테이블 부재 → 빈 배열(가짜 금지).
 */
export function parseTickerPurchaseRows(html: string): InsiderPurchaseRow[] {
  const tableMatch = html.match(/<table[^>]*class="tinytable"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return [];
  const rows = (tableMatch[1] ?? "").match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const out: InsiderPurchaseRow[] = [];
  for (const rowHtml of rows) {
    const cellMatches = rowHtml.match(/<td[^>]*>[\s\S]*?<\/td>/gi);
    if (!cellHasEnough(cellMatches)) continue;
    const cells = cellMatches.map((c) => stripTags(c));
    if (!/purchase/i.test(cells[6] ?? "")) continue; // [6] TradeType
    const tradeDate = isoDate(cells[2]); // [2] Trade date
    const insider = (cells[4] ?? "").trim(); // [4] Insider
    if (!tradeDate || !insider) continue;
    out.push({ tradeDate, insider });
  }
  return out;
}

/** 과거 클러스터 1건 — 신호 발생일(마지막 거래일)과 동반 내부자 수. */
export interface HistoricalCluster {
  symbol: string;
  /** 클러스터의 마지막 거래일 = 신호 발생일(YYYY-MM-DD). */
  signalDate: string;
  insiderCount: number;
}

/** 같은 클러스터로 묶는 최대 간격(일) — 며칠에 걸쳐 나눠 사는 경우를 한 사건으로. */
const CLUSTER_WINDOW_DAYS = 5;
/** 클러스터 사건 사이 최소 간격(일) — 같은 매집을 여러 표본으로 중복 계산하지 않는다. */
const CLUSTER_COOLDOWN_DAYS = 30;

/**
 * 매수 행 → 과거 클러스터 사건(순수 함수, 테스트 대상).
 * 규칙: 거래일 오름차순으로 훑어 CLUSTER_WINDOW_DAYS 안에 **서로 다른 내부자 minInsiders 명 이상**이
 * 매수하면 1건. 직전 사건에서 CLUSTER_COOLDOWN_DAYS 이내면 같은 매집으로 보고 건너뛴다(중복 방지).
 */
export function reconstructClusters(
  symbol: string,
  rows: readonly InsiderPurchaseRow[],
  minInsiders = MIN_INSIDER_COUNT
): HistoricalCluster[] {
  const sorted = [...rows]
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.tradeDate))
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const dayMs = 86_400_000;
  const out: HistoricalCluster[] = [];
  let lastSignalMs = -Infinity;

  for (let i = 0; i < sorted.length; i += 1) {
    const startMs = Date.parse(`${sorted[i]!.tradeDate}T00:00:00Z`);
    if (!Number.isFinite(startMs)) continue;
    const names = new Set<string>();
    let endDate = sorted[i]!.tradeDate;
    for (let j = i; j < sorted.length; j += 1) {
      const ms = Date.parse(`${sorted[j]!.tradeDate}T00:00:00Z`);
      if (!Number.isFinite(ms) || ms - startMs > CLUSTER_WINDOW_DAYS * dayMs) break;
      names.add(sorted[j]!.insider.toLowerCase());
      endDate = sorted[j]!.tradeDate;
    }
    if (names.size < minInsiders) continue;
    const signalMs = Date.parse(`${endDate}T00:00:00Z`);
    if (signalMs - lastSignalMs < CLUSTER_COOLDOWN_DAYS * dayMs) continue; // 같은 매집 중복 제외
    lastSignalMs = signalMs;
    out.push({ symbol, signalDate: endDate, insiderCount: names.size });
  }
  return out;
}

/**
 * 종목 1개의 과거 12개월 클러스터 매수 이력. 네트워크 실패 → 빈 배열(fail-open).
 * 최근 clusterCooldown 일 이내 사건은 아직 채점(30거래일)이 불가하므로 호출부가 걸러도 되고,
 * 여기서는 관측 그대로 돌려준다(정직 — 필터는 채점 단계에서).
 */
export async function fetchHistoricalClusters(symbol: string): Promise<HistoricalCluster[]> {
  const sym = symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z.]{0,5}$/.test(sym)) return [];
  const url = `http://openinsider.com/screener?s=${encodeURIComponent(sym)}&fd=365&xp=1&xs=0&cnt=500&sortcol=0&page=1`;
  const html = await fetchText(url, UA);
  if (html === null) return [];
  return reconstructClusters(sym, parseTickerPurchaseRows(html));
}
