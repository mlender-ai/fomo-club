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

export type { BannerItem } from "@fomo/core";

const API_BASE =
  process.env.NEXT_PUBLIC_FOMO_API_BASE?.replace(/\/$/, "") ||
  "https://fomo-club-backend.vercel.app";

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

export const fetchIndex = () => get<FomoIndexResponse>("/api/fomo/index");
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
}
export const fetchKeywords = () => get<KeywordsResponse>("/api/fomo/keywords");

/** 테마 이해·응축(데이터 엔진 Track A+B) — 뎁스 페이지가 카드 탭 시 lazy 로 부른다. */
export type { CondensedInsight } from "@fomo/core";
export const fetchThemeInsight = (theme: string) =>
  get<import("@fomo/core").CondensedInsight>(
    `/api/fomo/theme-insight?theme=${encodeURIComponent(theme)}`
  );

/** 개별 종목 이해·응축(작업3) — 종목 라벨 탭 시 lazy 로 부른다(테마 뎁스와 동일 구조). */
export const fetchStockInsight = (stock: string) =>
  get<import("@fomo/core").CondensedInsight>(
    `/api/fomo/stock-insight?stock=${encodeURIComponent(stock)}`
  );

/** 종목 기본 정보(바닥 — 주가·개요·시총·지표·재무). 항상 깔린다(원문 무관). */
export type { StockBasics } from "@fomo/core";
export const fetchStockBasics = (stock: string) =>
  get<import("@fomo/core").StockBasics>(
    `/api/fomo/stock-basics?stock=${encodeURIComponent(stock)}`
  );

/** 카드 앞면 FOMO 신호(rev2 후속) — baseline·라이브 수급 streak·시총순위·3개월 스파크라인. 도달 종목 lazy. */
export type { CardFrontSignals } from "@fomo/core";
export type { FomoScoreResult } from "@fomo/core";
export type { TaFact } from "@fomo/core";
export interface StockFrontResponse {
  signals: import("@fomo/core").CardFrontSignals;
  fomo: import("@fomo/core").FomoScoreResult;
  taFact?: import("@fomo/core").TaFact;
  sparkline: number[];
  priceText?: string;
  changeText?: string;
  changeDir?: "up" | "down" | "flat";
}
export const fetchStockFront = (stock: string) =>
  get<StockFrontResponse>(`/api/fomo/stock-front?stock=${encodeURIComponent(stock)}`);

/** 섹터 → 종목 풀(섹터구조 ②). 콜드스타트 노출 순. baseline=true 면 baseline 보장(국내) 종목만. */
export type { StockSector, SectorStock } from "@fomo/core";
export interface SectorStocksResponse {
  sector: import("@fomo/core").StockSector;
  stocks: import("@fomo/core").SectorStock[];
}
export const fetchSectorStocks = (sector: string, baselineOnly = false) =>
  get<SectorStocksResponse>(
    `/api/fomo/sector-stocks?sector=${encodeURIComponent(sector)}${baselineOnly ? "&baseline=1" : ""}`
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
