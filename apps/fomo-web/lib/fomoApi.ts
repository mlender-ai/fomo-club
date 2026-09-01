// FOMO API 클라이언트. API는 apps/web(@fomo/backend)의 /api/fomo/*에 있다.
// NEXT_PUBLIC_FOMO_API_BASE로 오버라이드(로컬: http://127.0.0.1:3200), 기본은 배포된 prod.
import type {
  BannerItem,
  FeedCards,
  KeywordCard,
  KeywordConfidence,
  MarketScore,
  MoodSignal,
  ScoredArticle,
  ValuationChartData,
  ValuationFrameNotes,
  WhereThisIsWrongBlock,
} from "@fomo/core";
import type { DeckContent, DeckNarrative } from "./discoveryDeck";
import { isDiscoveryCopySafe } from "./discoveryCopySafe";
import { cachedGet, readCached, refreshCached, setCached } from "./apiCache";
import { discoveryMatchesCountry, type DiscoveryCountryScope } from "./discoveryCountryScope";

export type { BannerItem } from "@fomo/core";
export * from "./judgmentLedgerClient";

const DEFAULT_API_BASE = "https://fomo-club-backend.vercel.app";
const API_BASE =
  process.env.NEXT_PUBLIC_FOMO_API_BASE?.replace(/\/$/, "") ||
  DEFAULT_API_BASE;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const CACHE_TTL = {
  keywords: 10 * MINUTE,
  sectorStocks: HOUR,
  stockFront: 10 * MINUTE,
  stockBasics: 6 * HOUR,
  themeInsight: 6 * HOUR,
  stockInsight: 6 * HOUR,
  performancePrices: 10 * MINUTE,
  // 비상 스냅샷/엔진 응답이 오늘 위원회 발행 뒤 빠르게 정상본으로 교체되도록 짧게 유지한다.
  daily30: 5 * MINUTE,
} as const;
export const KEYWORDS_UPDATED_EVENT = "fomo:keywords-updated";
export const DISCOVERY_UPDATED_EVENT = "fomo:discovery-updated";
export const FOMO_INDEX_UPDATED_EVENT = "fomo:index-updated";

const INDEX_SAME_ORIGIN_TIMEOUT_MS = 1_800;
const INDEX_BACKEND_TIMEOUT_MS = 4_000;
const INDEX_REVALIDATE_TIMEOUT_MS = 8_000;
const DISCOVERY_SAME_ORIGIN_TIMEOUT_MS = 11_500;
const DISCOVERY_BACKEND_TIMEOUT_MS = 18_000;
const DISCOVERY_REVALIDATE_TIMEOUT_MS = 24_000;
export type { DiscoveryCountryScope } from "./discoveryCountryScope";

function discoveryFastPath(country: DiscoveryCountryScope = "KR"): string {
  return `/api/fomo/discovery?fast=1&country=${encodeURIComponent(country)}`;
}

function daily30Path(): string {
  return "/api/fomo/daily-30";
}

function kstDateKey(now = new Date()): string {
  return new Date(now.getTime() + 9 * HOUR).toISOString().slice(0, 10);
}

/**
 * 날짜 키(fomo:index:*, fomo:keywords:*, fomo:discovery:*)로 매일 새 항목이 쌓이는데
 * 지우는 곳이 없어 localStorage 가 무한 누적된다(quota 초과 시 이후 모든 저장이 조용히 실패
 * → 오프라인 캐시·취향 기록 등 영속 기능 사망). 오늘이 아닌 날짜가 박힌 fomo:* 키를 정리한다.
 * 날짜가 없는 키(fomo:discovery:last-good:* 등)는 건드리지 않는다. 세션당 1회.
 */
let stalePruned = false;
function pruneStaleDatedCache(): void {
  if (typeof window === "undefined" || stalePruned) return;
  stalePruned = true;
  try {
    const today = kstDateKey();
    const datedFomoKey = /^fomo:(index|keywords|discovery):.*(\d{4}-\d{2}-\d{2})/;
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const m = datedFomoKey.exec(key);
      if (m && m[2] !== today) stale.push(key);
    }
    for (const key of stale) window.localStorage.removeItem(key);
  } catch (err) {
    console.warn("[fomoApi] stale cache prune failed", err);
  }
}

export interface FomoIndexResponse {
  date: string;
  score: number;
  state: string;
  components: { market: number; community: number; emotion: number; whale: number };
  aiSummary: string;
  prevDayDelta: number;
  avg30Delta: number;
  live: boolean;
}

const indexKey = () => `fomo-index:${kstDateKey()}`;
const indexStorageKey = () => `fomo:index:${kstDateKey()}`;

function neutralFomoIndex(): FomoIndexResponse {
  return {
    date: kstDateKey(),
    score: 50,
    state: "관심",
    components: { market: 15, community: 15, emotion: 15, whale: 0 },
    aiSummary: "",
    prevDayDelta: 0,
    avg30Delta: 0,
    live: false,
  };
}

function isFomoIndexResponse(value: unknown): value is FomoIndexResponse {
  const candidate = value as Partial<FomoIndexResponse> | null;
  return (
    !!candidate &&
    typeof candidate.date === "string" &&
    typeof candidate.score === "number" &&
    typeof candidate.state === "string" &&
    !!candidate.components &&
    typeof candidate.components.market === "number" &&
    typeof candidate.components.community === "number" &&
    typeof candidate.components.emotion === "number" &&
    typeof candidate.components.whale === "number"
  );
}

function readStoredIndex(): FomoIndexResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(indexStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isFomoIndexResponse(parsed) ? parsed : null;
  } catch (err) {
    console.warn("[fetchIndex] localStorage read failed", err);
    return null;
  }
}

function writeStoredIndex(value: FomoIndexResponse): void {
  if (typeof window === "undefined") return;
  try {
    pruneStaleDatedCache();
    window.localStorage.setItem(indexStorageKey(), JSON.stringify(value));
  } catch (err) {
    console.warn("[fetchIndex] localStorage write failed", err);
  }
}

function emitIndexUpdated(value: FomoIndexResponse): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FomoIndexResponse>(FOMO_INDEX_UPDATED_EVENT, { detail: value }));
}

export interface TallyResponse {
  date: string;
  total: number;
  counts: Record<string, number>;
  ratios: Record<string, number>;
}

export interface CalendarResponse {
  month: string; // YYYY-MM
  today: string; // YYYY-MM-DD
  days: Record<string, string>; // date → emotion
  market: Record<string, number>; // date → FOMO Index score
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`${label} ${res.status}`);
    return res.json() as Promise<T>;
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw new Error(`${label} timeout`);
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function backendOrigins(): string[] {
  return [...new Set([API_BASE, DEFAULT_API_BASE].map((origin) => origin.replace(/\/$/, "")))];
}

async function fetchIndexNetwork({
  sameOriginTimeoutMs = INDEX_SAME_ORIGIN_TIMEOUT_MS,
  backendTimeoutMs = INDEX_BACKEND_TIMEOUT_MS,
}: {
  sameOriginTimeoutMs?: number;
  backendTimeoutMs?: number;
} = {}): Promise<FomoIndexResponse> {
  let lastError: unknown = null;
  for (const origin of backendOrigins()) {
    try {
      return await fetchJsonWithTimeout<FomoIndexResponse>(
        `${origin}/api/fomo/index`,
        { cache: "no-store" },
        backendTimeoutMs,
        `GET ${origin}/api/fomo/index`
      );
    } catch (err) {
      lastError = err;
    }
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      return await fetchJsonWithTimeout<FomoIndexResponse>(
        "/api/fomo/index",
        { cache: "no-store", credentials: "same-origin" },
        sameOriginTimeoutMs,
        "GET /api/fomo/index"
      );
    } catch (sameOriginErr) {
      lastError = sameOriginErr;
      console.warn("[fetchIndex] backend failed; retrying same-origin fallback failed", sameOriginErr);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("GET /api/fomo/index failed");
}

export async function fetchIndex(): Promise<FomoIndexResponse> {
  const key = indexKey();
  const cached = readCached<FomoIndexResponse>(key);
  if (cached) return cached;

  const stored = readStoredIndex();
  if (stored) {
    setCached(key, stored, CACHE_TTL.stockFront);
    void refreshCached(
      key,
      () =>
        fetchIndexNetwork({
          sameOriginTimeoutMs: INDEX_SAME_ORIGIN_TIMEOUT_MS,
          backendTimeoutMs: INDEX_REVALIDATE_TIMEOUT_MS,
        }),
      CACHE_TTL.stockFront
    )
      .then((fresh) => {
        writeStoredIndex(fresh);
        emitIndexUpdated(fresh);
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[fetchIndex] revalidate failed", err);
        }
      });
    return stored;
  }

  try {
    const fresh = await cachedGet(key, () => fetchIndexNetwork(), CACHE_TTL.stockFront);
    writeStoredIndex(fresh);
    return fresh;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[fetchIndex] using neutral fallback", err);
    }
    const fallback = neutralFomoIndex();
    setCached(key, fallback, MINUTE);
    return fallback;
  }
}
export const fetchToday = () => get<TallyResponse>("/api/fomo/emotions/today");
/** 롤링 배너 + 홈 상단 캐러셀용 시장 점수(나스닥·비트코인·코스피). */
export type { MarketScore } from "@fomo/core";
export interface BannerResponse {
  items: BannerItem[];
  markets?: MarketScore[];
}
export const fetchBanner = () => get<BannerResponse>("/api/fomo/banner");

/** 감정 치환 피드 + 오늘 탭 분위기 시그널 (Phase 3 엔진 산출). */
export interface FeedResponse {
  cards: FeedCards;
  moods: MoodSignal[];
  content?: DeckContent[];
}
export const fetchFeed = () => get<FeedResponse>("/api/fomo/feed");

/** 피드 집계(feed-hub, WO 피드 통합) — FeedView·PC 우측 컬럼의 단일 소스. */
export interface FeedHubSectorStockRef {
  canonical: string;
  market: string;
  country: string;
  naverCode?: string;
  symbol?: string;
  changePct?: number;
}
export interface FeedHubSectorCard {
  id: string;
  sector: string;
  country: "KR" | "US";
  stance: "bull-dominant" | "bear-dominant" | "balanced" | "insufficient";
  stanceNote: string;
  stocks: FeedHubSectorStockRef[];
}
export interface FeedHubStockIssue {
  id: string;
  stock: string;
  market: string;
  country: "KR" | "US";
  naverCode?: string;
  symbol?: string;
  changePct?: number;
  headline: string;
  source: string;
  url?: string;
  asOf: string;
}
export interface FeedHubCalendarStockRef {
  canonical: string;
  symbol: string;
  session?: "장전" | "장후";
}
export interface FeedHubCalendarEvent {
  kind: "earnings" | "macro";
  title: string;
  detail?: string;
  stocks?: FeedHubCalendarStockRef[];
}
export interface FeedHubCalendar {
  id: string;
  asOf: string;
  days: Array<{ date: string; events: FeedHubCalendarEvent[] }>;
}
export type FeedHubItem =
  | { type: "briefing" | "buzz" | "recap" | "index" | "macro" | "whale" | "macro-issue"; scope: "KR" | "US" | "GLOBAL"; content: DeckContent & { series?: number[] } }
  | { type: "narrative"; scope: "KR" | "US"; narrative: DeckNarrative }
  | { type: "sector"; scope: "KR" | "US"; sector: FeedHubSectorCard }
  | { type: "stock-issue"; scope: "KR" | "US"; stockIssue: FeedHubStockIssue }
  | { type: "calendar"; scope: "GLOBAL"; calendar: FeedHubCalendar };
export interface FeedHubResponse {
  asOf: string;
  items: FeedHubItem[];
  typeCounts: Record<string, number>;
  scopeCounts: { KR: number; US: number; GLOBAL: number };
  source: string;
}
export const fetchFeedHub = () =>
  cachedGet(`feed-hub:${kstDateKey()}`, () => get<FeedHubResponse>("/api/fomo/feed-hub"), 15 * MINUTE);

/** 피드 아카이브(무한 스크롤) — before(exclusive) 이전의 지난 브리핑·버즈·회고 페이지. */
export interface FeedArchiveResponse {
  items: FeedHubItem[];
  /** 다음 페이지 커서 — null 이면 아카이브 끝. */
  nextBefore: string | null;
}
// 로컬 캐시 없이 항상 신선 조회 — 서버 콜드 실패로 빈 페이지가 오면 캐시에 남지 않고 다음 스크롤에서 재시도.
// 정상 페이지는 CDN(s-maxage 1h)이 이미 방패라 클라 캐시가 불필요하다.
export const fetchFeedArchive = (before: string) => get<FeedArchiveResponse>(`/api/fomo/feed-hub?before=${before}`);

/** 오늘(KST) YYYY-MM-DD — 아카이브 첫 커서용. */
export const feedArchiveStartCursor = () => kstDateKey();

/** 무로그인 대기함(WO 검색 요청→다음날 카드) — 익명 deviceId(=sessionId)의 요청 상태. */
export interface MyRequestResolved {
  canonical: string;
  symbol: string;
  market: string;
  country: "KR" | "US" | "GLOBAL";
  naverCode?: string;
  sector?: string;
}
export interface MyRequestRow {
  query: string;
  status: "pending" | "fulfilled" | "not-found";
  requestedAt: string;
  processedAt?: string;
  resolved?: MyRequestResolved;
}
export const fetchMyRequests = (deviceId: string) =>
  get<{ requests: MyRequestRow[] }>(`/api/fomo/my-requests?deviceId=${encodeURIComponent(deviceId)}`);

/** 뉴스 덱 — 한국 뉴스(점수순) + 차트 카드 인터리브, 스와이프용(피드 탭). */
export type { ScoredArticle, ChartCard, DeckCard } from "@fomo/core";
export interface NewsResponse {
  deck: import("@fomo/core").DeckCard[];
  lang: "en" | "ko";
}
export const fetchNews = () => get<NewsResponse>("/api/fomo/news");

/** 키워드 카드 — "오늘 쏠린 키워드" 실데이터(KEYWORD_ENGINE_SPEC §4.6). confidence 로 정직성 노출. */
export type { KeywordCard, KeywordConfidence } from "@fomo/core";
export interface KeywordsResponse {
  date: string;
  cards: KeywordCard[];
  confidence: KeywordConfidence;
  live: boolean;
  stale?: boolean;
  snapshotDate?: string | null;
}
const keywordsKey = () => `keywords:${kstDateKey()}`;
const keywordsStorageKey = () => `fomo:keywords:${kstDateKey()}`;

export const getCachedKeywords = () => readCached<KeywordsResponse>(keywordsKey());

function readStoredKeywords(): KeywordsResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keywordsStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<KeywordsResponse>;
    if (!parsed || !Array.isArray(parsed.cards) || typeof parsed.date !== "string") return null;
    return parsed as KeywordsResponse;
  } catch (err) {
    console.warn("[fetchKeywords] localStorage read failed", err);
    return null;
  }
}

function writeStoredKeywords(value: KeywordsResponse): void {
  if (typeof window === "undefined") return;
  try {
    pruneStaleDatedCache();
    window.localStorage.setItem(keywordsStorageKey(), JSON.stringify(value));
  } catch (err) {
    console.warn("[fetchKeywords] localStorage write failed", err);
  }
}

function emitKeywordsUpdated(value: KeywordsResponse): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<KeywordsResponse>(KEYWORDS_UPDATED_EVENT, { detail: value }));
}

const fetchKeywordsNetwork = () => get<KeywordsResponse>("/api/fomo/keywords");

export const fetchKeywords = async () => {
  const key = keywordsKey();
  const cached = readCached<KeywordsResponse>(key);
  if (cached) return cached;

  const stored = readStoredKeywords();
  if (stored) {
    setCached(key, stored, CACHE_TTL.keywords);
    void refreshCached(key, fetchKeywordsNetwork, CACHE_TTL.keywords)
      .then((fresh) => {
        writeStoredKeywords(fresh);
        emitKeywordsUpdated(fresh);
      })
      .catch((err) => console.warn("[fetchKeywords] revalidate failed", err));
    return stored;
  }

  const res = await cachedGet(key, fetchKeywordsNetwork, CACHE_TTL.keywords);
  writeStoredKeywords(res);
  return res;
};

export const warmKeywords = () => fetchKeywords();

/** 테마 이해·응축(데이터 엔진 Track A+B) — 뎁스 페이지가 카드 탭 시 lazy 로 부른다. */
export type { CondensedInsight } from "@fomo/core";
export const fetchThemeInsight = (theme: string) =>
  cachedGet(
    `theme-insight:${theme}`,
    () =>
      get<import("@fomo/core").CondensedInsight>(
        `/api/fomo/theme-insight?theme=${encodeURIComponent(theme)}`
      ),
    CACHE_TTL.themeInsight
  );

/** 개별 종목 이해·응축(작업3) — 종목 라벨 탭 시 lazy 로 부른다(테마 뎁스와 동일 구조). */
export const fetchStockInsight = (stock: string, opts: { naverCode?: string; market?: string; country?: string; symbol?: string } = {}) =>
  cachedGet(
    `stock-insight:${opts.country ?? "KR"}:${opts.naverCode ?? opts.symbol ?? "name"}:${stock}`,
    () =>
      get<import("@fomo/core").CondensedInsight>(
        `/api/fomo/stock-insight?stock=${encodeURIComponent(stock)}${opts.naverCode ? `&code=${encodeURIComponent(opts.naverCode)}` : ""}${opts.symbol ? `&symbol=${encodeURIComponent(opts.symbol)}` : ""}${opts.market ? `&market=${encodeURIComponent(opts.market)}` : ""}${opts.country ? `&country=${encodeURIComponent(opts.country)}` : ""}`
      ),
    CACHE_TTL.stockInsight
  );

/** 종목 기본 정보(바닥 — 주가·개요·시총·지표·재무). 항상 깔린다(원문 무관). */
export type { StockBasics } from "@fomo/core";
export const fetchStockBasics = (stock: string, opts: { naverCode?: string; symbol?: string } = {}) =>
  cachedGet(
    `stock-basics:${opts.naverCode ?? opts.symbol ?? "name"}:${stock}`,
    () =>
      get<import("@fomo/core").StockBasics>(
        `/api/fomo/stock-basics?stock=${encodeURIComponent(stock)}${opts.naverCode ? `&code=${encodeURIComponent(opts.naverCode)}` : ""}${opts.symbol ? `&symbol=${encodeURIComponent(opts.symbol)}` : ""}`
      ),
    CACHE_TTL.stockBasics
  );

/** 카드 앞면 FOMO 신호(rev2 후속) — baseline·라이브 수급 streak·시총순위·3개월 스파크라인. 도달 종목 lazy. */
export type { CardFrontSignals } from "@fomo/core";
export type { FomoScoreResult } from "@fomo/core";
export type { CompanyScoreResult } from "@fomo/core";
export type { TaFact } from "@fomo/core";
export type { AxisSignal, MultiAxisHookSelection } from "@fomo/core";
export interface StockFrontResponse {
  /** Daily-deck seeds can hydrate price and score before the full signal payload arrives. */
  signals?: import("@fomo/core").CardFrontSignals;
  score?: import("@fomo/core").CompanyScoreResult;
  card?: {
    canonical: string;
    assetClass: "kr-stock" | "us-stock" | "coin" | "macro";
    market: string;
    country: string;
    priceText: string | null;
    changeText: string | null;
    changeDir: "up" | "down" | "flat" | null;
    tag: string | null;
    headline: string;
    score: { value: number | null; status: "ready" | "accumulating"; label: string };
    verdict: { stance: string | null; summary: string };
    sparkline: number[];
  };
  quietMoney?: import("@fomo/core").QuietMoneyTimeline;
  committeeReview?: {
    runId: string;
    reviewedAt: string;
    tradingView: string;
    fundamentalView: string;
    timingGrade: "A" | "B" | "C";
    valuationGrade: "A" | "B" | "C";
    summary?: string;
    factChecked: true;
  };
  taFact?: import("@fomo/core").TaFact;
  ta?: import("@fomo/core").TechnicalAnalysisSnapshot;
  /** 캔들차트용 실제 일봉 OHLCV. non-lite 응답에 최대 260거래일. */
  candles?: import("@fomo/core").DailyOhlcv[];
  sparkline: number[];
  priceText?: string;
  changeText?: string;
  changeDir?: "up" | "down" | "flat";
  feedBull?: FeedSignalPoint;
  feedBear?: FeedSignalPoint;
  axisSignals?: import("@fomo/core").AxisSignal[];
  axisHook?: import("@fomo/core").MultiAxisHookSelection;
  /** 판단 층(WO Phase 1) — stance/근거/무효화. 캔들 부족 시 최소 verdict(관망). */
  verdict?: import("@fomo/core").CardVerdict;
  /** 결정론 와이코프 구간·이벤트 분석. non-lite 응답에만. */
  wyckoff?: import("@fomo/core").WyckoffAnalysis;
  /** 차트분석 탭 시리즈(WO 1.6 D) — 종가+MA20/60/120+거래량. non-lite 응답에만. */
  chartSeries?: {
    closes: number[];
    volumes: number[];
    ma20: Array<number | null>;
    ma60: Array<number | null>;
    ma120: Array<number | null>;
  };
  coinIssues?: Array<{
    id: string;
    symbols: string[];
    scope: "coin" | "market";
    type: "regulation" | "network" | "institution" | "onchain" | "macro";
    typeLabel: string;
    direction: "positive" | "negative" | "neutral";
    title: string;
    meaning: string;
    source: string;
    url: string;
    publishedAt: string;
  }>;
  coinCause?: {
    text: string;
    relation: "same-window" | "recent-context";
    sourceLabel: string;
    url: string;
    asOf: string;
    issueId: string;
  };
}

export interface FeedSignalPoint {
  text: string;
  source: "뉴스" | "수급" | "테마" | "가격" | "주목" | "위치" | "거래";
}
export const fetchStockFront = (stock: string, opts: { lite?: boolean; naverCode?: string; symbol?: string } = {}) => {
  const path = `/api/fomo/stock-front?stock=${encodeURIComponent(stock)}${opts.lite ? "&lite=1" : ""}${
    opts.naverCode ? `&naverCode=${encodeURIComponent(opts.naverCode)}` : ""
  }${opts.symbol ? `&symbol=${encodeURIComponent(opts.symbol)}` : ""}`;

  return cachedGet(
    `stock-front:v3-company-score:${opts.lite ? "lite" : "full"}:${stock}:${opts.naverCode ?? ""}:${opts.symbol ?? ""}`,
    async () => {
      try {
        return await fetchJsonWithTimeout<StockFrontResponse>(
          path,
          { cache: "no-store", credentials: "same-origin" },
          12_000,
          `GET ${path}`
        );
      } catch {
        return get<StockFrontResponse>(path);
      }
    },
    CACHE_TTL.stockFront
  );
};

export interface DiscoveryPerformancePriceRequestItem {
  stock: string;
  symbol?: string;
  naverCode?: string;
  market?: import("@fomo/core").StockMarket;
  country?: import("@fomo/core").StockCountry;
}

export interface DiscoveryPerformancePrice {
  yahooSymbol: string;
  currentPrice: number;
  asOf: string;
}

export interface DiscoveryPerformancePricesResponse {
  prices: Record<string, DiscoveryPerformancePrice>;
}

export async function fetchDiscoveryPerformancePrices(
  items: readonly DiscoveryPerformancePriceRequestItem[]
): Promise<DiscoveryPerformancePricesResponse> {
  const clean = items
    .filter((item) => item.stock)
    .slice(0, 40)
    .map((item) => ({
      stock: item.stock,
      ...(item.symbol ? { symbol: item.symbol } : {}),
      ...(item.naverCode ? { naverCode: item.naverCode } : {}),
      ...(item.market ? { market: item.market } : {}),
      ...(item.country ? { country: item.country } : {}),
    }));
  const key = `performance-prices:${clean
    .map((item) => `${item.stock}:${item.symbol ?? ""}:${item.naverCode ?? ""}:${item.market ?? ""}:${item.country ?? ""}`)
    .join("|")}`;
  return cachedGet(
    key,
    async () => {
      const res = await fetch(`${API_BASE}/api/fomo/performance-prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ items: clean }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`POST /api/fomo/performance-prices ${res.status}`);
      return res.json() as Promise<DiscoveryPerformancePricesResponse>;
    },
    CACHE_TTL.performancePrices
  );
}

export interface DiscoveryStockResponse {
  kind?: "stock";
  canonical: string;
  market: import("@fomo/core").StockMarket;
  country: import("@fomo/core").StockCountry;
  naverCode?: string;
  symbol?: string;
  marquee: boolean;
  sector: string;
  headline?: string;
  headlineProvenance?: {
    text: string;
    provenance: "synthesis" | "rule" | "suppressed";
    method: "ai" | "rule" | "none";
    eventRef?: {
      kind: string;
      source?: string;
      asOf?: string;
      title?: string;
      url?: string;
    };
  };
  whyShown?: string;
  reason?: string;
  sourceLabel?: string;
  sourceUrl?: string;
}

export interface DiscoveryThemeBundleItemResponse {
  ticker: string;
  label: string;
  market: import("@fomo/core").StockMarket;
  country?: import("@fomo/core").StockCountry;
  sector?: string;
  relation: "customer" | "supplier" | "material" | "peer" | "beneficiary";
  reason: string;
  source: string;
  confidence: "L" | "M" | "H";
  changePct?: number;
  naverCode?: string;
  symbol?: string;
}

export interface DiscoveryThemeBundleResponse {
  kind: "theme_bundle";
  id: string;
  title: string;
  subtitle: string;
  source: string;
  asOf: string;
  confidence: "L" | "M" | "H";
  anchorTicker: string;
  relation: "event_bundle";
  items: DiscoveryThemeBundleItemResponse[];
}

export interface DiscoveryNarrativeStockResponse {
  ticker: string;
  name: string;
  market: import("@fomo/core").StockMarket;
  country: import("@fomo/core").StockCountry;
  relation: "trigger" | "customer" | "supplier" | "material" | "peer" | "beneficiary";
  relationReason: string;
  changePct: number;
  naverCode?: string;
  symbol?: string;
}

export interface DiscoveryNarrativeResponse {
  kind: "narrative";
  id: string;
  scope: Extract<DiscoveryCountryScope, "KR" | "US">;
  trigger: {
    headline: string;
    source: string;
    asOf: string;
    anchorTicker: string;
    url?: string;
  };
  headline: string;
  stocks: DiscoveryNarrativeStockResponse[];
  source: string;
  asOf: string;
}

export type DiscoveryContentResponse = DeckContent;

export type DiscoveryCardResponse =
  | DiscoveryStockResponse
  | DiscoveryThemeBundleResponse
  | DiscoveryNarrativeResponse
  | DiscoveryContentResponse;

export interface DiscoveryResponse {
  asOf: string;
  country?: DiscoveryCountryScope;
  stocks: DiscoveryStockResponse[];
  cards?: DiscoveryCardResponse[];
  fronts: Record<string, StockFrontResponse>;
  confidence: "L" | "M" | "H";
  source: string;
}

export type Daily30AssetClass = "kr-stock" | "us-stock" | "coin" | "macro";

export interface Daily30Response extends DiscoveryResponse {
  country: "all";
  meta?: {
    targetCount: number;
    cards: Array<{
      id: string;
      assetClass: Daily30AssetClass;
      quietScore: number;
      signalScore: number;
      hypePenalty: number;
      signalTypes?: import("@fomo/core").SignalTypeCode[];
      signalPerformanceBonus?: number;
    }>;
    assetCounts: Record<Daily30AssetClass, number>;
    committee?: {
      runId: string;
      version: string;
      reviewedAt: string;
      candidateCount: number;
      selectedCount: number;
      callCount: number;
    };
    stale?: "committee-yesterday" | "engine-direct";
  };
}

export interface DiscoveryUpdatedDetail {
  country: DiscoveryCountryScope;
  discovery: DiscoveryResponse;
}

const DISCOVERY_CACHE_VERSION = "v7-signal-stats";
const discoveryKey = (country: DiscoveryCountryScope = "KR") =>
  `discovery:today:${DISCOVERY_CACHE_VERSION}:${country}:${kstDateKey()}`;
const discoveryStorageKey = (country: DiscoveryCountryScope = "KR") =>
  `fomo:discovery:${DISCOVERY_CACHE_VERSION}:${country}:${kstDateKey()}`;
const LAST_DISCOVERY_STORAGE_KEY = `fomo:discovery:last-good:${DISCOVERY_CACHE_VERSION}`;
const lastDiscoveryStorageKey = (country: DiscoveryCountryScope = "KR") => `${LAST_DISCOVERY_STORAGE_KEY}:${country}`;

function isDiscoveryResponse(value: unknown): value is DiscoveryResponse {
  const candidate = value as Partial<DiscoveryResponse> | null;
  return !!candidate && Array.isArray(candidate.stocks) && !!candidate.fronts && typeof candidate.fronts === "object";
}

function stockCopyFields(stock: DiscoveryStockResponse): string[] {
  return [
    stock.headline,
    stock.headlineProvenance?.text,
    stock.whyShown,
    stock.reason,
  ].filter((text): text is string => typeof text === "string" && text.trim().length > 0);
}

function cardCopyFields(card: DiscoveryCardResponse): string[] {
  if (card.kind === "theme_bundle") {
    return [card.title, card.subtitle, ...card.items.map((item) => item.reason)].filter(
      (text): text is string => typeof text === "string" && text.trim().length > 0
    );
  }
  if (card.kind === "narrative") {
    return [
      card.headline,
      card.trigger.headline,
      ...card.stocks.map((stock) => stock.relationReason),
    ].filter((text): text is string => typeof text === "string" && text.trim().length > 0);
  }
  if (card.kind === "content") {
    return [card.headline, ...card.facts.map((fact) => `${fact.label} ${fact.value}`)].filter(
      (text): text is string => typeof text === "string" && text.trim().length > 0
    );
  }
  return stockCopyFields(card);
}

/**
 * 오염 카피 카드만 제거(카드 단위 드랍) — 서버도 같은 패턴(@fomo/core)으로 거르므로 평소엔 no-op.
 * ⚠️ 과거엔 1장 오염이 덱 30장 전체를 무효 처리해 홈이 비었다(SKAI "TSID와" 실측) —
 * 전체 거부로 되돌리지 말 것. 30장 유지가 우선, 오염은 해당 카드만 잃는다.
 */
function sanitizeDiscoveryCopy<T extends DiscoveryResponse>(value: T): T {
  const stocks = value.stocks.filter((stock) => stockCopyFields(stock).every((text) => isDiscoveryCopySafe(text)));
  const cards = value.cards?.filter((card) => cardCopyFields(card).every((text) => isDiscoveryCopySafe(text)));
  if (stocks.length === value.stocks.length && (cards?.length ?? 0) === (value.cards?.length ?? 0)) return value;
  return { ...value, stocks, ...(cards ? { cards } : {}) };
}

function hasDiscoveryCards(value: DiscoveryResponse | null | undefined, country: DiscoveryCountryScope = "all"): value is DiscoveryResponse {
  return (
    discoveryMatchesCountry(value, country) &&
    (value.stocks.length > 0 || (value.cards?.length ?? 0) > 0)
  );
}

function readStoredDiscovery(country: DiscoveryCountryScope = "KR"): DiscoveryResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(discoveryStorageKey(country)) ?? window.localStorage.getItem(lastDiscoveryStorageKey(country));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const discovery = isDiscoveryResponse(parsed) ? sanitizeDiscoveryCopy(parsed) : null;
    if (hasDiscoveryCards(discovery, country)) return discovery;
    window.localStorage.removeItem(discoveryStorageKey(country));
    window.localStorage.removeItem(lastDiscoveryStorageKey(country));
    return null;
  } catch (err) {
    console.warn("[fetchDiscovery] localStorage read failed", err);
    return null;
  }
}

function writeStoredDiscovery(value: DiscoveryResponse, country: DiscoveryCountryScope = "KR"): void {
  if (typeof window === "undefined") return;
  if (!hasDiscoveryCards(value, country)) return;
  try {
    pruneStaleDatedCache();
    window.localStorage.setItem(discoveryStorageKey(country), JSON.stringify(value));
    window.localStorage.setItem(lastDiscoveryStorageKey(country), JSON.stringify(value));
  } catch (err) {
    console.warn("[fetchDiscovery] localStorage write failed", err);
  }
}

function emitDiscoveryUpdated(country: DiscoveryCountryScope, value: DiscoveryResponse): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DiscoveryUpdatedDetail>(DISCOVERY_UPDATED_EVENT, { detail: { country, discovery: value } }));
}

async function fetchDiscoveryNetwork({
  country = "KR",
  sameOriginTimeoutMs = DISCOVERY_SAME_ORIGIN_TIMEOUT_MS,
  backendTimeoutMs = DISCOVERY_BACKEND_TIMEOUT_MS,
}: {
  country?: DiscoveryCountryScope;
  sameOriginTimeoutMs?: number;
  backendTimeoutMs?: number;
} = {}): Promise<DiscoveryResponse> {
  const path = discoveryFastPath(country);
  try {
    return await fetchJsonWithTimeout<DiscoveryResponse>(
      path,
      { cache: "no-store", credentials: "same-origin" },
      sameOriginTimeoutMs,
      `GET ${path}`
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[fomoApi] same-origin discovery failed; retrying backend", err);
    }
  }

  let lastError: unknown = null;
  for (const origin of backendOrigins()) {
    try {
      return await fetchJsonWithTimeout<DiscoveryResponse>(
        `${origin}${path}`,
        { cache: "no-store" },
        backendTimeoutMs,
        `GET ${origin}${path}`
      );
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("GET /api/fomo/discovery failed");
}

export const getCachedDiscovery = (country: DiscoveryCountryScope = "KR") => readCached<DiscoveryResponse>(discoveryKey(country));

export async function fetchDiscovery(country: DiscoveryCountryScope = "KR"): Promise<DiscoveryResponse> {
  const key = discoveryKey(country);
  const cached = readCached<DiscoveryResponse>(key);
  if (hasDiscoveryCards(cached, country)) return cached;

  const stored = readStoredDiscovery(country);
  if (stored) {
    setCached(key, stored, CACHE_TTL.stockFront);
    void refreshCached(
      key,
      () =>
        fetchDiscoveryNetwork({
          country,
          sameOriginTimeoutMs: DISCOVERY_SAME_ORIGIN_TIMEOUT_MS,
          backendTimeoutMs: DISCOVERY_REVALIDATE_TIMEOUT_MS,
        }),
      CACHE_TTL.stockFront
      )
      .then((raw) => {
        const fresh = sanitizeDiscoveryCopy(raw);
        if (!hasDiscoveryCards(fresh, country)) return;
        writeStoredDiscovery(fresh, country);
        emitDiscoveryUpdated(country, fresh);
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[fetchDiscovery] revalidate failed", err);
        }
      });
    return stored;
  }

  const fresh = sanitizeDiscoveryCopy(await fetchDiscoveryNetwork({ country }));
  if (!hasDiscoveryCards(fresh, country)) throw new Error(`GET /api/fomo/discovery returned invalid ${country} deck`);
  setCached(key, fresh, CACHE_TTL.stockFront);
  writeStoredDiscovery(fresh, country);
  return fresh;
}

export const warmDiscovery = (country: DiscoveryCountryScope = "KR") => fetchDiscovery(country);

function hasDaily30Cards(value: Daily30Response | null | undefined): value is Daily30Response {
  return hasDiscoveryCards(value, "all") && value.country === "all" && (value.cards?.length ?? 0) > 0;
}

async function fetchDaily30Network(): Promise<Daily30Response> {
  const path = daily30Path();
  try {
    return await fetchJsonWithTimeout<Daily30Response>(
      path,
      { cache: "no-store", credentials: "same-origin" },
      DISCOVERY_SAME_ORIGIN_TIMEOUT_MS,
      `GET ${path}`
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[fomoApi] same-origin daily-30 failed; retrying backend", err);
    }
  }

  let lastError: unknown = null;
  for (const origin of backendOrigins()) {
    try {
      return await fetchJsonWithTimeout<Daily30Response>(
        `${origin}${path}`,
        { cache: "no-store" },
        DISCOVERY_BACKEND_TIMEOUT_MS,
        `GET ${origin}${path}`
      );
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("GET /api/fomo/daily-30 failed");
}

export async function fetchDaily30(): Promise<Daily30Response> {
  const key = `daily-30:${DISCOVERY_CACHE_VERSION}:${kstDateKey()}`;
  const cached = readCached<Daily30Response>(key);
  if (hasDaily30Cards(cached)) return cached;
  // 유효성 검사를 fetcher 안에서 던진다 — 빈/무효 덱이 cachedGet 에 저장돼 재시도가 캐시된 빈 덱으로
  // 단락되는 오염을 막는다(서버 콜드빌드 폴백 200-빈덱 대응). 검사 통과분만 캐시된다.
  return cachedGet(
    key,
    async () => {
      const fresh = sanitizeDiscoveryCopy(await fetchDaily30Network());
      if (!hasDaily30Cards(fresh)) throw new Error("GET /api/fomo/daily-30 returned invalid deck");
      return fresh;
    },
    CACHE_TTL.daily30
  );
}

export const warmDaily30 = () => fetchDaily30();

// ── 조용한 돈 픽(WO-G1A/B) ────────────────────────────────────────────────
export type QuietPickSignalKind = "insider_cluster" | "institution_streak" | "foreign_streak" | "multi_cluster";
export type QuietPickAnomalyKind =
  | "frequency"
  | "participants"
  | "scale"
  | "silence"
  | "vacuum"
  | "near_low";
export interface QuietPickAnomaly {
  kind: QuietPickAnomalyKind;
  text: string;
  /** 칩 문구 — 훅이 이미 말하는 축이면 `null`(WO-SUB-HOOK H4). */
  chip?: string | null;
  strength: number;
}
/** 카드 3형(WO-HOOK-01) — 서버가 고른 형·후킹·그림 재료. 화면은 그리기만 한다. */
export interface QuietPickCardType {
  type: "A" | "B" | "C" | "D" | "E";
  /** 후킹 문장. `\n` 이 의도된 줄바꿈이다. */
  hook: string;
  figure:
    | { kind: "divergence"; priceSeries: number[]; buySeries: number[]; buyLegend: string; priceLegend?: string }
    /**
     * `actor` 는 그림 아래 캡션이 accent 를 설명하는 데 쓴다(A 의 `buyLegend`·C 의 `actor` 와 같은 자리).
     * 구 페이로드에는 없다 — 하루 한 번 굽는 배치라 한 배치 동안 비어 올 수 있어 선택 필드로 둔다.
     * `priceSeries`/`markerIndex` 는 큰 숫자 시절 스파크라인 재료다. 화면은 더 이상 쓰지 않지만
     * 페이로드 호환을 위해 타입에 남긴다(서버가 계속 실어 보낸다).
     */
    | { kind: "ratio"; ratioPct: number; actor?: string; priceSeries?: number[]; markerIndex?: number }
    | { kind: "streak"; buyDays: boolean[]; streakFrom: number; streakTo: number; actor: string }
    /** E형 — 거래량 막대. 급증 구간만 accent(WO-RESET-03 A-6). */
    | { kind: "volume"; volumes: number[]; spikeFrom: number; baseDays: number }
    /**
     * F형 — 보유 비중 게이지(WO-RESET-07 §B-4). 인물 카드가 쓴다.
     * 회색 = 직전까지 있던 것, 라임 = 이번에 늘어난 것. 전량 매도면 전부 회색이다.
     */
    | { kind: "weight"; weightPct: number; priorWeightPct: number; maxPct?: number; caption: string };
  /** 보조 최대 2줄. */
  support: string[];
}

/** 「왜 지금 사는가」 한 줄(WO-RESET-02 PART C). 서버가 굽는 시점에 굳혀 보낸다. */
export interface QuietPickWhyNowEvent {
  /** `YYYY-MM-DD`. 없으면 상태 서술(`지금`)이다. */
  date?: string;
  /** 왼쪽 열 — `8월 4일` / `지금`. */
  when: string;
  text: string;
  /** 공시 원문. 없으면 링크를 그리지 않는다. */
  url?: string;
}

/** WO-RESET-05 §4 — 3걸음의 한 줄. 숫자와 **그 숫자를 읽는 문장**. */
export interface CompanyMetricRow {
  label: string;
  value: string;
  /** 비교 문장. **이게 없으면 줄이 없다.** */
  comparison: string;
}

/** WO-RESET-05 §4-4 — 세 덩어리(돈·값·빚) 중 하나. 합친 점수는 없다. */
export interface CompanyGroup {
  /** `돈은 잘 버나요` 처럼 **질문**. */
  title: string;
  rows: CompanyMetricRow[];
  /** 5점 만점. 잴 수 없으면 `null`. */
  score: number | null;
  /** 점 옆 문장. `score` 가 있으면 반드시 있다. */
  scoreText: string | null;
  /** `어떻게 계산했나요` 가 그대로 쓴다. */
  method: string;
}

/**
 * WO-RESET-08 §B — 자금 흐름 카드. **종목 카드가 아니라 시장 카드**라 픽과 나눠서 온다.
 * 화면이 같은 덱 앞쪽에 끼워 넣는다(§D-1) — 별도 섹션이 아니다.
 */
export interface QuietPickFlowCard {
  fromSector: string;
  toSector: string;
  fromNet: number;
  toNet: number;
  fromStocks: number;
  toStocks: number;
  windowDays: number;
  /** 결론 두 줄 — 인과로 말하지 않는다. 서버가 만든 것을 그대로 쓴다. */
  hook: string;
  support: string[];
}

/** WO-RESET-09 §B-1 — 거시 카드. 종목 카드가 아니라 시장 카드다. */
export interface QuietPickMacroCard {
  indicatorId: string;
  indicatorName: string;
  /** 최신 관측일 `YYYY-MM-DD`. 화면은 이걸 직접 쓰지 않는다 — `asOfLabel` 을 쓴다. */
  asOf: string;
  /**
   * 화면에 그대로 쓰는 상대 시간 — `어제 기준` · `3일 전 기준`(MACRO-01 §B-3).
   * **굽는 시점에 굳혀 보낸다.** 화면이 계산하면 캐시된 페이지에서 어제 것이 오늘로 읽힌다.
   */
  asOfLabel: string;
  /** `streak` · `spike` · `level` · `inversion`. */
  kind: string;
  /** `fx` · `rate` · `credit` · `index` · `commodity`. */
  category: string;
  streakDays: number;
  direction: "up" | "down";
  fromText: string;
  toText: string;
  changePct: number;
  series: number[];
  hook: string;
  support: string[];
  /**
   * 일반 원리 — **예측이 아니다**. **상세에만 쓴다**(MACRO-01 §D-2).
   * 카드에 넣으면 카드가 길어지고, 길어진 카드는 눌리지 않는다.
   */
  principle: string;
  favored: Array<{ canonical: string; pickedAt: string }>;
  hurt: Array<{ canonical: string; pickedAt: string }>;
}

export interface QuietPick {
  subject: {
    canonical: string;
    /** 화면 표기용 회사명(데이터 계층 정규화 — 전 화면 동일 값, WO-P6 ③). */
    displayName?: string;
    /** 티커(US 심볼 / KR 종목코드). */
    ticker?: string;
    symbol?: string;
    naverCode?: string;
    market: string;
    country: "KR" | "US";
    identity?: string;
    /**
     * 시총 표기("시총 $13B" 의 값 부분) — 마스킹된 앞면에 남기는 판단 재료(WO-HOOK-01 §2-2).
     * KR 은 아직 금액이 없어 비어 온다. 없으면 그 항목만 빠진다(자리표시자 금지).
     */
    marketCapText?: string;
  };
  price: { current: number; currentText?: string; changePct?: number; sparkline: number[] };
  signal: {
    kind: QuietPickSignalKind;
    code: string;
    actors: string;
    scale: string;
    days: number;
    priceAtSignal: number;
    startedAt: string;
    strength: number;
    /**
     * 화면 순위 점수(WO-DECK-01) — 신규성 × 재노출 쿨다운 × 이례성. 연속일수는 들어가지 않는다.
     * 구 페이로드에는 없으므로 선택 필드.
     */
    rankScore?: number;
    /** 유효 경과일(재등장 시계 `ageAnchor` 반영). 신규/지속 판정의 기준. */
    ageDays?: number;
    ageAnchor?: string;
    /** 어제까지 1페이지에 연속으로 있던 일수. */
    page1Streak?: number;
    insiderCount?: number;
    /** 신호 강화 재등장 문구(WO-P4). "1일 더 이어졌어요" 는 오지 않는다(WO-DECK-01 §3-2). */
    progress?: string;
    /** 재등장 사유(WO-DECK-01 §3-2) — 쿨다운·상한을 넘어 다시 올라온 이유. 카드에 표시한다. */
    reentry?: {
      code: "invalidation_break" | "new_material" | "actor_joined" | "structure_shift";
      text: string;
      occurredAt: string;
    };
  };
  /** 훅 — 무슨 일이 일어났나 한 문장(WO-SUB-HOOK PART 1). */
  hook: string;
  /**
   * 카드 3형(WO-HOOK-01) — 신호가 고른 형과 그 형의 후킹·그림 재료. 발행 시점에 굳는다.
   *
   * 구 payload 에는 없다. 픽 payload 는 하루 한 번 크론이 구우므로 배포 직후 한 배치 동안은
   * 이 필드가 비어 온다 — 그때 카드는 종전 훅으로 그린다(폴백).
   */
  cardType?: QuietPickCardType;
  /**
   * 「왜 지금 사는가」 날짜 항목(WO-RESET-02). **서버가 굽는 시점에 굳힌다** — 화면이 공시를
   * 가져오지 않는다. 비었거나 없으면 상세가 섹션을 그리지 않는다(§C-3).
   */
  whyNow?: QuietPickWhyNowEvent[];
  /** 공시 0건일 때의 줄(§C-4). 수집 전이면 없다 — "없었다" 와 "안 봤다" 는 다르다. */
  whyNowQuietNote?: string;
  /**
   * WO-RESET-05 §4 — 3걸음 「어떤 회사인가」. 굽는 시점에 굳는다.
   * 비교 기준이 없는 지표는 **줄 자체가 없다**(맨숫자 금지). 없으면 필드가 없다.
   */
  companyRead?: CompanyGroup[];
  /**
   * WO-RESET-06 — 노출 이력. **처음 나온 종목이면 이 필드가 없다**.
   * 카드는 `다시 나왔어요` 라벨과 처음 가격을, 상세 1걸음은 이력 줄을 읽는다.
   */
  /** WO-RESET-07 — 인물 카드일 때만. 이름·기관·공시일. */
  investor?: { id: string; name: string; firm: string; asOf: string; changeKind: string };
  exposure?: {
    count: number;
    firstDate: string;
    /** 화면 표기 — `8월 24일`. **코어가 만든다**(화면이 날짜를 조립하지 않는다). */
    firstWhen: string;
    firstPrice?: number;
    recent: Array<{ date: string; when: string; reason: string; price?: number; code?: string }>;
  };
  /**
   * 카드 칩 — 훅이 말하지 않는 근거만, 서로 다른 축으로 최대 3개.
   * 발행 시점에 굳는다(카드가 다시 조립하지 않는다). 구 페이로드에는 없으므로 선택 필드.
   */
  chips?: string[];
  anomalies: QuietPickAnomaly[];
  /**
   * 이례성 문장의 원료 **실수치**(WO-SYNC F-2). 확보된 값만 실린다 — 미상 필드는 아예 없다.
   * 카드는 문장을 되파싱하지 말고 이 값을 쓴다.
   */
  signalFacts?: {
    priorBuys12mo?: number;
    volumePct?: number;
    mcapPct?: number;
    mentionCount?: number;
    volumeElevated?: boolean;
    isLongestStreak?: boolean;
    streakWindowDays?: number;
    volumeVacuumRatio?: number;
    pctAboveYearLow?: number;
  };
  invalidation: { level: number | null; text: string };
  conviction: {
    whyCompany: string;
    whyNow: { phase?: string; summary?: string; keyLevels?: { low?: number; high?: number } };
    committee: {
      tradingView?: string;
      fundamentalView?: string;
      timingGrade: "A" | "B" | "C";
      valuationGrade: "A" | "B" | "C";
      verdict1line: string;
    };
  };
  companyScore: number | null;
  /** 유동성 경고(WO-P4) — 하한은 넘었지만 얇은 종목. */
  liquidityNote?: string;
  /** 이 신호의 과거 성적(WO-P2) — 없으면 카드가 블록을 숨긴다. */
  signalStats?: QuietPickSignalStats;
  /**
   * 우리 성적 (DS-01 §3-⑥) — **이 종목을 우리가 언제 짚었고 그 뒤 얼마인가.**
   * 카드에서 accent 를 쓰는 유일한 자리다.
   *
   * 백엔드가 아직 내려주지 않는다(발행 스냅샷에서 종목별 최초 발행일·당시가를 집계하는
   * 작업이 선행). 그래서 지금 이 필드는 항상 `undefined` 이고 카드는 블록을 그리지 않는다 —
   * 자리표시자를 두지 않는다(DS-00 §1-1). 필드가 오면 카드가 그때부터 그린다.
   *
   * 사용자 개인 열람 기록(`discoveryPerformance` 의 firstSeen*)으로 채워선 안 된다.
   * "우리가 짚은 날"과 "당신이 처음 본 날"은 다른 사실이다.
   */
  ourRecord?: {
    /** 가장 오래된 발행일(ISO). */
    firstPublishedAt: string;
    /** 화면 문구 — "8월 17일에 짚은 뒤". 서버가 만든다(카드가 날짜를 조립하지 않는다). */
    sinceText: string;
    /** 발행일 당시가 대비 현재 수익률(%). 음수도 그대로 온다. */
    returnPct: number;
  };
  qualifiedAt: string;
}

/** "이런 신호, 과거엔 어땠나" — 승률·중앙값·하락비율 세트(상승만 말하지 않는다). */
export interface QuietPickSignalStats {
  n: number;
  up: number;
  winRate: number;
  down: number;
  downRate: number;
  medianReturn: number;
  windowDays: number;
  sourceLabel: string;
  method: string;
  headline: string;
  detail: string;
}
/** 지켜보는 중(WO-P4) — 신호 있으나 픽 기준 미달. 픽 승격 아님. */
export interface QuietWatchItem {
  subject: QuietPick["subject"];
  signal: { kind: QuietPickSignalKind; code: string; actors: string; scale: string; days: number };
  price?: { current?: number; currentText?: string; changePct?: number };
  reasonCode: string;
  reasonText: string;
}

export interface QuietPicksResponse {
  asOf: string;
  date: string;
  picks: QuietPick[];
  /** WO-RESET-08 — 자금 흐름 카드(하루 최대 2장). 없는 날이 정상이다. */
  flowCards?: QuietPickFlowCard[];
  /** WO-RESET-09 — 거시 카드(하루 최대 2장). 없는 날이 정상이다. */
  macroCards?: QuietPickMacroCard[];
  watching?: QuietWatchItem[];
  qualification?: unknown;
  source: string;
}

function quietPicksPath(): string {
  return "/api/fomo/quiet-picks";
}

/** 발행됐지만 0장인 날은 정직한 상태(에러 아님) — picks 배열 존재만 확인. */
function isQuietPicksResponse(value: QuietPicksResponse | null | undefined): value is QuietPicksResponse {
  return !!value && Array.isArray(value.picks);
}

async function fetchQuietPicksNetwork(): Promise<QuietPicksResponse> {
  const path = quietPicksPath();
  try {
    return await fetchJsonWithTimeout<QuietPicksResponse>(
      path,
      { cache: "no-store", credentials: "same-origin" },
      DISCOVERY_SAME_ORIGIN_TIMEOUT_MS,
      `GET ${path}`
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.warn("[fomoApi] same-origin quiet-picks failed; retrying backend", err);
  }
  let lastError: unknown = null;
  for (const origin of backendOrigins()) {
    try {
      return await fetchJsonWithTimeout<QuietPicksResponse>(
        `${origin}${path}`,
        { cache: "no-store" },
        DISCOVERY_BACKEND_TIMEOUT_MS,
        `GET ${origin}${path}`
      );
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("GET /api/fomo/quiet-picks failed");
}

/** 미발행(503)이면 throw(호출부가 재시도), 발행-0장이면 picks:[] 정상 반환. */
export async function fetchQuietPicks(): Promise<QuietPicksResponse> {
  const key = `quiet-picks:${DISCOVERY_CACHE_VERSION}:${kstDateKey()}`;
  const cached = readCached<QuietPicksResponse>(key);
  if (isQuietPicksResponse(cached) && cached.picks.length > 0) return cached;
  return cachedGet(
    key,
    async () => {
      const fresh = await fetchQuietPicksNetwork();
      if (!isQuietPicksResponse(fresh)) throw new Error("GET /api/fomo/quiet-picks returned invalid payload");
      return fresh;
    },
    CACHE_TTL.daily30
  );
}

export const warmQuietPicks = () => fetchQuietPicks().catch(() => null);

export interface AxisSnapshotEntry {
  axisSignals: import("@fomo/core").AxisSignal[];
  axisHook: import("@fomo/core").MultiAxisHookSelection;
}

export interface AxisSnapshotResponse {
  items: Record<string, AxisSnapshotEntry>;
}

export const fetchAxisSnapshot = (stocks: readonly string[]) => {
  const unique = [...new Set(stocks.map((s) => s.trim()).filter(Boolean))].slice(0, 60);
  return cachedGet(
    `axis-snapshot:${unique.join("|")}`,
    () => get<AxisSnapshotResponse>(`/api/fomo/axis-snapshot?stocks=${encodeURIComponent(unique.join(","))}`),
    CACHE_TTL.stockFront
  );
};

/** 섹터 → 종목 풀(섹터구조 ②). 콜드스타트 노출 순. baseline=true 면 baseline 보장(국내) 종목만. */
export type { StockSector, SectorStock } from "@fomo/core";
export interface SectorStocksResponse {
  sector: import("@fomo/core").StockSector;
  stocks: import("@fomo/core").SectorStock[];
}
export const fetchSectorStocks = (sector: string, baselineOnly = false) =>
  cachedGet(
    `sector-stocks:${sector}:${baselineOnly ? "baseline" : "all"}`,
    () =>
      get<SectorStocksResponse>(
        `/api/fomo/sector-stocks?sector=${encodeURIComponent(sector)}${baselineOnly ? "&baseline=1" : ""}`
      ),
    CACHE_TTL.sectorStocks
  );

export const fetchCalendar = (sessionId: string, month?: string) =>
  getPrivate<CalendarResponse>(
    `/api/fomo/emotions/calendar?sessionId=${encodeURIComponent(sessionId)}${month ? `&month=${month}` : ""}`
  );

async function getPrivate<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw new Error(`GET ${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export async function postVote(
  sessionId: string,
  emotion: string,
  voice?: { situationKey: string; resolveKey: string }
): Promise<TallyResponse & { mine: string }> {
  const res = await fetch("/api/fomo/emotions/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ sessionId, emotion, source: "web", ...voice }),
  });
  if (!res.ok) throw new Error(`vote ${res.status}`);
  return res.json();
}

export interface VoiceItem {
  emotion: string;
  text: string;
  /** true=포모 큐레이션(콜드스타트 폴백) / false=실제 사용자 조합. */
  curated: boolean;
}

/** M4 피드 — 타인의 구조화 한마디. */
export const fetchVoices = () => get<{ date: string; items: VoiceItem[] }>("/api/fomo/voices");

interface LoginResponse {
  user: { id: string; displayName: string | null; isNew: boolean };
}

/**
 * 카카오 access_token으로 로그인 → BFF가 JWT를 HttpOnly 쿠키에 저장한 뒤 안전한 사용자 정보만 반환.
 * [보관] 감정 캘린더(FEATURE_HISTORY_TAB) 가입 흐름 전용 — 현재 flag OFF라 미사용.
 * 인증 백엔드(`/api/fomo/auth/login`)는 감정 모델 복원 시 함께 복원한다.
 */
export async function loginKakao(accessToken: string): Promise<LoginResponse> {
  const res = await fetch("/api/fomo/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "KAKAO", identityToken: accessToken }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  const data = (await res.json()) as LoginResponse;
  return data;
}

/** 로그인 직후 익명 sessionId 기록을 내 계정으로 연결(가입 전 감정 보존). */
export async function linkSession(sessionId: string): Promise<{ linked: number }> {
  const res = await fetch("/api/fomo/emotions/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error(`link ${res.status}`);
  return res.json();
}

// ── 트랙 B: 취향 학습 적재 ──────────────────────────────────────────────────
// 스와이프(관심/덜관심)·깊이 신호(뎁스 열람/연관주 탭)를 서버에 쌓는다. 로그인 쿠키가 있으면 BFF가 유저별,
// 아니면 익명 sessionId 로(익명 적재 먼저). fire-and-forget — 실패해도 스와이프 흐름을 막지 않는다.
export type TasteSubjectType = "theme" | "stock";
export type TasteSignalKind = "more" | "less" | "view_depth" | "tap_related";

export function recordTaste(
  subjectType: TasteSubjectType,
  subject: string,
  signal: TasteSignalKind
): void {
  // WO-M1: priceAt 없는 TasteSignal 이중 기록은 폐기. 종목 덱은 recordJudgmentAction을 사용한다.
  void subjectType;
  void subject;
  void signal;
}

// ── 트랙 B: 이메일+비밀번호 인증 ────────────────────────────────────────────
// 비로그인 둘러보기는 그대로 유지 — 로그인은 "취향을 기억"하기 위한 선택. 로그인/가입 직후
// 익명 sessionId 로 쌓인 취향을 내 계정으로 연결(linkTaste)해 가입 전 학습이 끊기지 않게 한다.

/** 익명 sessionId 취향 신호 → 내 계정 연결(로그인 직후 1회). 실패해도 흐름 안 막음. */
async function linkTaste(): Promise<void> {
  // WO-M1: append-only actor는 수정하지 않는다. 히스토리 조회가 uid와 현재 session actor를 함께 읽는다.
}

async function authPost(path: string, email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<LoginResponse> & { error?: string };
  if (!res.ok || !data.user) throw new Error(data.error || `auth ${res.status}`);
  await linkTaste(); // 가입 전 익명 취향을 계정으로 이어붙임
  return data as LoginResponse;
}

/** 이메일+비밀번호 가입 → JWT 저장 + 익명 취향 연결. */
export const registerEmail = (email: string, password: string) =>
  authPost("/api/fomo/auth/register", email, password);

/** 이메일+비밀번호 로그인 → JWT 저장 + 익명 취향 연결. */
export const loginEmail = (email: string, password: string) =>
  authPost("/api/fomo/auth/login", email, password);

/** 로그아웃 — BFF의 HttpOnly 쿠키를 만료시킨다. */
export async function logout(): Promise<void> {
  const res = await fetch("/api/fomo/auth/logout", { method: "POST", credentials: "same-origin" });
  if (!res.ok) throw new Error(`logout ${res.status}`);
}

/** 탈퇴 — 계정·취향 신호 삭제(서버 CASCADE) 후 토큰 제거. */
export async function deleteAccount(): Promise<void> {
  const res = await fetch("/api/fomo/account", {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`delete ${res.status}`);
}

/* ────────────────────────────────────────────────────────────────────────────
 * WO-SUB-08 — 카드 3슬롯
 *
 * ① 트리거는 이미 `QuietPick` 안에 있다(수급 엔진). ②③ 은 배치가 만든 저장 레코드에서
 * 백엔드가 조립해 준다. **프론트는 계산하지 않는다** — INV-14 경계다.
 * ─────────────────────────────────────────────────────────────────────────── */

/** ② 실체 — 카드 앞면에 낼 문장 하나. `kind`·`badge` 는 디테일에서만 쓴다(카드에 배지 금지). */
export interface CardSubstanceSlot {
  text: string;
  kind: string;
  badge: string;
  vendor_only: boolean;
}

export interface CardSlotPayload {
  canonical: string;
  market: string;
  /** `null` 이면 슬롯을 생략하고 아래가 올라온다(빈 공간 금지). */
  substance: CardSubstanceSlot | null;
  /** `null` 이면 차트 영역 자체가 사라진다(빈 박스 금지). 타입은 `@fomo/core` 의 계약을 따른다. */
  valuation: ValuationChartData | null;
  valuation_unavailable_reason: string | null;
  /**
   * 값을 읽는 프레임 (WO-SUB-HOOK D8) — 밴드 위치 캡션 + 유형별 경고문.
   * 차트를 못 그려도 디테일 재무 섹션에 붙는다. 구 페이로드에는 없으므로 선택 필드.
   */
  valuation_frame?: ValuationFrameNotes | null;
  /**
   * "이게 틀리는 경우" (WO-SUB-06 §6). 팩트시트가 없으면 `null` — 섹션을 그리지 않는다.
   * 유형 리스크만 있고 종목 고유 리스크가 없는 상태는 `null` 이 아니다(설계된 정상 경로).
   */
  risk: WhereThisIsWrongBlock | null;
}

export interface CardSlotsResponse {
  date: string;
  ruleset_version: string;
  slots: Record<string, CardSlotPayload>;
}

function isCardSlotsResponse(value: unknown): value is CardSlotsResponse {
  if (typeof value !== "object" || value === null) return false;
  const slots = (value as { slots?: unknown }).slots;
  return typeof slots === "object" && slots !== null;
}

/**
 * 3슬롯 페이로드. **실패해도 카드는 그려져야 한다** — ②③ 은 선택 슬롯이고,
 * 없으면 카드가 지금과 동일한 모습이 되는 것이 정상이다(08 §4-1). 그래서 던지지 않고 빈 맵을 준다.
 */
export async function fetchCardSlots(): Promise<CardSlotsResponse> {
  const res = await fetch("/api/fomo/card-slots", { credentials: "same-origin" }).catch(() => null);
  if (!res?.ok) return { date: "", ruleset_version: "", slots: {} };
  const body: unknown = await res.json().catch(() => null);
  return isCardSlotsResponse(body) ? body : { date: "", ruleset_version: "", slots: {} };
}

/** 무효 조건 성적 (WO-SUB-07 §8). */
export interface InvalidationMetric {
  n: number;
  reached: number;
  notReached: number;
  /** 판정하지 못한 수. **미충족으로 세지 않는다**(§6-4). */
  undetermined: number;
  rate: number | null;
}

export interface InvalidationSummary {
  generatedAt: string;
  price: InvalidationMetric;
  business: InvalidationMetric;
  businessUndeterminedReasons: Record<string, number>;
  rulesetVersions: Record<string, number>;
}

/**
 * 무효 조건 성적. **실패해도 성적표 나머지는 그려야 한다** — 선택 블록이다.
 * 그래서 던지지 않고 null 을 준다.
 */
export async function fetchInvalidationSummary(): Promise<InvalidationSummary | null> {
  const res = await fetch(`${API_BASE}/api/fomo/invalidation-summary`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const body: unknown = await res.json().catch(() => null);
  if (!body || typeof body !== "object") return null;
  const value = body as Partial<InvalidationSummary>;
  return value.price && value.business ? (value as InvalidationSummary) : null;
}
