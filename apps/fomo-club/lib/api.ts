import Constants from "expo-constants";

// FOMO API 베이스. app.json extra.apiBaseUrl → EXPO_PUBLIC_FOMO_API_URL → 배포 prod.
const configured = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)?.trim();
export const API_BASE = (
  (configured && configured.length > 0 ? configured : undefined) ??
  process.env.EXPO_PUBLIC_FOMO_API_URL ??
  "https://taro-stock-web.vercel.app"
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
