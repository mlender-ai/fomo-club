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
} from "@fomo/core";
import { getSessionId } from "@/lib/session";
import { cachedGet, readCached, refreshCached, setCached } from "./apiCache";

export type { BannerItem } from "@fomo/core";

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
export type DiscoveryCountryScope = "KR" | "US" | "all";

function discoveryFastPath(country: DiscoveryCountryScope = "KR"): string {
  return `/api/fomo/discovery?fast=1&country=${encodeURIComponent(country)}`;
}

function kstDateKey(now = new Date()): string {
  return new Date(now.getTime() + 9 * HOUR).toISOString().slice(0, 10);
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
  try {
    return await fetchJsonWithTimeout<FomoIndexResponse>(
      "/api/fomo/index",
      { cache: "no-store", credentials: "same-origin" },
      sameOriginTimeoutMs,
      "GET /api/fomo/index"
    );
  } catch (sameOriginErr) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[fetchIndex] same-origin failed; retrying backend", sameOriginErr);
    }
  }

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
}
export const fetchFeed = () => get<FeedResponse>("/api/fomo/feed");

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
export const fetchStockBasics = (stock: string, opts: { naverCode?: string } = {}) =>
  cachedGet(
    `stock-basics:${opts.naverCode ?? "name"}:${stock}`,
    () =>
      get<import("@fomo/core").StockBasics>(
        `/api/fomo/stock-basics?stock=${encodeURIComponent(stock)}${opts.naverCode ? `&code=${encodeURIComponent(opts.naverCode)}` : ""}`
      ),
    CACHE_TTL.stockBasics
  );

/** 카드 앞면 FOMO 신호(rev2 후속) — baseline·라이브 수급 streak·시총순위·3개월 스파크라인. 도달 종목 lazy. */
export type { CardFrontSignals } from "@fomo/core";
export type { FomoScoreResult } from "@fomo/core";
export type { TaFact } from "@fomo/core";
export type { AxisSignal, MultiAxisHookSelection } from "@fomo/core";
export interface StockFrontResponse {
  signals: import("@fomo/core").CardFrontSignals;
  fomo: import("@fomo/core").FomoScoreResult;
  taFact?: import("@fomo/core").TaFact;
  sparkline: number[];
  priceText?: string;
  changeText?: string;
  changeDir?: "up" | "down" | "flat";
  feedBull?: FeedSignalPoint;
  feedBear?: FeedSignalPoint;
  axisSignals?: import("@fomo/core").AxisSignal[];
  axisHook?: import("@fomo/core").MultiAxisHookSelection;
}

export interface FeedSignalPoint {
  text: string;
  source: "뉴스" | "수급" | "테마" | "가격" | "주목" | "위치" | "거래";
}
export const fetchStockFront = (stock: string, opts: { lite?: boolean } = {}) =>
  cachedGet(
    `stock-front:${opts.lite ? "lite" : "full"}:${stock}`,
    () =>
      get<StockFrontResponse>(
        `/api/fomo/stock-front?stock=${encodeURIComponent(stock)}${opts.lite ? "&lite=1" : ""}`
      ),
    CACHE_TTL.stockFront
  );

export interface DiscoveryStockResponse {
  kind?: "stock";
  canonical: string;
  market: import("@fomo/core").StockMarket;
  country: import("@fomo/core").StockCountry;
  naverCode?: string;
  symbol?: string;
  marquee: boolean;
  sector: string;
  whyShown?: string;
  reason?: string;
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

export type DiscoveryCardResponse = DiscoveryStockResponse | DiscoveryThemeBundleResponse;

export interface DiscoveryResponse {
  asOf: string;
  stocks: DiscoveryStockResponse[];
  cards?: DiscoveryCardResponse[];
  fronts: Record<string, StockFrontResponse>;
  confidence: "L" | "M" | "H";
  source: string;
}

const discoveryKey = (country: DiscoveryCountryScope = "KR") => `discovery:today:v5:${country}:${kstDateKey()}`;
const discoveryStorageKey = (country: DiscoveryCountryScope = "KR") => `fomo:discovery:v5:${country}:${kstDateKey()}`;
const LAST_DISCOVERY_STORAGE_KEY = "fomo:discovery:last-good:v5";
const lastDiscoveryStorageKey = (country: DiscoveryCountryScope = "KR") => `${LAST_DISCOVERY_STORAGE_KEY}:${country}`;

function isDiscoveryResponse(value: unknown): value is DiscoveryResponse {
  const candidate = value as Partial<DiscoveryResponse> | null;
  return !!candidate && Array.isArray(candidate.stocks) && !!candidate.fronts && typeof candidate.fronts === "object";
}

function hasDiscoveryCards(value: DiscoveryResponse | null | undefined): value is DiscoveryResponse {
  return !!value && isDiscoveryResponse(value) && (value.stocks.length > 0 || (value.cards?.length ?? 0) > 0);
}

function readStoredDiscovery(country: DiscoveryCountryScope = "KR"): DiscoveryResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(discoveryStorageKey(country)) ?? window.localStorage.getItem(lastDiscoveryStorageKey(country));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const discovery = isDiscoveryResponse(parsed) ? parsed : null;
    if (hasDiscoveryCards(discovery)) return discovery;
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
  if (!hasDiscoveryCards(value)) return;
  try {
    window.localStorage.setItem(discoveryStorageKey(country), JSON.stringify(value));
    window.localStorage.setItem(lastDiscoveryStorageKey(country), JSON.stringify(value));
  } catch (err) {
    console.warn("[fetchDiscovery] localStorage write failed", err);
  }
}

function emitDiscoveryUpdated(value: DiscoveryResponse): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DiscoveryResponse>(DISCOVERY_UPDATED_EVENT, { detail: value }));
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
  if (hasDiscoveryCards(cached)) return cached;

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
      .then((fresh) => {
        if (!hasDiscoveryCards(fresh)) return;
        writeStoredDiscovery(fresh, country);
        emitDiscoveryUpdated(fresh);
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[fetchDiscovery] revalidate failed", err);
        }
      });
    return stored;
  }

  const fresh = await fetchDiscoveryNetwork({ country });
  if (hasDiscoveryCards(fresh)) setCached(key, fresh, CACHE_TTL.stockFront);
  writeStoredDiscovery(fresh, country);
  return fresh;
}

export const warmDiscovery = (country: DiscoveryCountryScope = "KR") => fetchDiscovery(country);

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
  if (typeof window === "undefined" || !subject) return;
  void fetch("/api/fomo/taste", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ subjectType, subject, signal, sessionId: getSessionId() }),
    keepalive: true, // 화면 전환/언마운트 중에도 전송 보장
  }).catch((err) => console.warn("[recordTaste] failed", err));
}

// ── 트랙 B: 이메일+비밀번호 인증 ────────────────────────────────────────────
// 비로그인 둘러보기는 그대로 유지 — 로그인은 "취향을 기억"하기 위한 선택. 로그인/가입 직후
// 익명 sessionId 로 쌓인 취향을 내 계정으로 연결(linkTaste)해 가입 전 학습이 끊기지 않게 한다.

/** 익명 sessionId 취향 신호 → 내 계정 연결(로그인 직후 1회). 실패해도 흐름 안 막음. */
async function linkTaste(): Promise<void> {
  try {
    await fetch("/api/fomo/taste/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ sessionId: getSessionId() }),
    });
  } catch (err) {
    console.warn("[linkTaste] failed", err);
  }
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
