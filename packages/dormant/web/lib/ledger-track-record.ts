import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import {
  SIGNAL_RESUME_MIN_SAMPLE,
  SIGNAL_TAXONOMY_VERSION,
  SIGNAL_TYPE_CODES,
  normalizeSignalTypeCodes,
  type SignalTypeCode,
} from "@fomo/core";
import { appendJudgmentLedger, ledgerKey, readLedgerSelections, type LedgerSelectionView } from "./judgment-ledger";
import { cacheVersion, kstDate } from "./fomo";
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
  signalTaxonomyVersion: typeof SIGNAL_TAXONOMY_VERSION;
  signalMinimumSample: typeof SIGNAL_RESUME_MIN_SAMPLE;
  windows: TrackWindowResult[];
  signalHistory30: Record<SignalTypeCode, TrackMetric>;
}

export interface OutcomePayload {
  selectionId: string;
  selectionDate: string;
  windowDays: TrackWindow;
  evaluationDate: string;
  selectedPrice: number;
  returnPct: number;
  asset: string;
  signalTypes: SignalTypeCode[];
  scoreBand?: string;
  companyScore?: number;
  /** 발행 계열 구분자(WO-G1A). "quiet"=조용한 픽. 없으면 daily-30 선정. 성적표 "전체 vs 조용한 픽만" 분리용. */
  pickType?: string;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function asOutcome(payload: Prisma.JsonValue): OutcomePayload | null {
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
    signalTypes: normalizeSignalTypeCodes(Array.isArray(value.signalTypes) ? value.signalTypes : []),
    ...(typeof value.scoreBand === "string" ? { scoreBand: value.scoreBand } : {}),
    ...(typeof value.companyScore === "number" ? { companyScore: value.companyScore } : {}),
    ...(typeof value.pickType === "string" ? { pickType: value.pickType } : {}),
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
      ...(selection.payload.pickType ? { pickType: selection.payload.pickType } : {}),
    };
    return [{
      date: today,
      subject: selection.subject,
      kind: "outcome" as const,
      payload: payload as unknown as Record<string, unknown>,
      priceAt,
      actor: selection.actor === "backfill" ? "backfill" as const : "engine" as const,
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

function publicSignalMetric(value: TrackMetric | undefined): TrackMetric {
  if (!value) return { n: 0, winRate: null, medianReturn: null };
  if (value.n < SIGNAL_RESUME_MIN_SAMPLE) return { n: value.n, winRate: null, medianReturn: null };
  return value;
}

function signalMetrics(outcomes: readonly OutcomePayload[]): Record<SignalTypeCode, TrackMetric> {
  const measured = grouped(outcomes, (outcome) => outcome.signalTypes);
  return Object.fromEntries(
    SIGNAL_TYPE_CODES.map((code) => [code, publicSignalMetric(measured[code])])
  ) as Record<SignalTypeCode, TrackMetric>;
}

/**
 * 성적표. options.pickType 로 발행 계열을 나눠 본다(WO-G1A):
 *   undefined → 전체 기록 · "quiet" → 조용한 픽만 · null → daily-30 선정만.
 */
export async function readTrackRecord(options: { pickType?: string | null } = {}): Promise<TrackRecordResponse> {
  const rows = await prisma.judgmentLedger.findMany({
    where: { kind: "outcome", actor: { in: ["engine", "backfill"] } },
    select: { payload: true },
    orderBy: { ts: "asc" },
  });
  const outcomes = rows.flatMap((row) => {
    const value = asOutcome(row.payload);
    return value ? [value] : [];
  });
  const filtered = options.pickType === undefined
    ? outcomes
    : outcomes.filter((o) => (options.pickType === null ? !o.pickType : o.pickType === options.pickType));
  return buildTrackRecord(filtered);
}

export function buildTrackRecord(outcomes: readonly OutcomePayload[], generatedAt = new Date().toISOString()): TrackRecordResponse {
  const windows = TRACK_WINDOWS.map((days): TrackWindowResult => {
    const values = outcomes.filter((outcome) => outcome.windowDays === days);
    return {
      days,
      overall: metric(values.map((outcome) => outcome.returnPct)),
      byAsset: grouped(values, (outcome) => [outcome.asset]),
      bySignal: signalMetrics(values),
      byScoreBand: grouped(values, (outcome) => outcome.scoreBand ? [outcome.scoreBand] : []),
    };
  });
  return {
    generatedAt,
    methodology: "all-final-selections-fixed-windows",
    signalTaxonomyVersion: SIGNAL_TAXONOMY_VERSION,
    signalMinimumSample: SIGNAL_RESUME_MIN_SAMPLE,
    windows,
    signalHistory30: (windows.find((window) => window.days === 30)?.bySignal ?? signalMetrics([])) as Record<SignalTypeCode, TrackMetric>,
  };
}

/** Vercel Data Cache projection; the append-only ledger remains the only persisted source. */
export async function getCachedTrackRecord(): Promise<TrackRecordResponse> {
  const load = unstable_cache(readTrackRecord, ["judgment-ledger-track-record", cacheVersion()], {
    revalidate: 60 * 60 * 24,
    tags: ["judgment-ledger"],
  });
  return load();
}

// ── 성적표 픽 리스트(WO-G1C ②) — 최신순 픽별 당시가·수익률·당시 훅 ──────────────
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
  /** 그때 뭐라 했는지 박제된 훅(payload.headline). */
  hook?: string;
  pickType?: string;
  signalTypes: SignalTypeCode[];
  /** 7/30/90일 고정 창 수익률(도래·채점된 창만; 미도래는 null). */
  returns: Record<TrackWindow, ScorecardPickReturn | null>;
}

export interface ScorecardPicksResponse {
  generatedAt: string;
  picks: ScorecardPick[];
}

/** 최신 final selection 별로 당시가·훅·창별 수익률을 조립. 하락 포함(체리픽 없음). */
export async function readScorecardPicks(limit = 80): Promise<ScorecardPicksResponse> {
  const fromDate = addDays(kstDate(), -120);
  const [selections, outcomeRows] = await Promise.all([
    readLedgerSelections({ fromDate, take: 3_000 }),
    prisma.judgmentLedger.findMany({
      where: { kind: "outcome", actor: { in: ["engine", "backfill"] }, date: { gte: fromDate } },
      select: { payload: true },
      take: 30_000,
    }),
  ]);
  const bySelection = new Map<string, Map<TrackWindow, ScorecardPickReturn>>();
  for (const row of outcomeRows) {
    const outcome = asOutcome(row.payload);
    if (!outcome) continue;
    const windows = bySelection.get(outcome.selectionId) ?? new Map<TrackWindow, ScorecardPickReturn>();
    windows.set(outcome.windowDays, { returnPct: outcome.returnPct, evaluationDate: outcome.evaluationDate });
    bySelection.set(outcome.selectionId, windows);
  }
  const picks: ScorecardPick[] = selections.slice(0, limit).map((selection) => {
    const windows = bySelection.get(selection.id);
    return {
      canonical: selection.subject.canonical,
      ...(selection.subject.symbol ? { symbol: selection.subject.symbol } : {}),
      ...(selection.payload.naverCode ? { naverCode: selection.payload.naverCode } : {}),
      ...(selection.payload.market ? { market: selection.payload.market } : {}),
      ...(selection.payload.country ? { country: selection.payload.country } : {}),
      date: selection.date,
      priceAt: selection.priceAt,
      ...(selection.payload.headline ? { hook: selection.payload.headline } : {}),
      ...(selection.payload.pickType ? { pickType: selection.payload.pickType } : {}),
      signalTypes: selection.payload.signalTypes,
      returns: {
        7: windows?.get(7) ?? null,
        30: windows?.get(30) ?? null,
        90: windows?.get(90) ?? null,
      },
    };
  });
  return { generatedAt: new Date().toISOString(), picks };
}

export async function getCachedScorecardPicks(): Promise<ScorecardPicksResponse> {
  const load = unstable_cache(() => readScorecardPicks(80), ["judgment-ledger-scorecard-picks", cacheVersion()], {
    revalidate: 60 * 60,
    tags: ["judgment-ledger"],
  });
  return load();
}
