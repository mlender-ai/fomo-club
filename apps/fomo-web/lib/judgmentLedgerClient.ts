import { cachedGet } from "./apiCache";
import { getSessionId } from "./session";

export type LedgerAsset = "kr-stock" | "us-stock" | "coin" | "macro";
export type LedgerUserAction = "seen" | "pass" | "star" | "depth";

export interface JudgmentActionInput {
  action: LedgerUserAction;
  occurredAt?: string | number;
  subject: { asset: LedgerAsset; canonical: string; symbol?: string };
  priceAt: number;
  details?: Record<string, string | number | boolean | undefined>;
  imported?: boolean;
}

export interface JudgmentHistoryItem {
  stock: string;
  firstSeenAt: number;
  firstSeenPrice: number;
  firstSeenPriceText?: string;
  companyScore?: number;
  companyScoreLabel?: string;
  symbol?: string;
  naverCode?: string;
  market?: string;
  country?: string;
  sector?: string;
  reason?: string;
  action?: "skip" | "save";
  actionAt?: number;
}

export interface TrackMetric {
  n: number;
  winRate: number | null;
  medianReturn: number | null;
}

export interface TrackWindowResult {
  days: 7 | 30 | 90;
  overall: TrackMetric;
  byAsset: Record<string, TrackMetric>;
  bySignal: Record<string, TrackMetric>;
  byScoreBand: Record<string, TrackMetric>;
}

export interface TrackRecordResponse {
  generatedAt: string;
  methodology: "all-final-selections-fixed-windows";
  signalTaxonomyVersion: string;
  signalMinimumSample: number;
  windows: TrackWindowResult[];
  signalHistory30: Record<string, TrackMetric>;
}

export interface LedgerTimelineEntry {
  id: string;
  date: string;
  ts: string;
  kind: "signal" | "verdict" | "score" | "selection" | "user_action" | "outcome";
  actor: string;
  priceAt: number;
  payload: Record<string, unknown>;
}

export type ReviewStance = "enter" | "watch" | "avoid";
export type ReviewAction = "star" | "pass" | "seen";

export interface JudgmentReviewRow {
  selectionId: string;
  canonical: string;
  symbol?: string;
  asset: LedgerAsset;
  selectionDate: string;
  actionAt: string;
  stance: ReviewStance;
  action: ReviewAction;
  returnPct: number;
  outcome: "up" | "down";
  signalTypes: string[];
}

export interface JudgmentReviewResponse {
  generatedAt: string;
  windowDays: 30;
  rows: JudgmentReviewRow[];
  pendingCount: number;
  matrix: Array<{ key: string; label: string; note: string; count: number }>;
  userRate: { n: number; winRate: number | null };
  cardRate: { n: number; winRate: number | null };
  weekly: null | {
    from: string;
    to: string;
    count: number;
    best?: JudgmentReviewRow;
    missed?: JudgmentReviewRow;
    disagreements: JudgmentReviewRow[];
  };
  strongSignals: Array<{ code: string; label: string; n: number; winRate: number }>;
}

export async function recordJudgmentActions(entries: readonly JudgmentActionInput[]): Promise<{ appended: number }> {
  if (entries.length === 0) return { appended: 0 };
  const res = await fetch("/api/fomo/ledger/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ sessionId: getSessionId(), entries }),
    keepalive: entries.length <= 4,
  });
  if (!res.ok) throw new Error(`POST /api/fomo/ledger/actions ${res.status}`);
  return res.json() as Promise<{ appended: number }>;
}

export function recordJudgmentAction(entry: JudgmentActionInput): void {
  if (typeof window === "undefined") return;
  void recordJudgmentActions([entry]).catch((error) => {
    if (process.env.NODE_ENV !== "production") console.warn("[judgment-ledger] action append failed", error);
  });
}

export async function fetchJudgmentHistory(): Promise<{ items: JudgmentHistoryItem[] }> {
  const res = await fetch(`/api/fomo/ledger/history?sessionId=${encodeURIComponent(getSessionId())}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GET /api/fomo/ledger/history ${res.status}`);
  return res.json() as Promise<{ items: JudgmentHistoryItem[] }>;
}

export async function fetchJudgmentReview(): Promise<JudgmentReviewResponse> {
  const res = await fetch(`/api/fomo/ledger/review?sessionId=${encodeURIComponent(getSessionId())}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GET /api/fomo/ledger/review ${res.status}`);
  return res.json() as Promise<JudgmentReviewResponse>;
}

export async function fetchTrackRecord(): Promise<TrackRecordResponse> {
  const res = await fetch("/api/fomo/track-record", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/fomo/track-record ${res.status}`);
  return res.json() as Promise<TrackRecordResponse>;
}

export interface ScorecardPickReturn {
  returnPct: number;
  evaluationDate: string;
}
export interface ScorecardPick {
  canonical: string;
  symbol?: string;
  naverCode?: string;
  market?: string;
  country?: string;
  date: string;
  priceAt: number;
  hook?: string;
  pickType?: string;
  signalTypes: string[];
  returns: Record<"7" | "30" | "90", ScorecardPickReturn | null>;
}
export interface ScorecardPicksResponse {
  generatedAt: string;
  picks: ScorecardPick[];
}

export async function fetchScorecardPicks(): Promise<ScorecardPicksResponse> {
  const res = await fetch("/api/fomo/track-record/picks", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/fomo/track-record/picks ${res.status}`);
  return res.json() as Promise<ScorecardPicksResponse>;
}

/** 발행 원장은 하루 한 번 구워지는 값이다 — 화면 진입마다 DB 를 때릴 이유가 없다. */
const SCORECARD_TTL_MS = 15 * 60_000;

/**
 * 성적표 원장 — **캐시본**. 카드 ⑥ 우리 성적(DS-01)이 덱 진입마다 이걸 부르므로 원본 호출을
 * 그대로 쓰면 메인 화면이 DB 조회를 한 번 더 만든다(백엔드 커넥션 풀은 15개다).
 * 실패는 던진다 — 호출부가 빈 배열로 흘려보내고 성적 블록만 사라진다.
 */
export function fetchScorecardPicksCached(): Promise<ScorecardPicksResponse> {
  return cachedGet("scorecard-picks", fetchScorecardPicks, SCORECARD_TTL_MS);
}

export async function fetchLedgerTimeline(canonical: string): Promise<{
  entries: LedgerTimelineEntry[];
  signalHistory30: Record<string, TrackMetric>;
}> {
  const query = new URLSearchParams({ canonical, sessionId: getSessionId() });
  const res = await fetch(`/api/fomo/ledger/timeline?${query}`, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw new Error(`GET /api/fomo/ledger/timeline ${res.status}`);
  return res.json() as Promise<{ entries: LedgerTimelineEntry[]; signalHistory30: Record<string, TrackMetric> }>;
}
