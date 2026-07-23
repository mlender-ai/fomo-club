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
export type LedgerActor = "engine" | "committee" | "backfill" | `user:${string}`;

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
  /** 발행 계열 구분자(DDL 없이 kind=selection 재사용). "quiet"=조용한 픽(WO-G1A). 없으면 daily-30 선정. */
  pickType?: string;
  /** 조용한 픽 신호 페이로드(성적표 신호별 근거). */
  signal?: Record<string, unknown>;
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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "_ledger")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
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
  if (!(input.actor === "engine" || input.actor === "committee" || input.actor === "backfill" || input.actor.startsWith("user:"))) {
    throw new Error(`invalid ledger actor: ${input.actor}`);
  }
  if (!input.idempotencyKey.trim()) throw new Error("ledger idempotencyKey is required");
}

/** Stable and opaque idempotency key helper. The raw user/session identifier never enters an index. */
export function ledgerKey(...parts: Array<string | number | undefined>): string {
  return createHash("sha256").update(parts.map((part) => String(part ?? "")).join("\u001f")).digest("hex");
}

/** Actor와 재시도 시각을 제외한 원장 내용 자체의 멱등 키. */
export function ledgerContentKey(input: Pick<LedgerAppendInput, "date" | "ts" | "subject" | "kind" | "payload">): string {
  const ts = input.ts ?? new Date();
  return ledgerKey(
    normalizeDate(input.date, ts),
    input.subject.asset,
    input.subject.canonical.trim(),
    input.kind,
    stableJson(input.payload)
  );
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
  const normalized = entries.map((entry) => {
    const ts = entry.ts ?? new Date();
    return { entry, ts, date: normalizeDate(entry.date, ts), contentKey: ledgerContentKey({ ...entry, ts }) };
  });
  const scoreLookups = normalized.filter(({ entry }) => entry.kind === "score");
  const previousScores = scoreLookups.length > 0
    ? await prisma.judgmentLedger.findMany({
        where: {
          kind: "score",
          OR: scoreLookups.map(({ entry, date }) => ({
            date,
            asset: entry.subject.asset,
            canonical: entry.subject.canonical.trim(),
          })),
        },
        orderBy: { ts: "desc" },
        select: { id: true, date: true, asset: true, canonical: true, payload: true },
      })
    : [];
  const latestScore = new Map<string, (typeof previousScores)[number]>();
  for (const row of previousScores) {
    const key = `${row.date}\u001f${row.asset}\u001f${row.canonical}`;
    if (!latestScore.has(key)) latestScore.set(key, row);
  }
  const rows = normalized.map(({ entry, ts, date, contentKey }) => {
    let payload: Record<string, unknown> = entry.payload;
    if (entry.kind === "score") {
      const previous = latestScore.get(`${date}\u001f${entry.subject.asset}\u001f${entry.subject.canonical.trim()}`);
      if (previous && stableJson(previous.payload) !== stableJson(entry.payload)) {
        payload = {
          ...entry.payload,
          _ledger: { supersedes: previous.id, reason: "same-day-recalculation" },
        };
      }
    }
    return {
      date,
      ts,
      asset: entry.subject.asset,
      canonical: entry.subject.canonical.trim(),
      symbol: entry.subject.symbol?.trim() || null,
      kind: entry.kind,
      payload: jsonSafe(payload),
      priceAt: new Prisma.Decimal(entry.priceAt),
      actor: entry.actor,
      idempotencyKey: contentKey,
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
  quietMoney?: DiscoveryFrontSeed["quietMoney"];
}): SignalTypeCode[] {
  const { quietMoney, ...rest } = input;
  return inferStandardSignalTypes({ ...rest, ...(quietMoney ? { quietMoney } : {}) });
}

function cleanScore(score: CompanyScoreResult | undefined): Record<string, unknown> | null {
  if (!score || typeof score.score !== "number") return null;
  return {
    score: score.score,
    status: score.status,
    label: score.label,
    interpretation: score.interpretation,
    axes: score.axes,
    axisStates: score.axisStates,
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
      ...(front?.quietMoney ? { quietMoney: front.quietMoney } : {}),
      ...(typeof front?.score?.score === "number" ? { companyScore: front.score.score } : {}),
    });
    const score = cleanScore(front?.score);
    const baseKey = `${date}:${asset}:${stock.symbol ?? stock.naverCode ?? stock.canonical}`;
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
        ...(front?.quietMoney?.cluster ? { quietMoneyCluster: front.quietMoney.cluster } : {}),
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
    const band = scoreBand(front?.score?.score);
    const selectionPayload: LedgerSelectionPayload = {
      ...(stock.headline ? { headline: stock.headline } : {}),
      ...(stock.market ? { market: stock.market } : {}),
      ...(stock.country ? { country: stock.country } : {}),
      ...(stock.naverCode ? { naverCode: stock.naverCode } : {}),
      ...(stock.sourceLabel ? { sourceLabel: stock.sourceLabel } : {}),
      ...(stock.sourceUrl ? { sourceUrl: stock.sourceUrl } : {}),
      signalTypes: signals,
      ...(meta ? { quietScore: meta.quietScore, signalScore: meta.signalScore, hypePenalty: meta.hypePenalty } : {}),
      ...(front?.score?.score != null ? { companyScore: front.score.score } : {}),
      ...(band ? { scoreBand: band } : {}),
      ...(front?.score?.label ? { companyScoreLabel: front.score.label } : {}),
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
  if (!ASSET_SET.has(row.asset) || !(row.actor === "engine" || row.actor === "committee" || row.actor === "backfill")) return null;
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? (row.payload as unknown as LedgerSelectionPayload)
    : null;
  if (!payload) return null;
  const storedSignalTypes = normalizeSignalTypeCodes(Array.isArray(payload.signalTypes) ? payload.signalTypes : []);
  const projectedCompanyScore = payload.companyScore ?? payload.front?.score?.score;
  const projectedSignalTypes = storedSignalTypes.length > 0
    ? storedSignalTypes
    : inferStandardSignalTypes({
        ...(payload.stock?.headline ?? payload.headline ? { headline: payload.stock?.headline ?? payload.headline } : {}),
        ...(payload.stock?.reason ?? payload.stock?.whyShown ? { reason: payload.stock?.reason ?? payload.stock?.whyShown } : {}),
        ...(payload.stock?.sourceLabel ?? payload.sourceLabel ? { sourceLabel: payload.stock?.sourceLabel ?? payload.sourceLabel } : {}),
        ...(payload.stock?.sourceUrl ?? payload.sourceUrl ? { sourceUrl: payload.stock?.sourceUrl ?? payload.sourceUrl } : {}),
        ...(payload.front?.signals ? { signals: payload.front.signals } : {}),
        ...(payload.front?.wyckoff ? { wyckoff: payload.front.wyckoff } : {}),
        ...(payload.front?.quietMoney ? { quietMoney: payload.front.quietMoney } : {}),
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
    actor: row.actor as "engine" | "committee" | "backfill",
    payload: { ...payload, signalTypes: projectedSignalTypes },
  };
}

const selectionActorPriority = (actor: LedgerActor): number =>
  actor === "committee" ? 3 : actor === "engine" ? 2 : actor === "backfill" ? 1 : 0;

/** One final pick per date/subject. Live publication always supersedes an imported snapshot. */
export function finalSelections(rows: readonly LedgerSelectionView[]): LedgerSelectionView[] {
  const selected = new Map<string, LedgerSelectionView>();
  for (const row of rows) {
    // pickType key inclusion: quiet pick and daily-30 selection graded separately even if same stock/date
    const key = `${row.date}\u001f${row.subject.asset}\u001f${row.subject.canonical}\u001f${row.payload.pickType ?? ""}`;
    const current = selected.get(key);
    const actorWins = current ? selectionActorPriority(row.actor) > selectionActorPriority(current.actor) : false;
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
      actor: { in: ["engine", "committee", "backfill"] },
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

function timelineScore(entry: LedgerTimelineEntry): number | undefined {
  if (entry.kind !== "score") return undefined;
  return typeof entry.payload.score === "number" ? entry.payload.score : undefined;
}

function selectionScore(entry: LedgerTimelineEntry | undefined): number | undefined {
  if (!entry || entry.kind !== "selection") return undefined;
  if (typeof entry.payload.companyScore === "number") return entry.payload.companyScore;
  const front = entry.payload.front;
  if (!front || typeof front !== "object" || Array.isArray(front)) return undefined;
  const score = (front as Record<string, unknown>).score;
  return score && typeof score === "object" && !Array.isArray(score) && typeof (score as Record<string, unknown>).score === "number"
    ? (score as Record<string, number>).score
    : undefined;
}

function timelinePriority(entry: LedgerTimelineEntry, preferredActor?: string): number {
  const preferred = preferredActor && entry.actor === preferredActor ? 100 : 0;
  const actor = entry.actor === "committee" ? 30 : entry.actor === "engine" ? 20 : entry.actor === "backfill" ? 10 : 0;
  return preferred + actor;
}

/** Append-only 원장에서 화면에 보여줄 당일 최종 상태만 투영한다. 원본 행은 삭제하지 않는다. */
export function projectFinalTimeline(entries: readonly LedgerTimelineEntry[]): LedgerTimelineEntry[] {
  const exact = new Map<string, LedgerTimelineEntry>();
  for (const entry of entries) {
    const key = `${entry.date}\u001f${entry.kind}\u001f${stableJson(entry.payload)}`;
    const current = exact.get(key);
    const priority = timelinePriority(entry);
    const currentPriority = current ? timelinePriority(current) : -1;
    if (!current || priority > currentPriority || (priority === currentPriority && entry.ts > current.ts)) exact.set(key, entry);
  }
  const rows = [...exact.values()];
  const byDate = new Map<string, LedgerTimelineEntry[]>();
  for (const row of rows) byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
  const projected: LedgerTimelineEntry[] = [];
  for (const dateRows of byDate.values()) {
    const selections = dateRows.filter((row) => row.kind === "selection");
    const finalSelection = selections.sort((a, b) =>
      timelinePriority(b) - timelinePriority(a) || b.ts.localeCompare(a.ts)
    )[0];
    const preferredActor = finalSelection?.actor;
    const pickFinal = (candidates: LedgerTimelineEntry[]) => candidates.sort((a, b) =>
      timelinePriority(b, preferredActor) - timelinePriority(a, preferredActor) || b.ts.localeCompare(a.ts)
    )[0];
    if (finalSelection) projected.push(finalSelection);
    for (const kind of ["signal", "verdict"] as const) {
      const row = pickFinal(dateRows.filter((item) => item.kind === kind));
      if (row) projected.push(row);
    }
    const scores = dateRows.filter((row) => row.kind === "score");
    const targetScore = selectionScore(finalSelection);
    const matching = typeof targetScore === "number" ? scores.filter((row) => timelineScore(row) === targetScore) : [];
    const score = pickFinal(matching.length > 0 ? matching : scores);
    if (score) projected.push(score);
    const passthrough = new Map<string, LedgerTimelineEntry>();
    for (const row of dateRows.filter((item) => item.kind === "user_action" || item.kind === "outcome")) {
      const discriminator = row.kind === "user_action" ? row.payload.action : row.payload.windowDays;
      const key = `${row.kind}\u001f${row.actor}\u001f${String(discriminator ?? "")}\u001f${stableJson(row.payload)}`;
      const current = passthrough.get(key);
      if (!current || row.ts > current.ts) passthrough.set(key, row);
    }
    projected.push(...passthrough.values());
  }
  return projected.sort((a, b) => b.ts.localeCompare(a.ts));
}

export async function readSubjectTimeline(
  canonical: string,
  take = 80,
  userActors: readonly `user:${string}`[] = []
): Promise<LedgerTimelineEntry[]> {
  const boundedTake = Math.max(1, Math.min(take, 200));
  const publicRows = await prisma.judgmentLedger.findMany({
    where: {
      canonical,
      actor: { in: ["engine", "committee", "backfill"] },
    },
    orderBy: { ts: "desc" },
    take: boundedTake,
  });
  let userRows: typeof publicRows = [];
  if (userActors.length > 0) {
    try {
      const batches = await Promise.all(
        [...new Set(userActors)].map((actor) =>
          prisma.judgmentLedger.findMany({
            where: { canonical, actor },
            orderBy: { ts: "desc" },
            take: boundedTake,
          })
        )
      );
      userRows = batches.flat();
    } catch (error) {
      // A user-scoped lookup must never hide the immutable public timeline.
      console.warn("[judgment-ledger] user timeline read failed", error);
    }
  }
  const rows = [...publicRows, ...userRows]
    .sort((a, b) => b.ts.getTime() - a.ts.getTime())
    .slice(0, boundedTake);
  const selectionTypes = new Map<string, SignalTypeCode[]>();
  for (const row of rows) {
    if (row.kind !== "selection") continue;
    const selection = asSelection(row);
    if (!selection) continue;
    selectionTypes.set(`${row.date}\u001f${row.actor}`, selection.payload.signalTypes);
    if (!selectionTypes.has(row.date)) selectionTypes.set(row.date, selection.payload.signalTypes);
  }
  const timeline = rows.map((row) => {
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
  return projectFinalTimeline(timeline).slice(0, Math.max(1, Math.min(take, 200)));
}
