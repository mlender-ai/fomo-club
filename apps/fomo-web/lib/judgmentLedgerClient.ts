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

export async function fetchTrackRecord(): Promise<TrackRecordResponse> {
  const res = await fetch("/api/fomo/track-record", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/fomo/track-record ${res.status}`);
  return res.json() as Promise<TrackRecordResponse>;
}

export async function fetchLedgerTimeline(canonical: string): Promise<{ entries: LedgerTimelineEntry[] }> {
  const query = new URLSearchParams({ canonical, sessionId: getSessionId() });
  const res = await fetch(`/api/fomo/ledger/timeline?${query}`, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw new Error(`GET /api/fomo/ledger/timeline ${res.status}`);
  return res.json() as Promise<{ entries: LedgerTimelineEntry[] }>;
}
