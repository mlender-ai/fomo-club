import Constants from "expo-constants";
import type { BannerItem, MarketScore, MoodSignal, DeckCard } from "@fomo/core";

// FOMO API 베이스. app.json extra.apiBaseUrl → EXPO_PUBLIC_FOMO_API_URL → 배포 prod.
const configured = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)?.trim();
export const API_BASE = (
  (configured && configured.length > 0 ? configured : undefined) ??
  process.env.EXPO_PUBLIC_FOMO_API_URL ??
  "https://fomo-club-backend.vercel.app"
).replace(/\/$/, "");

// 익명 세션 ID — MVP: 앱 실행 단위 랜덤. (후속: expo-secure-store로 영속화)
let _sessionId: string | null = null;
export function getSessionId(): string {
  if (!_sessionId) {
    _sessionId = `m_${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
  return _sessionId;
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

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchIndex = () => get<FomoIndexResponse>("/api/fomo/index");
export const fetchToday = () => get<TallyResponse>("/api/fomo/emotions/today");

// ── 피벗(피드 중심) — 웹과 동일 데이터. docs/PIVOT_FEED_FIRST.md ──

/** 롤링 배너 + 상단 캐러셀용 시장 점수(나스닥/비트코인/코스피). */
export interface BannerResponse {
  items: BannerItem[];
  markets?: MarketScore[];
}
export const fetchBanner = () => get<BannerResponse>("/api/fomo/banner");

/** 오늘 탭 분위기 시그널 + (미사용)감정 카드. */
export interface FeedResponse {
  moods: MoodSignal[];
  cards?: unknown;
}
export const fetchFeed = () => get<FeedResponse>("/api/fomo/feed");

/** 피드 탭 스와이프 덱(뉴스+차트, 포모 코멘트 포함). */
export interface NewsResponse {
  deck: DeckCard[];
  lang: "en" | "ko";
}
export const fetchNews = () => get<NewsResponse>("/api/fomo/news");

export async function postVote(emotion: string): Promise<TallyResponse & { mine: string }> {
  const res = await fetch(`${API_BASE}/api/fomo/emotions/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: getSessionId(), emotion, source: "mobile" }),
  });
  if (!res.ok) throw new Error(`vote ${res.status}`);
  return res.json();
}

// 데일리 챌린지 — 미수락 → 진행 중 → 완료의 3단계. 선행 1·2단계(백엔드)가 계약을 정의.
export type ChallengeStatus = "unaccepted" | "in_progress" | "completed";

export interface ChallengeResponse {
  date: string;
  /** 진행 상태. 데이터 미비 시 'unaccepted' 폴백. */
  status: ChallengeStatus;
  title: string;
  description: string;
  /** 이 챌린지의 보상 포인트. */
  points: number;
  /** 누적 포인트(완료한 챌린지 합산). */
  totalPoints: number;
}

export const fetchChallenge = () =>
  get<ChallengeResponse>(`/api/fomo/challenge/today?sessionId=${encodeURIComponent(getSessionId())}`);

export async function acceptChallenge(): Promise<ChallengeResponse> {
  const res = await fetch(`${API_BASE}/api/fomo/challenge/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: getSessionId(), source: "mobile" }),
  });
  if (!res.ok) throw new Error(`accept ${res.status}`);
  return res.json();
}
