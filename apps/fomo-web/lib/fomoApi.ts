// FOMO API 클라이언트. API는 apps/web(@trading/web)의 /api/fomo/*에 있다.
// NEXT_PUBLIC_FOMO_API_BASE로 오버라이드(로컬: http://127.0.0.1:3200), 기본은 배포된 prod.
const API_BASE =
  process.env.NEXT_PUBLIC_FOMO_API_BASE?.replace(/\/$/, "") ||
  "https://taro-stock-web.vercel.app";

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
export const fetchPulse = () => get<{ items: string[] }>("/api/fomo/pulse");
export const fetchWhale = () => get<{ items: string[] }>("/api/fomo/whale");

export const fetchCalendar = (sessionId: string, month?: string) =>
  get<CalendarResponse>(
    `/api/fomo/emotions/calendar?sessionId=${encodeURIComponent(sessionId)}${month ? `&month=${month}` : ""}`
  );

export async function postVote(sessionId: string, emotion: string): Promise<TallyResponse & { mine: string }> {
  const res = await fetch(`${API_BASE}/api/fomo/emotions/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, emotion, source: "web" }),
  });
  if (!res.ok) throw new Error(`vote ${res.status}`);
  return res.json();
}
