// FOMO API 클라이언트. API는 apps/web(@trading/web)의 /api/fomo/*에 있다.
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
import { getToken, setToken } from "@/lib/auth";

export type { BannerItem } from "@fomo/core";

const API_BASE =
  process.env.NEXT_PUBLIC_FOMO_API_BASE?.replace(/\/$/, "") ||
  "https://taro-stock-web.vercel.app";

/** 로그인 토큰이 있으면 Authorization 헤더를 붙인다(없으면 익명). */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
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
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", headers: authHeaders() });
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

export const fetchCalendar = (sessionId: string, month?: string) =>
  get<CalendarResponse>(
    `/api/fomo/emotions/calendar?sessionId=${encodeURIComponent(sessionId)}${month ? `&month=${month}` : ""}`
  );

export async function postVote(
  sessionId: string,
  emotion: string,
  voice?: { situationKey: string; resolveKey: string }
): Promise<TallyResponse & { mine: string }> {
  const res = await fetch(`${API_BASE}/api/fomo/emotions/vote`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
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
  token: string;
  user: { id: string; displayName: string | null; isNew: boolean };
}

/**
 * 카카오 access_token으로 로그인 → JWT 저장 후 반환.
 * [보관] 감정 캘린더(FEATURE_HISTORY_TAB) 가입 흐름 전용 — 현재 flag OFF라 미사용.
 * 인증 백엔드(`/api/fomo/auth/login`)는 감정 모델 복원 시 함께 복원한다.
 */
export async function loginKakao(accessToken: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/fomo/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "KAKAO", identityToken: accessToken }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  const data = (await res.json()) as LoginResponse;
  if (data.token) setToken(data.token);
  return data;
}

/** 로그인 직후 익명 sessionId 기록을 내 계정으로 연결(가입 전 감정 보존). */
export async function linkSession(sessionId: string): Promise<{ linked: number }> {
  const res = await fetch(`${API_BASE}/api/fomo/emotions/link`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error(`link ${res.status}`);
  return res.json();
}
