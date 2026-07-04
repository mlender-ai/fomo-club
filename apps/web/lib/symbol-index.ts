import { STOCK_VOCAB, sectorOf } from "@fomo/core";
import { usDiscoveryUniverse, usSymbolForStock } from "./us-symbols";
import { readFeedContent, readFeedContentByPrefix, writeFeedContent } from "./feed-content-store";
import { kstDate } from "./fomo";

/**
 * 심볼 마스터 인덱스 (WO 검색) — 검색의 기반.
 * KR = 네이버 전종목(코스피+코스닥) · US = Nasdaq Trader 심볼 디렉토리(NYSE 포함) · 코인 = Upbit KRW 마켓.
 * 크론 일 1회 재구축(rebuildSymbolIndex) → FeedContentCache 저장. **요청 경로에서 재구축 금지** —
 * searchSymbols 는 캐시(모듈 메모리 10분 + DB)만 조회한다(<1초).
 * 스키마는 히스토리 성과추적과 동일 필드: canonical·symbol·market·country·naverCode·sector.
 */

export interface SymbolIndexEntry {
  /** 표시명 — KR/코인은 한글, US 는 vocab 한글명(있으면) 또는 영문. */
  canonical: string;
  englishName?: string;
  symbol: string;
  market: string;
  country: "KR" | "US" | "GLOBAL";
  naverCode?: string;
  sector?: string;
  /** 상호검색용 별칭(한글↔영문↔티커) — vocab aliases 재활용. */
  aliases?: string[];
}

interface SymbolIndexDoc {
  entries: SymbolIndexEntry[];
  builtAt: string;
}

const INDEX_CACHE_ID = "symbol-index";
const UA = "Mozilla/5.0 (compatible; FomoClubBot/1.0)";
const NAVER_PAGE_SIZE = 100;
const NAVER_MAX_PAGES = 40;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── KR: 네이버 전종목 (이미 쓰는 무료 API — 시총 페이지 전체 순회) ───────────

interface NaverListedStock {
  itemCode?: string;
  stockName?: string;
  stockEndType?: string;
}

async function fetchKrListed(market: "KOSPI" | "KOSDAQ"): Promise<SymbolIndexEntry[]> {
  const out: SymbolIndexEntry[] = [];
  for (let page = 1; page <= NAVER_MAX_PAGES; page += 1) {
    const data = await fetchJson<{ stocks?: NaverListedStock[]; totalCount?: number }>(
      `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=${NAVER_PAGE_SIZE}`
    );
    const stocks = data?.stocks ?? [];
    if (stocks.length === 0) break;
    for (const stock of stocks) {
      if (!stock.itemCode || !stock.stockName) continue;
      if (stock.stockEndType && stock.stockEndType !== "stock") continue; // ETF/ETN/리츠 외 파생 제외
      const sector = sectorOf(stock.stockName);
      out.push({
        canonical: stock.stockName,
        symbol: stock.itemCode,
        market,
        country: "KR",
        naverCode: stock.itemCode,
        ...(sector ? { sector } : {}),
      });
    }
    if (stocks.length < NAVER_PAGE_SIZE) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return out;
}

// ── US: Nasdaq Trader 심볼 디렉토리 (무료 공식, NYSE 포함) ───────────────────

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function parseSymbolDir(text: string, kind: "nasdaq" | "other"): SymbolIndexEntry[] {
  const lines = text.split(/\r?\n/);
  const out: SymbolIndexEntry[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split("|");
    if (cols.length < 5) continue;
    if (kind === "nasdaq") {
      const [symbol, name, , testIssue, , , etf] = cols;
      if (!symbol || !name || testIssue === "Y" || etf === "Y") continue;
      if (/File Creation Time/i.test(symbol)) continue;
      out.push({ canonical: cleanUsName(name), englishName: cleanUsName(name), symbol: symbol.trim(), market: "NASDAQ", country: "US" });
    } else {
      const [symbol, name, exchange, , etf, , testIssue] = cols;
      if (!symbol || !name || testIssue === "Y" || etf === "Y") continue;
      if (/File Creation Time/i.test(symbol)) continue;
      const market = exchange === "N" ? "NYSE" : exchange === "A" ? "NYSE" : "NYSE"; // AMEX·기타는 NYSE 그룹으로 표기
      out.push({ canonical: cleanUsName(name), englishName: cleanUsName(name), symbol: symbol.trim(), market, country: "US" });
    }
  }
  return out;
}

function cleanUsName(name: string): string {
  return name
    .replace(/\s*-\s*(Common Stock|Class [A-Z] (Common Stock|Ordinary Shares?)|American Depositary Shares?.*|Ordinary Shares?|Common Shares?|Depositary Shares?.*)$/i, "")
    .replace(/,?\s*Inc\.?$|,?\s*Corp(oration)?\.?$|,?\s*Ltd\.?$|,?\s*plc\.?$/i, "")
    .trim();
}

async function fetchUsListed(): Promise<SymbolIndexEntry[]> {
  const [nasdaq, other] = await Promise.all([
    fetchText("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"),
    fetchText("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"),
  ]);
  return [...(nasdaq ? parseSymbolDir(nasdaq, "nasdaq") : []), ...(other ? parseSymbolDir(other, "other") : [])];
}

// ── 코인: Upbit KRW 마켓 ─────────────────────────────────────────────────────

interface UpbitMarketInfo {
  market: string;
  korean_name: string;
  english_name: string;
  market_event?: { warning?: boolean };
}

async function fetchCoinListed(): Promise<SymbolIndexEntry[]> {
  const markets = await fetchJson<UpbitMarketInfo[]>("https://api.upbit.com/v1/market/all?isDetails=true");
  if (!Array.isArray(markets)) return [];
  return markets
    .filter((m) => m.market.startsWith("KRW-") && m.market_event?.warning !== true)
    .map((m) => ({
      canonical: m.korean_name,
      englishName: m.english_name,
      symbol: m.market, // "KRW-BTC" — stock-front 코인 분기와 동일 식별자
      market: "COIN",
      country: "GLOBAL" as const,
      sector: "코인",
      aliases: [m.english_name, m.market.replace(/^KRW-/, "")],
    }));
}

// ── 병합 + vocab 별칭(한글↔영문↔티커 상호검색) ──────────────────────────────

function mergeVocabAliases(entries: SymbolIndexEntry[]): SymbolIndexEntry[] {
  const bySymbol = new Map<string, SymbolIndexEntry>();
  const byCode = new Map<string, SymbolIndexEntry>();
  for (const entry of entries) {
    bySymbol.set(entry.symbol.toUpperCase(), entry);
    if (entry.naverCode) byCode.set(entry.naverCode, entry);
  }
  // 미국 발굴 시드(us-symbols)의 한글명 병합 — "메타"→META 상호검색의 본체.
  for (const seed of usDiscoveryUniverse()) {
    const hit = bySymbol.get(seed.symbol.toUpperCase());
    if (!hit || !/[가-힣]/.test(seed.canonical)) continue;
    const aliases = new Set(hit.aliases ?? []);
    if (hit.englishName === undefined) hit.englishName = hit.canonical;
    aliases.add(hit.canonical);
    aliases.add(seed.canonical);
    hit.canonical = seed.canonical;
    hit.aliases = [...aliases];
    if (!hit.sector && seed.sector) hit.sector = seed.sector;
  }
  for (const def of STOCK_VOCAB) {
    const usSymbol = def.country === "US" ? usSymbolForStock(def.canonical) : undefined;
    const hit = (def.naverCode && byCode.get(def.naverCode)) || (usSymbol && bySymbol.get(usSymbol.toUpperCase()));
    if (!hit) continue;
    const aliases = new Set(hit.aliases ?? []);
    aliases.add(def.canonical);
    for (const alias of def.aliases) aliases.add(alias);
    if (def.country === "US") {
      // 미국 종목: 표시명을 vocab 한글명으로("메타"→META 검색·표시 둘 다).
      if (hit.englishName === undefined) hit.englishName = hit.canonical;
      aliases.add(hit.canonical);
      hit.canonical = def.canonical;
    }
    hit.aliases = [...aliases];
    if (!hit.sector) {
      const sector = sectorOf(def.canonical);
      if (sector) hit.sector = sector;
    }
  }
  return entries;
}

/** 크론 전용 — 인덱스 재구축(+저장). 요청 경로 호출 금지. */
export async function rebuildSymbolIndex(): Promise<{ total: number; kr: number; us: number; coin: number }> {
  const [kospi, kosdaq, us, coin] = await Promise.all([
    fetchKrListed("KOSPI"),
    fetchKrListed("KOSDAQ"),
    fetchUsListed(),
    fetchCoinListed(),
  ]);
  const merged = mergeVocabAliases([...kospi, ...kosdaq, ...us, ...coin]);
  const doc: SymbolIndexDoc = { entries: merged, builtAt: new Date().toISOString() };
  indexMemo = { doc, loadedAt: Date.now() }; // 메모리 먼저 — 저장 실패해도 이 인스턴스는 검색 가능
  await writeFeedContent(INDEX_CACHE_ID, doc);
  return { total: merged.length, kr: kospi.length + kosdaq.length, us: us.length, coin: coin.length };
}

// ── 검색 (요청 경로 — 캐시만) ────────────────────────────────────────────────

let indexMemo: { doc: SymbolIndexDoc; loadedAt: number } | null = null;
const INDEX_MEMO_TTL_MS = 10 * 60 * 1000;

async function loadIndex(): Promise<SymbolIndexDoc | null> {
  if (indexMemo && Date.now() - indexMemo.loadedAt < INDEX_MEMO_TTL_MS) return indexMemo.doc;
  const doc = await readFeedContent<SymbolIndexDoc>(INDEX_CACHE_ID);
  if (doc?.entries?.length) {
    indexMemo = { doc, loadedAt: Date.now() };
    return doc;
  }
  return null;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s·.,'"-]+/g, "");
}

export interface SymbolSearchResult extends SymbolIndexEntry {
  score: number;
}

/** 자동완성 — 정확 > 접두 > 부분. 캐시된 인덱스만(재구축·외부 fetch 0). */
export async function searchSymbols(query: string, limit = 10): Promise<SymbolSearchResult[]> {
  const q = normalize(query);
  if (q.length < 1) return [];
  const doc = await loadIndex();
  if (!doc) return [];
  const results: SymbolSearchResult[] = [];
  for (const entry of doc.entries) {
    const keys = [entry.canonical, entry.englishName ?? "", entry.symbol, entry.naverCode ?? "", ...(entry.aliases ?? [])]
      .filter(Boolean)
      .map(normalize);
    let score = 0;
    for (const key of keys) {
      if (key === q) score = Math.max(score, 3);
      else if (key.startsWith(q)) score = Math.max(score, 2);
      else if (q.length >= 2 && key.includes(q)) score = Math.max(score, 1);
    }
    // 본명(표시명/티커) 정확 일치는 별칭 일치보다 위 — "META"에서 코인 별칭이 Meta Platforms 를 이기지 않게.
    if (score === 3 && (normalize(entry.canonical) === q || normalize(entry.symbol) === q)) score = 3.5;
    if (score > 0) results.push({ ...entry, score });
  }
  return results
    .sort((a, b) => b.score - a.score || a.canonical.length - b.canonical.length || a.canonical.localeCompare(b.canonical))
    .slice(0, limit);
}

export async function symbolIndexReady(): Promise<boolean> {
  return (await loadIndex()) !== null;
}

// ── 알림 신청 큐 (③ 분기 — 무로그인: 재방문 시 피드 노출) ─────────────────────

export interface SearchRequestRow {
  query: string;
  status: "pending" | "fulfilled" | "not-found";
  requestedAt: string;
  resolved?: SymbolIndexEntry;
  processedAt?: string;
}

function requestId(query: string): string {
  return `searchreq:${normalize(query).slice(0, 60)}`;
}

export async function saveSearchRequest(query: string): Promise<SearchRequestRow> {
  const clean = query.replace(/\s+/g, " ").trim().slice(0, 60);
  const existing = await readFeedContent<SearchRequestRow>(requestId(clean));
  if (existing) return existing;
  const row: SearchRequestRow = { query: clean, status: "pending", requestedAt: new Date().toISOString() };
  await writeFeedContent(requestId(clean), row);
  return row;
}

export async function readSearchRequests(limit = 30): Promise<SearchRequestRow[]> {
  const rows = await readFeedContentByPrefix<SearchRequestRow>("searchreq:", limit);
  return rows.map((r) => r.row).filter((r) => r && typeof r.query === "string");
}

/**
 * 크론 전용 — pending 큐를 (새로 재구축된) 인덱스로 해석.
 * 실존 → fulfilled(+오늘의 검색 요청 카드 목록에 합류), 미실존(오타 등) → not-found 종료(무한 대기 금지).
 */
export async function processSearchQueue(): Promise<{ fulfilled: number; notFound: number }> {
  const rows = await readFeedContentByPrefix<SearchRequestRow>("searchreq:", 50);
  let fulfilled = 0;
  let notFound = 0;
  const fulfilledEntries: SymbolIndexEntry[] = [];
  for (const { id, row } of rows) {
    if (row.status !== "pending") continue;
    const matches = await searchSymbols(row.query, 1);
    const top = matches[0];
    const processedAt = new Date().toISOString();
    if (top && top.score >= 2) {
      await writeFeedContent(id, { ...row, status: "fulfilled", resolved: top, processedAt } satisfies SearchRequestRow);
      fulfilledEntries.push(top);
      fulfilled += 1;
    } else {
      await writeFeedContent(id, { ...row, status: "not-found", processedAt } satisfies SearchRequestRow);
      notFound += 1;
    }
  }
  if (fulfilledEntries.length > 0) {
    await writeFeedContent(`search-fulfilled:${kstDate()}`, { date: kstDate(), entries: fulfilledEntries });
  }
  return { fulfilled, notFound };
}

/** feed-hub 소비용 — 오늘 처리된 검색 요청 카드 대상. */
export async function readTodayFulfilledSearches(): Promise<SymbolIndexEntry[]> {
  const doc = await readFeedContent<{ entries: SymbolIndexEntry[] }>(`search-fulfilled:${kstDate()}`);
  return doc?.entries ?? [];
}
