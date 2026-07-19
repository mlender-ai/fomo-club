import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  SIGNAL_TAXONOMY_VERSION,
  inferStandardSignalTypes,
  normalizeSignalTypeCodes,
  type CardVerdict,
  type CompanyScoreResult,
  type SignalTypeCode,
  type WyckoffAnalysis,
} from "@fomo/core";
import { prisma } from "./prisma";
import { kstDate } from "./fomo";
import { parsePriceText } from "./quote-prices";
import type { Daily30AssetClass, Daily30Response } from "./daily-30";
import type { DiscoveryFrontSeed, DiscoveryStockPayload } from "./discovery-supply";

export const LEDGER_KINDS = ["signal", "verdict", "score", "selection", "user_action", "outcome"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];
export type LedgerAsset = Daily30AssetClass;
export type LedgerActor = "engine" | "committee" | `user:${string}`;

export interface LedgerSubject {
  asset: LedgerAsset;
  canonical: string;
  symbol?: string;
}

export interface LedgerAppendInput {
  date?: string;
  ts?: Date;
  subject: LedgerSubject;
  kind: LedgerKind;
  payload: Record<string, unknown>;
  priceAt: number;
  actor: LedgerActor;
  idempotencyKey: string;
}

export interface LedgerSelectionPayload {
  headline?: string;
  market?: string;
  country?: string;
  naverCode?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  signalTypes: SignalTypeCode[];
  quietScore?: number;
  signalScore?: number;
  hypePenalty?: number;
  companyScore?: number;
  scoreBand?: string;
  companyScoreLabel?: string;
  committeeRunId?: string;
  /** Immutable rendering snapshot. The public deck is rebuilt from the ledger, not a parallel picks store. */
  stock?: DiscoveryStockPayload;
  front?: DiscoveryFrontSeed;
  order?: number;
  metaCard?: Daily30Response["meta"]["cards"][number];
  response?: {
    asOf: string;
    confidence: Daily30Response["confidence"];
    source: string;
    targetCount: number;
    assetCounts: Daily30Response["meta"]["assetCounts"];
    repeatRatio?: number;
    debug?: Daily30Response["meta"]["debug"];
    committee?: Daily30Response["meta"]["committee"];
  };
}

export interface LedgerSelectionView {
  id: string;
  date: string;
  ts: Date;
  subject: LedgerSubject;
  priceAt: number;
  actor: LedgerActor;
  payload: LedgerSelectionPayload;
}

export interface LedgerUserHistoryItem {
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

const KIND_SET = new Set<string>(LEDGER_KINDS);
const ASSET_SET = new Set<string>(["kr-stock", "us-stock", "coin", "macro"] satisfies LedgerAsset[]);

function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizeDate(value: string | undefined, ts: Date): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(ts);
}

function assertAppendInput(input: LedgerAppendInput): void {
  if (!KIND_SET.has(input.kind)) throw new Error(`invalid ledger kind: ${input.kind}`);
  if (!ASSET_SET.has(input.subject.asset)) throw new Error(`invalid ledger asset: ${input.subject.asset}`);
  if (!input.subject.canonical.trim()) throw new Error("ledger canonical is required");
  if (!Number.isFinite(input.priceAt) || input.priceAt <= 0) throw new Error("ledger priceAt must be positive");
  if (!(input.actor === "engine" || input.actor === "committee" || input.actor.startsWith("user:"))) {
    throw new Error(`invalid ledger actor: ${input.actor}`);
  }
  if (!input.idempotencyKey.trim()) throw new Error("ledger idempotencyKey is required");
}

/** Stable and opaque idempotency key helper. The raw user/session identifier never enters an index. */
export function ledgerKey(...parts: Array<string | number | undefined>): string {
  return createHash("sha256").update(parts.map((part) => String(part ?? "")).join("\u001f")).digest("hex");
}

export function userLedgerActor(input: { userId?: string | null; sessionId?: string | null }): `user:${string}` | null {
  if (input.userId?.trim()) return `user:uid:${ledgerKey(input.userId.trim()).slice(0, 32)}`;
  if (input.sessionId?.trim()) return `user:session:${ledgerKey(input.sessionId.trim()).slice(0, 32)}`;
  return null;
}

/**
 * The only write primitive for JudgmentLedger. There is intentionally no update/delete API.
 * Retries are harmless because the partition-scoped idempotency key is unique.
 */
export async function appendJudgmentLedger(entries: readonly LedgerAppendInput[]): Promise<number> {
  if (entries.length === 0) return 0;
  for (const entry of entries) assertAppendInput(entry);
  const rows = entries.map((entry) => {
    const ts = entry.ts ?? new Date();
    return {
      date: normalizeDate(entry.date, ts),
      ts,
      asset: entry.subject.asset,
      canonical: entry.subject.canonical.trim(),
      symbol: entry.subject.symbol?.trim() || null,
      kind: entry.kind,
      payload: jsonSafe(entry.payload),
      priceAt: new Prisma.Decimal(entry.priceAt),
      actor: entry.actor,
      idempotencyKey: entry.idempotencyKey,
    };
  });
  const result = await prisma.judgmentLedger.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

export function assetForStock(stock: { country?: string; market?: string }): LedgerAsset {
  if (stock.market === "COIN" || stock.country === "GLOBAL") return "coin";
  return stock.country === "US" ? "us-stock" : "kr-stock";
}

export function scoreBand(score: number | null | undefined): string | undefined {
  if (typeof score !== "number" || !Number.isFinite(score)) return undefined;
  if (score >= 80) return "80-100";
  if (score >= 60) return "60-79";
  return "0-59";
}

export function inferSignalTypes(input: {
  headline?: string;
  reason?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  axisSignals?: Array<{ axis?: string; fired?: boolean }>;
  verdict?: CardVerdict;
  signals?: DiscoveryFrontSeed["signals"];
  wyckoff?: WyckoffAnalysis;
  companyScore?: number;
}): SignalTypeCode[] {
  return inferStandardSignalTypes(input);
}

function cleanScore(score: CompanyScoreResult | undefined): Record<string, unknown> | null {
  if (!score || typeof score.score !== "number") return null;
  return {
    score: score.score,
    label: score.label,
    interpretation: score.interpretation,
    axes: score.axes,
    availableAxisCount: score.availableAxisCount,
    omittedAxes: score.omittedAxes,
    ...(score.asOf ? { asOf: score.asOf } : {}),
  };
}

/** Build one immutable bundle per card. Candidate pools omit selection; published decks include it. */
export function buildDaily30LedgerEntries(
  response: Daily30Response,
  actor?: "engine" | "committee",
  options: { includeSelection?: boolean; date?: string } = {}
): LedgerAppendInput[] {
  const date = options.date ?? kstDate();
  const resolvedActor = actor ?? (response.meta.committee ? "committee" : "engine");
  const entries: LedgerAppendInput[] = [];
  response.stocks.forEach((stock, index) => {
    const front = response.fronts[stock.canonical];
    const priceAt = parsePriceText(front?.priceText);
    if (!priceAt) {
      console.warn("[judgment-ledger] selection skipped without price", stock.canonical);
      return;
    }
    const asset = assetForStock(stock);
    const subject: LedgerSubject = {
      asset,
      canonical: stock.canonical,
      ...(stock.symbol || stock.naverCode ? { symbol: stock.symbol ?? stock.naverCode } : {}),
    };
    const meta = response.meta.cards[index];
    const signals = inferSignalTypes({
      ...(stock.headline ? { headline: stock.headline } : {}),
      ...(stock.reason ?? stock.whyShown ? { reason: stock.reason ?? stock.whyShown } : {}),
      ...(stock.sourceLabel ? { sourceLabel: stock.sourceLabel } : {}),
      ...(stock.sourceUrl ? { sourceUrl: stock.sourceUrl } : {}),
      ...(front?.axisSignals ? { axisSignals: front.axisSignals } : {}),
      ...(front?.verdict ? { verdict: front.verdict } : {}),
      ...(front?.signals ? { signals: front.signals } : {}),
      ...(front?.wyckoff ? { wyckoff: front.wyckoff } : {}),
      ...(typeof front?.companyScore?.score === "number" ? { companyScore: front.companyScore.score } : {}),
    });
    const score = cleanScore(front?.companyScore);
    const baseKey = `${date}:${resolvedActor}:${asset}:${stock.symbol ?? stock.naverCode ?? stock.canonical}`;
    entries.push({
      date,
      subject,
      kind: "signal",
      payload: {
        taxonomyVersion: SIGNAL_TAXONOMY_VERSION,
        signalTypes: signals,
        headline: stock.headline ?? stock.reason ?? stock.whyShown ?? "",
        ...(stock.sourceLabel ? { sourceLabel: stock.sourceLabel } : {}),
        ...(stock.sourceUrl ? { sourceUrl: stock.sourceUrl } : {}),
        axisSignals: front?.axisSignals?.filter((item) => item.fired) ?? [],
      },
      priceAt,
      actor: resolvedActor,
      idempotencyKey: ledgerKey(baseKey, "signal"),
    });
    if (front?.verdict) {
      entries.push({
        date,
        subject,
        kind: "verdict",
        payload: { ...front.verdict },
        priceAt,
        actor: resolvedActor,
        idempotencyKey: ledgerKey(baseKey, "verdict"),
      });
    }
    if (score) {
      entries.push({
        date,
        subject,
        kind: "score",
        payload: score,
        priceAt,
        actor: resolvedActor,
        idempotencyKey: ledgerKey(baseKey, "score"),
      });
    }
    const band = scoreBand(front?.companyScore?.score);
    const selectionPayload: LedgerSelectionPayload = {
      ...(stock.headline ? { headline: stock.headline } : {}),
      ...(stock.market ? { market: stock.market } : {}),
      ...(stock.country ? { country: stock.country } : {}),
      ...(stock.naverCode ? { naverCode: stock.naverCode } : {}),
      ...(stock.sourceLabel ? { sourceLabel: stock.sourceLabel } : {}),
      ...(stock.sourceUrl ? { sourceUrl: stock.sourceUrl } : {}),
      signalTypes: signals,
      ...(meta ? { quietScore: meta.quietScore, signalScore: meta.signalScore, hypePenalty: meta.hypePenalty } : {}),
      ...(front?.companyScore?.score != null ? { companyScore: front.companyScore.score } : {}),
      ...(band ? { scoreBand: band } : {}),
      ...(front?.companyScore?.label ? { companyScoreLabel: front.companyScore.label } : {}),
      ...(response.meta.committee?.runId ? { committeeRunId: response.meta.committee.runId } : {}),
      stock,
      ...(front ? { front } : {}),
      order: index,
      ...(meta ? { metaCard: meta } : {}),
      response: {
        asOf: response.asOf,
        confidence: response.confidence,
        source: response.source,
        targetCount: response.meta.targetCount,
        assetCounts: response.meta.assetCounts,
        ...(response.meta.repeatRatio != null ? { repeatRatio: response.meta.repeatRatio } : {}),
        ...(response.meta.debug ? { debug: response.meta.debug } : {}),
        ...(response.meta.committee ? { committee: response.meta.committee } : {}),
      },
    };
    if (options.includeSelection !== false) {
      entries.push({
        date,
        subject,
        kind: "selection",
        payload: selectionPayload as unknown as Record<string, unknown>,
        priceAt,
        actor: resolvedActor,
        idempotencyKey: ledgerKey(baseKey, "selection"),
      });
    }
  });
  return entries;
}

/** Persist one immutable bundle per selected card: signal, verdict, score and final selection. */
export async function writeDaily30Ledger(
  response: Daily30Response,
  actor?: "engine" | "committee",
  options: { includeSelection?: boolean; date?: string } = {}
): Promise<number> {
  return appendJudgmentLedger(buildDaily30LedgerEntries(response, actor, options));
}

function asSelection(row: {
  id: string;
  date: string;
  ts: Date;
  asset: string;
  canonical: string;
  symbol: string | null;
  priceAt: Prisma.Decimal;
  actor: string;
  payload: Prisma.JsonValue;
}): LedgerSelectionView | null {
  if (!ASSET_SET.has(row.asset) || !(row.actor === "engine" || row.actor === "committee")) return null;
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? (row.payload as unknown as LedgerSelectionPayload)
    : null;
  if (!payload) return null;
  const storedSignalTypes = normalizeSignalTypeCodes(Array.isArray(payload.signalTypes) ? payload.signalTypes : []);
  const projectedCompanyScore = payload.companyScore ?? payload.front?.companyScore?.score;
  const projectedSignalTypes = storedSignalTypes.length > 0
    ? storedSignalTypes
    : inferStandardSignalTypes({
        ...(payload.stock?.headline ?? payload.headline ? { headline: payload.stock?.headline ?? payload.headline } : {}),
        ...(payload.stock?.reason ?? payload.stock?.whyShown ? { reason: payload.stock?.reason ?? payload.stock?.whyShown } : {}),
        ...(payload.stock?.sourceLabel ?? payload.sourceLabel ? { sourceLabel: payload.stock?.sourceLabel ?? payload.sourceLabel } : {}),
        ...(payload.stock?.sourceUrl ?? payload.sourceUrl ? { sourceUrl: payload.stock?.sourceUrl ?? payload.sourceUrl } : {}),
        ...(payload.front?.signals ? { signals: payload.front.signals } : {}),
        ...(payload.front?.wyckoff ? { wyckoff: payload.front.wyckoff } : {}),
        ...(typeof projectedCompanyScore === "number" ? { companyScore: projectedCompanyScore } : {}),
      });
  return {
    id: row.id,
    date: row.date,
    ts: row.ts,
    subject: {
      asset: row.asset as LedgerAsset,
      canonical: row.canonical,
      ...(row.symbol ? { symbol: row.symbol } : {}),
    },
    priceAt: row.priceAt.toNumber(),
    actor: row.actor as "engine" | "committee",
    payload: { ...payload, signalTypes: projectedSignalTypes },
  };
}

/** One final pick per date/subject. Committee approval supersedes the engine emergency selection. */
export function finalSelections(rows: readonly LedgerSelectionView[]): LedgerSelectionView[] {
  const selected = new Map<string, LedgerSelectionView>();
  for (const row of rows) {
    const key = `${row.date}\u001f${row.subject.asset}\u001f${row.subject.canonical}`;
    const current = selected.get(key);
    const actorWins = current?.actor === "engine" && row.actor === "committee";
    const sameActorIsNewer = current?.actor === row.actor && row.ts > current.ts;
    if (!current || actorWins || sameActorIsNewer) {
      selected.set(key, row);
    }
  }
  return [...selected.values()].sort((a, b) => b.date.localeCompare(a.date) || b.ts.getTime() - a.ts.getTime());
}

export async function readLedgerSelections(options: {
  date?: string;
  beforeDate?: string;
  fromDate?: string;
  take?: number;
} = {}): Promise<LedgerSelectionView[]> {
  const rows = await prisma.judgmentLedger.findMany({
    where: {
      kind: "selection",
      actor: { in: ["engine", "committee"] },
      ...(options.date
        ? { date: options.date }
        : options.beforeDate || options.fromDate
        ? {
            date: {
              ...(options.beforeDate ? { lt: options.beforeDate } : {}),
              ...(options.fromDate ? { gte: options.fromDate } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ date: "desc" }, { ts: "desc" }],
    take: Math.max(1, Math.min(options.take ?? 2_000, 10_000)),
  });
  return finalSelections(rows.flatMap((row) => {
    const parsed = asSelection(row);
    return parsed ? [parsed] : [];
  }));
}

/** Rehydrate the immutable daily deck projection from final selection entries. */
export async function readDaily30ResponseFromLedger(options: {
  date?: string;
  fromDate?: string;
} = {}): Promise<Daily30Response | null> {
  const rows = await readLedgerSelections({
    ...(options.date ? { date: options.date } : {}),
    ...(options.fromDate ? { fromDate: options.fromDate } : {}),
    take: 5_000,
  });
  const latestDate = options.date ?? rows[0]?.date;
  if (!latestDate) return null;
  return daily30ResponseFromSelections(rows.filter((row) => row.date === latestDate));
}

export function daily30ResponseFromSelections(rows: readonly LedgerSelectionView[]): Daily30Response | null {
  const selections = rows
    .filter((row) => row.payload.stock && row.payload.front)
    .sort((a, b) => (a.payload.order ?? Number.MAX_SAFE_INTEGER) - (b.payload.order ?? Number.MAX_SAFE_INTEGER));
  if (selections.length === 0) return null;

  const responseInfo = selections.find((row) => row.payload.response)?.payload.response;
  if (!responseInfo) return null;
  const stocks = selections.map((row) => row.payload.stock!);
  const fronts = Object.fromEntries(selections.map((row) => [row.subject.canonical, row.payload.front!]));
  const cards = stocks.map((stock) => ({ kind: "stock" as const, ...stock }));
  const metaCards = selections.flatMap((row) => row.payload.metaCard ? [row.payload.metaCard] : []);
  const assetCounts = metaCards.reduce<Daily30Response["meta"]["assetCounts"]>(
    (counts, card) => ({ ...counts, [card.assetClass]: counts[card.assetClass] + 1 }),
    { "kr-stock": 0, "us-stock": 0, coin: 0, macro: 0 }
  );
  return {
    asOf: responseInfo.asOf,
    country: "all",
    stocks,
    cards,
    fronts,
    confidence: responseInfo.confidence,
    source: responseInfo.source,
    meta: {
      targetCount: responseInfo.targetCount,
      cards: metaCards,
      assetCounts: metaCards.length === selections.length ? assetCounts : responseInfo.assetCounts,
      ...(responseInfo.repeatRatio != null ? { repeatRatio: responseInfo.repeatRatio } : {}),
      ...(responseInfo.debug ? { debug: responseInfo.debug } : {}),
      ...(responseInfo.committee ? { committee: responseInfo.committee } : {}),
    },
  };
}

export async function readLatestSelectionSnapshotBefore(today: string): Promise<LedgerSelectionView[]> {
  const rows = await readLedgerSelections({ beforeDate: today, take: 500 });
  const latestDate = rows[0]?.date;
  return latestDate ? rows.filter((row) => row.date === latestDate) : [];
}

export async function appendUserAction(input: {
  actor: `user:${string}`;
  action: "seen" | "pass" | "star" | "depth";
  occurredAt?: Date;
  subject: LedgerSubject;
  priceAt: number;
  details?: Record<string, unknown>;
  imported?: boolean;
}): Promise<number> {
  const ts = input.occurredAt ?? new Date();
  const date = normalizeDate(undefined, ts);
  if (input.action === "seen") {
    const existing = await prisma.judgmentLedger.findMany({
      where: { actor: input.actor, canonical: input.subject.canonical, kind: "user_action" },
      orderBy: { ts: "asc" },
      select: { payload: true },
      take: 100,
    });
    const alreadySeen = existing.some((row) =>
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) &&
      (row.payload as Record<string, unknown>).action === "seen"
    );
    if (alreadySeen) return 0;
  }
  return appendJudgmentLedger([{
    date,
    ts,
    subject: input.subject,
    kind: "user_action",
    payload: { action: input.action, ...(input.details ?? {}), ...(input.imported ? { imported: true } : {}) },
    priceAt: input.priceAt,
    actor: input.actor,
    idempotencyKey: ledgerKey(input.actor, input.subject.canonical, input.action, ts.toISOString()),
  }]);
}

export async function readUserHistory(actors: readonly `user:${string}`[], take = 1_000): Promise<LedgerUserHistoryItem[]> {
  if (actors.length === 0) return [];
  const rows = await prisma.judgmentLedger.findMany({
    where: { kind: "user_action", actor: { in: [...actors] } },
    orderBy: { ts: "asc" },
    take: Math.max(1, Math.min(take, 5_000)),
  });
  const grouped = new Map<string, LedgerUserHistoryItem>();
  for (const row of rows) {
    if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) continue;
    const payload = row.payload as Record<string, unknown>;
    const action = payload.action;
    if (!(action === "seen" || action === "pass" || action === "star" || action === "depth")) continue;
    const current = grouped.get(row.canonical);
    const base: LedgerUserHistoryItem = current ?? {
      stock: row.canonical,
      firstSeenAt: row.ts.getTime(),
      firstSeenPrice: row.priceAt.toNumber(),
    };
    if (!current && action !== "seen") {
      base.firstSeenAt = row.ts.getTime();
      base.firstSeenPrice = row.priceAt.toNumber();
    }
    for (const field of ["firstSeenPriceText", "companyScoreLabel", "naverCode", "market", "country", "sector", "reason"] as const) {
      if (typeof payload[field] === "string" && payload[field]) (base as unknown as Record<string, unknown>)[field] = payload[field];
    }
    if (typeof payload.companyScore === "number") base.companyScore = payload.companyScore;
    if (row.symbol) base.symbol = row.symbol;
    if (action === "pass" || action === "star") {
      base.action = action === "pass" ? "skip" : "save";
      base.actionAt = row.ts.getTime();
    }
    grouped.set(row.canonical, base);
  }
  return [...grouped.values()].sort((a, b) => b.firstSeenAt - a.firstSeenAt);
}

export interface LedgerTimelineEntry {
  id: string;
  date: string;
  ts: string;
  kind: LedgerKind;
  actor: string;
  priceAt: number;
  payload: Record<string, unknown>;
}

export function projectTimelineSignalTypes(
  payload: Record<string, unknown>,
  selectionTypes: readonly SignalTypeCode[] = []
): SignalTypeCode[] {
  const stored = normalizeSignalTypeCodes(Array.isArray(payload.signalTypes) ? payload.signalTypes : []);
  const inferred = inferStandardSignalTypes({
    ...(typeof payload.headline === "string" ? { headline: payload.headline } : {}),
    ...(typeof payload.sourceLabel === "string" ? { sourceLabel: payload.sourceLabel } : {}),
    ...(typeof payload.sourceUrl === "string" ? { sourceUrl: payload.sourceUrl } : {}),
  });
  return normalizeSignalTypeCodes([...stored, ...inferred, ...selectionTypes]);
}

export async function readSubjectTimeline(
  canonical: string,
  take = 80,
  userActors: readonly `user:${string}`[] = []
): Promise<LedgerTimelineEntry[]> {
  const rows = await prisma.judgmentLedger.findMany({
    where: {
      canonical,
      actor: { in: ["engine", "committee", ...userActors] },
    },
    orderBy: { ts: "desc" },
    take: Math.max(1, Math.min(take, 200)),
  });
  const selectionTypes = new Map<string, SignalTypeCode[]>();
  for (const row of rows) {
    if (row.kind !== "selection") continue;
    const selection = asSelection(row);
    if (!selection) continue;
    selectionTypes.set(`${row.date}\u001f${row.actor}`, selection.payload.signalTypes);
    if (!selectionTypes.has(row.date)) selectionTypes.set(row.date, selection.payload.signalTypes);
  }
  return rows.map((row) => {
    const payload = row.payload as Record<string, unknown>;
    const projected = row.kind === "signal"
      ? projectTimelineSignalTypes(
          payload,
          selectionTypes.get(`${row.date}\u001f${row.actor}`) ?? selectionTypes.get(row.date) ?? []
        )
      : [];
    return {
      id: row.id,
      date: row.date,
      ts: row.ts.toISOString(),
      kind: row.kind as LedgerKind,
      actor: row.actor,
      priceAt: row.priceAt.toNumber(),
      payload: row.kind === "signal"
        ? { ...payload, taxonomyVersion: SIGNAL_TAXONOMY_VERSION, signalTypes: projected }
        : payload,
    };
  });
}
