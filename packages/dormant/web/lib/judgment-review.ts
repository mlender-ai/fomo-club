import { signalTypeLabel, type SignalTypeCode, type VerdictStance } from "@fomo/core";
import { prisma } from "./prisma";
import { asOutcome, type OutcomePayload } from "./ledger-track-record";
import { readLedgerSelections, type LedgerAsset, type LedgerSelectionView } from "./judgment-ledger";

export type ReviewAction = "star" | "pass" | "seen";
export type ReviewOutcome = "up" | "down";

export interface ReviewUserAction {
  id: string;
  actor: string;
  canonical: string;
  ts: Date;
  action: ReviewAction;
}

export interface JudgmentReviewRow {
  selectionId: string;
  canonical: string;
  symbol?: string;
  asset: LedgerAsset;
  selectionDate: string;
  actionAt: string;
  stance: VerdictStance;
  action: ReviewAction;
  returnPct: number;
  outcome: ReviewOutcome;
  signalTypes: SignalTypeCode[];
}

export const REVIEW_MATRIX_KEYS = [
  "both-selected-up",
  "both-selected-down",
  "card-selected-user-not-up",
  "card-selected-user-not-down",
  "card-not-user-selected-up",
  "card-not-user-selected-down",
  "neither-up",
  "neither-down",
] as const;

export type ReviewMatrixKey = (typeof REVIEW_MATRIX_KEYS)[number];

export interface ReviewMatrixCell {
  key: ReviewMatrixKey;
  label: string;
  note: string;
  count: number;
}

export interface ReviewRate {
  n: number;
  winRate: number | null;
}

export interface StrongSignal {
  code: SignalTypeCode;
  label: string;
  n: number;
  winRate: number;
}

export interface WeeklyReview {
  from: string;
  to: string;
  count: number;
  best?: JudgmentReviewRow;
  missed?: JudgmentReviewRow;
  disagreements: JudgmentReviewRow[];
}

export interface JudgmentReviewResponse {
  generatedAt: string;
  windowDays: 30;
  rows: JudgmentReviewRow[];
  pendingCount: number;
  matrix: ReviewMatrixCell[];
  userRate: ReviewRate;
  cardRate: ReviewRate;
  weekly: WeeklyReview | null;
  strongSignals: StrongSignal[];
}

const MATRIX_COPY: Record<ReviewMatrixKey, { label: string; note: string }> = {
  "both-selected-up": { label: "합작 성공", note: "카드 진입 · 내가 담음 · 상승" },
  "both-selected-down": { label: "함께 점검", note: "카드 진입 · 내가 담음 · 하락" },
  "card-selected-user-not-up": { label: "아까운 판단", note: "카드 진입 · 내가 비담음 · 상승" },
  "card-selected-user-not-down": { label: "넘김이 지킨 판단", note: "카드 진입 · 내가 비담음 · 하락" },
  "card-not-user-selected-up": { label: "나만의 발견", note: "카드 비진입 · 내가 담음 · 상승" },
  "card-not-user-selected-down": { label: "엇갈린 판단", note: "카드 비진입 · 내가 담음 · 하락" },
  "neither-up": { label: "함께 지나친 상승", note: "카드 비진입 · 내가 비담음 · 상승" },
  "neither-down": { label: "함께 피한 하락", note: "카드 비진입 · 내가 비담음 · 하락" },
};

function roundRate(wins: number, n: number): number | null {
  return n === 0 ? null : Math.round((wins / n) * 1_000) / 10;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function selectionStance(selection: LedgerSelectionView): VerdictStance | null {
  const stance = selection.payload.front?.verdict?.stance;
  return stance === "enter" || stance === "watch" || stance === "avoid" ? stance : null;
}

function matrixKey(row: JudgmentReviewRow): ReviewMatrixKey {
  const cardSelected = row.stance === "enter";
  const userSelected = row.action === "star";
  if (cardSelected && userSelected) return row.outcome === "up" ? "both-selected-up" : "both-selected-down";
  if (cardSelected) return row.outcome === "up" ? "card-selected-user-not-up" : "card-selected-user-not-down";
  if (userSelected) return row.outcome === "up" ? "card-not-user-selected-up" : "card-not-user-selected-down";
  return row.outcome === "up" ? "neither-up" : "neither-down";
}

function closestSelection(action: ReviewUserAction, selections: readonly LedgerSelectionView[]): LedgerSelectionView | null {
  const candidates = selections.filter((selection) => selection.subject.canonical === action.canonical);
  const before = candidates.filter((selection) => selection.ts.getTime() <= action.ts.getTime() + 60_000);
  return (before.length > 0 ? before : candidates)
    .sort((a, b) => Math.abs(action.ts.getTime() - a.ts.getTime()) - Math.abs(action.ts.getTime() - b.ts.getTime()))[0] ?? null;
}

function primaryActions(actions: readonly ReviewUserAction[]): ReviewUserAction[] {
  const grouped = new Map<string, ReviewUserAction[]>();
  for (const action of actions) {
    // uid와 현재 익명 session actor를 함께 읽을 때 같은 종목을 두 번 채점하지 않는다.
    const key = action.canonical;
    const rows = grouped.get(key) ?? [];
    rows.push(action);
    grouped.set(key, rows);
  }
  return [...grouped.values()].map((rows) => {
    const ordered = [...rows].sort((a, b) => a.ts.getTime() - b.ts.getTime());
    const explicit = ordered.filter((row) => row.action === "star" || row.action === "pass");
    return explicit.at(-1) ?? ordered.find((row) => row.action === "seen")!;
  }).filter(Boolean);
}

export function buildJudgmentReview(
  selections: readonly LedgerSelectionView[],
  actions: readonly ReviewUserAction[],
  outcomes: readonly OutcomePayload[],
  now = new Date()
): JudgmentReviewResponse {
  const outcomeBySelection = new Map(
    outcomes.filter((outcome) => outcome.windowDays === 30).map((outcome) => [outcome.selectionId, outcome])
  );
  let pendingCount = 0;
  const rows = primaryActions(actions).flatMap((action): JudgmentReviewRow[] => {
    const selection = closestSelection(action, selections);
    const stance = selection ? selectionStance(selection) : null;
    if (!selection || !stance) return [];
    const outcome = outcomeBySelection.get(selection.id);
    if (!outcome) {
      pendingCount += 1;
      return [];
    }
    return [{
      selectionId: selection.id,
      canonical: selection.subject.canonical,
      ...(selection.subject.symbol ? { symbol: selection.subject.symbol } : {}),
      asset: selection.subject.asset,
      selectionDate: selection.date,
      actionAt: action.ts.toISOString(),
      stance,
      action: action.action,
      returnPct: Math.round(outcome.returnPct * 100) / 100,
      outcome: outcome.returnPct > 0 ? "up" : "down",
      signalTypes: selection.payload.signalTypes,
    }];
  }).sort((a, b) => b.actionAt.localeCompare(a.actionAt));

  const counts = new Map<ReviewMatrixKey, number>(REVIEW_MATRIX_KEYS.map((key) => [key, 0]));
  for (const row of rows) counts.set(matrixKey(row), (counts.get(matrixKey(row)) ?? 0) + 1);
  const matrix = REVIEW_MATRIX_KEYS.map((key) => ({ key, ...MATRIX_COPY[key], count: counts.get(key) ?? 0 }));

  const userJudgments = rows.filter((row) => row.action === "star" || row.action === "pass");
  const userWins = userJudgments.filter((row) => row.action === "star" ? row.outcome === "up" : row.outcome === "down").length;
  const cardJudgments = rows.filter((row) => row.stance === "enter" || row.stance === "avoid");
  const cardWins = cardJudgments.filter((row) => row.stance === "enter" ? row.outcome === "up" : row.outcome === "down").length;

  const signalGroups = new Map<SignalTypeCode, { n: number; wins: number }>();
  for (const row of userJudgments) {
    const won = row.action === "star" ? row.outcome === "up" : row.outcome === "down";
    for (const code of row.signalTypes) {
      const metric = signalGroups.get(code) ?? { n: 0, wins: 0 };
      metric.n += 1;
      if (won) metric.wins += 1;
      signalGroups.set(code, metric);
    }
  }
  const strongSignals = [...signalGroups.entries()]
    .filter(([, metric]) => metric.n >= 10)
    .map(([code, metric]) => ({ code, label: signalTypeLabel(code), n: metric.n, winRate: roundRate(metric.wins, metric.n)! }))
    .sort((a, b) => b.winRate - a.winRate || b.n - a.n || a.code.localeCompare(b.code))
    .slice(0, 3);

  const today = isoDate(now);
  const weekStart = addDays(today, -6);
  const weeklyRows = rows.filter((row) => {
    const outcome = outcomeBySelection.get(row.selectionId);
    return !!outcome && outcome.evaluationDate >= weekStart && outcome.evaluationDate <= today;
  });
  const best = [...weeklyRows]
    .filter((row) => (row.action === "star" && row.outcome === "up") || (row.action === "pass" && row.outcome === "down"))
    .sort((a, b) => Math.abs(b.returnPct) - Math.abs(a.returnPct))[0];
  const missed = [...weeklyRows]
    .filter((row) => row.action !== "star" && row.outcome === "up")
    .sort((a, b) => b.returnPct - a.returnPct)[0];
  const disagreements = weeklyRows
    .filter((row) => row.action !== "seen" && (row.stance === "enter") !== (row.action === "star"))
    .sort((a, b) => Math.abs(b.returnPct) - Math.abs(a.returnPct))
    .slice(0, 3);

  return {
    generatedAt: now.toISOString(),
    windowDays: 30,
    rows,
    pendingCount,
    matrix,
    userRate: { n: userJudgments.length, winRate: roundRate(userWins, userJudgments.length) },
    cardRate: { n: cardJudgments.length, winRate: roundRate(cardWins, cardJudgments.length) },
    weekly: weeklyRows.length > 0 ? {
      from: weekStart,
      to: today,
      count: weeklyRows.length,
      ...(best ? { best } : {}),
      ...(missed ? { missed } : {}),
      disagreements,
    } : null,
    strongSignals,
  };
}

export async function readJudgmentReview(actors: readonly `user:${string}`[]): Promise<JudgmentReviewResponse> {
  if (actors.length === 0) return buildJudgmentReview([], [], []);
  const actionRows = await prisma.judgmentLedger.findMany({
    where: { kind: "user_action", actor: { in: [...actors] } },
    orderBy: { ts: "asc" },
    take: 5_000,
  });
  const actions = actionRows.flatMap((row): ReviewUserAction[] => {
    if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return [];
    const action = (row.payload as Record<string, unknown>).action;
    if (!(action === "seen" || action === "pass" || action === "star")) return [];
    return [{ id: row.id, actor: row.actor, canonical: row.canonical, ts: row.ts, action }];
  });
  if (actions.length === 0) return buildJudgmentReview([], [], []);
  const earliest = isoDate(actions.reduce((min, row) => row.ts < min ? row.ts : min, actions[0]!.ts));
  const [selections, outcomeRows] = await Promise.all([
    readLedgerSelections({ fromDate: addDays(earliest, -7), take: 10_000 }),
    prisma.judgmentLedger.findMany({
      where: { kind: "outcome", actor: "engine" },
      select: { payload: true },
      orderBy: { ts: "asc" },
      take: 20_000,
    }),
  ]);
  const outcomes = outcomeRows.flatMap((row) => {
    const parsed = asOutcome(row.payload);
    return parsed ? [parsed] : [];
  });
  return buildJudgmentReview(selections, actions, outcomes);
}
