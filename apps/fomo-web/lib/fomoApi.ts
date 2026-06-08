// FOMO API 클라이언트. API는 apps/web(@trading/web)의 /api/fomo/*에 있다.
// NEXT_PUBLIC_FOMO_API_BASE로 오버라이드(로컬: http://127.0.0.1:3200), 기본은 배포된 prod.
import type { BannerItem } from "@fomo/core";
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
export const fetchBanner = () => get<{ items: BannerItem[] }>("/api/fomo/banner");

export const fetchCalendar = (sessionId: string, month?: string) =>
  get<CalendarResponse>(
    `/api/fomo/emotions/calendar?sessionId=${encodeURIComponent(sessionId)}${month ? `&month=${month}` : ""}`
  );

export async function postVote(sessionId: string, emotion: string): Promise<TallyResponse & { mine: string }> {
  const res = await fetch(`${API_BASE}/api/fomo/emotions/vote`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ sessionId, emotion, source: "web" }),
  });
  if (!res.ok) throw new Error(`vote ${res.status}`);
  return res.json();
}

interface LoginResponse {
  token: string;
  user: { id: string; displayName: string | null; isNew: boolean };
}

/** 카카오 access_token으로 타로 백엔드 로그인 → JWT 저장 후 반환. */
export async function loginKakao(accessToken: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/tarot/auth/login`, {
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
