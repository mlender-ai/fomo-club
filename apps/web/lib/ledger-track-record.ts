import { Prisma } from "@prisma/client";
import { appendJudgmentLedger, ledgerKey, readLedgerSelections, type LedgerSelectionView } from "./judgment-ledger";
import { kstDate } from "./fomo";
import { prisma } from "./prisma";
import { fetchHistoricalPrices, type HistoricalQuoteRequestItem } from "./quote-prices";

export const TRACK_WINDOWS = [7, 30, 90] as const;
export type TrackWindow = (typeof TRACK_WINDOWS)[number];

export interface TrackMetric {
  n: number;
  winRate: number | null;
  medianReturn: number | null;
}

export interface TrackWindowResult {
  days: TrackWindow;
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

export interface OutcomePayload {
  selectionId: string;
  selectionDate: string;
  windowDays: TrackWindow;
  evaluationDate: string;
  selectedPrice: number;
  returnPct: number;
  asset: string;
  signalTypes: string[];
  scoreBand?: string;
  companyScore?: number;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function asOutcome(payload: Prisma.JsonValue): OutcomePayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  if (
    typeof value.selectionId !== "string" ||
    typeof value.selectionDate !== "string" ||
    !TRACK_WINDOWS.includes(value.windowDays as TrackWindow) ||
    typeof value.evaluationDate !== "string" ||
    typeof value.selectedPrice !== "number" ||
    typeof value.returnPct !== "number" ||
    typeof value.asset !== "string"
  ) return null;
  return {
    selectionId: value.selectionId,
    selectionDate: value.selectionDate,
    windowDays: value.windowDays as TrackWindow,
    evaluationDate: value.evaluationDate,
    selectedPrice: value.selectedPrice,
    returnPct: value.returnPct,
    asset: value.asset,
    signalTypes: Array.isArray(value.signalTypes) ? value.signalTypes.filter((item): item is string => typeof item === "string") : [],
    ...(typeof value.scoreBand === "string" ? { scoreBand: value.scoreBand } : {}),
    ...(typeof value.companyScore === "number" ? { companyScore: value.companyScore } : {}),
  };
}

function quoteFor(selection: LedgerSelectionView, windowDays: TrackWindow): HistoricalQuoteRequestItem {
  return {
    key: `${selection.id}:${windowDays}`,
    stock: selection.subject.canonical,
    targetDate: addDays(selection.date, windowDays),
    ...(selection.subject.symbol ? { symbol: selection.subject.symbol } : {}),
    ...(selection.payload.naverCode ? { naverCode: selection.payload.naverCode } : {}),
    ...(selection.payload.market ? { market: selection.payload.market } : {}),
    ...(selection.payload.country ? { country: selection.payload.country } : {}),
    ...(selection.payload.front?.candles?.length ? { candles: selection.payload.front.candles } : {}),
  };
}

/** Cron-only: append exact 7/30/90-day outcomes for every final selection that is due. */
export async function materializeLedgerOutcomes(today = kstDate(), maxOutcomes = 240): Promise<{
  due: number;
  priced: number;
  appended: number;
  unpriced: number;
  targetDates: string[];
  assetCounts: Record<string, number>;
}> {
  const fromDate = addDays(today, -100);
  const selections = await readLedgerSelections({ fromDate, take: 5_000 });
  const existingRows = await prisma.judgmentLedger.findMany({
    where: { kind: "outcome", date: { gte: fromDate } },
    select: { payload: true },
    take: 20_000,
  });
  const existing = new Set(
    existingRows.flatMap((row) => {
      const outcome = asOutcome(row.payload);
      return outcome ? [`${outcome.selectionId}:${outcome.windowDays}`] : [];
    })
  );
  const due = selections.flatMap((selection) =>
    TRACK_WINDOWS.flatMap((windowDays) => {
      const targetDate = addDays(selection.date, windowDays);
      const key = `${selection.id}:${windowDays}`;
      // A calendar date is not an observable outcome until its market session has completed.
      // The next daily cron evaluates it using that date or the following first trading day.
      return targetDate < today && !existing.has(key) ? [{ selection, windowDays, targetDate, key }] : [];
    })
  ).slice(0, maxOutcomes);
  const targetDates = [...new Set(due.map((item) => item.targetDate))].sort();
  const assetCounts = Object.fromEntries(
    [...new Set(due.map((item) => item.selection.subject.asset))].sort().map((asset) => [
      asset,
      due.filter((item) => item.selection.subject.asset === asset).length,
    ])
  );
  if (due.length === 0) return { due: 0, priced: 0, appended: 0, unpriced: 0, targetDates, assetCounts };

  const prices = await fetchHistoricalPrices(due.map((item) => quoteFor(item.selection, item.windowDays)));
  const entries = due.flatMap(({ selection, windowDays, targetDate, key }) => {
    const point = prices.get(key);
    if (!point || point.price <= 0) return [];
    const priceAt = point.price;
    const returnPct = ((priceAt - selection.priceAt) / selection.priceAt) * 100;
    const payload: OutcomePayload = {
      selectionId: selection.id,
      selectionDate: selection.date,
      windowDays,
      evaluationDate: point.date,
      selectedPrice: selection.priceAt,
      returnPct,
      asset: selection.subject.asset,
      signalTypes: selection.payload.signalTypes,
      ...(selection.payload.scoreBand ? { scoreBand: selection.payload.scoreBand } : {}),
      ...(typeof selection.payload.companyScore === "number" ? { companyScore: selection.payload.companyScore } : {}),
    };
    return [{
      date: today,
      subject: selection.subject,
      kind: "outcome" as const,
      payload: payload as unknown as Record<string, unknown>,
      priceAt,
      actor: "engine" as const,
      idempotencyKey: ledgerKey("outcome", selection.id, windowDays),
    }];
  });
  const appended = await appendJudgmentLedger(entries);
  return { due: due.length, priced: entries.length, appended, unpriced: due.length - entries.length, targetDates, assetCounts };
}

function metric(values: readonly number[]): TrackMetric {
  if (values.length === 0) return { n: 0, winRate: null, medianReturn: null };
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return {
    n: values.length,
    winRate: Math.round((values.filter((value) => value > 0).length / values.length) * 1_000) / 10,
    medianReturn: Math.round(median * 100) / 100,
  };
}

function grouped(outcomes: readonly OutcomePayload[], keyOf: (outcome: OutcomePayload) => readonly string[]): Record<string, TrackMetric> {
  const groups = new Map<string, number[]>();
  for (const outcome of outcomes) {
    for (const key of keyOf(outcome)) {
      const values = groups.get(key) ?? [];
      values.push(outcome.returnPct);
      groups.set(key, values);
    }
  }
  return Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => [key, metric(values)]));
}

export async function readTrackRecord(): Promise<TrackRecordResponse> {
  const rows = await prisma.judgmentLedger.findMany({
    where: { kind: "outcome", actor: "engine" },
    select: { payload: true },
    orderBy: { ts: "asc" },
  });
  const outcomes = rows.flatMap((row) => {
    const value = asOutcome(row.payload);
    return value ? [value] : [];
  });
  return buildTrackRecord(outcomes);
}

export function buildTrackRecord(outcomes: readonly OutcomePayload[], generatedAt = new Date().toISOString()): TrackRecordResponse {
  const windows = TRACK_WINDOWS.map((days): TrackWindowResult => {
    const values = outcomes.filter((outcome) => outcome.windowDays === days);
    return {
      days,
      overall: metric(values.map((outcome) => outcome.returnPct)),
      byAsset: grouped(values, (outcome) => [outcome.asset]),
      bySignal: grouped(values, (outcome) => outcome.signalTypes),
      byScoreBand: grouped(values, (outcome) => outcome.scoreBand ? [outcome.scoreBand] : []),
    };
  });
  return {
    generatedAt,
    methodology: "all-final-selections-fixed-windows",
    windows,
    signalHistory30: windows.find((window) => window.days === 30)?.bySignal ?? {},
  };
}
