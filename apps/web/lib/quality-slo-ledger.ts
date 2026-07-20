import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { inferStandardSignalTypes } from "@fomo/core";
import type { Daily30Response } from "./daily-30";
import type { CommitteeRunReport } from "./expert-review-store";
import {
  readCommitteeRunReports,
  readPublishedCommitteeSnapshotHistory,
} from "./expert-review-store";
import {
  daily30ResponseFromSelections,
  readDaily30ResponseFromLedger,
  readLatestSelectionSnapshotBefore,
} from "./judgment-ledger";
import { parsePriceText } from "./quote-prices";
import { prisma } from "./prisma";

export const QUALITY_SLO_VERSION = "m3.v1" as const;
export const QUALITY_SLO_TARGETS = {
  causeExplanationRate: 0.9,
  marketDataRate: 1,
  verdictUniqueTextMin: 10,
  maxSentenceRepeat: 3,
  repeatRatioMax: 0.5,
  usStockMin: 8,
  coinMin: 3,
  coinMax: 5,
  depthCoverageRate: 0.9,
  committeePublished: true,
} as const;

export type QualitySloKey =
  | "cause-explanation"
  | "market-data"
  | "verdict-discrimination"
  | "template-diversity"
  | "freshness"
  | "asset-mix"
  | "committee"
  | "depth-coverage";

export interface QualitySloSnapshot {
  version: typeof QUALITY_SLO_VERSION;
  date: string;
  computedAt: string;
  sourceAsOf: string;
  sourceRunId?: string;
  passed: boolean;
  failures: QualitySloKey[];
  metrics: {
    causeExplanation: {
      movers: number;
      explained: number;
      ratio: number;
      target: number;
      passed: boolean;
    };
    marketData: {
      cards: number;
      pricedAndCharted: number;
      ratio: number;
      target: number;
      passed: boolean;
    };
    verdict: {
      cards: number;
      stanceCounts: { enter: number; watch: number; avoid: number; missing: number };
      watchRatio: number;
      uniqueTextCount: number;
      targetUniqueTextMin: number;
      passed: boolean;
    };
    templateDiversity: {
      sentenceCount: number;
      maxRepeatCount: number;
      mostRepeatedSentence: string | null;
      targetMaxRepeat: number;
      passed: boolean;
    };
    freshness: {
      repeatRatio: number;
      previousDate: string | null;
      targetMax: number;
      passed: boolean;
    };
    assets: {
      kr: number;
      us: number;
      coin: number;
      total: number;
      targetUsMin: number;
      targetCoinMin: number;
      targetCoinMax: number;
      passed: boolean;
    };
    committee: {
      published: boolean;
      runId: string | null;
      candidateCount: number | null;
      selectedCount: number;
      rejectedCount: number | null;
      factGateDiscardCount: number | null;
      factGateFallbackCount: number | null;
      passed: boolean;
    };
    depthCoverage: {
      cards: number;
      financial: number;
      theme: number;
      signalHistory: number;
      complete: number;
      ratio: number;
      target: number;
      passed: boolean;
    };
  };
}

export interface QualityLedgerEntry extends QualitySloSnapshot {
  recordedAt: string;
}

const CAUSE_PATTERN = /공시|실적|계약|수주|투자|증자|자사주|인수|합병|승인|허가|매출|가이던스|발표|보도|리포트|임상|내부자|매수|매도|배당|출시|filing|contract|earnings|approval|guidance/i;
const FINANCIAL_AXES = new Set(["valuation", "growth", "profitability"]);

function roundedRatio(count: number, total: number, emptyValue: number): number {
  if (total === 0) return emptyValue;
  return Math.round((count / total) * 10_000) / 10_000;
}

function normalizedSentence(value: string | undefined): string | null {
  const sentence = value?.replace(/\s+/g, " ").trim();
  return sentence ? sentence : null;
}

function stockText(stock: Daily30Response["stocks"][number]): string {
  return [stock.headline, stock.whyShown, stock.reason, stock.insightTag, stock.sourceLabel]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function isExplained(stock: Daily30Response["stocks"][number]): boolean {
  return Boolean(stock.sourceUrl) || CAUSE_PATTERN.test(stockText(stock));
}

function hasRealMarketData(front: Daily30Response["fronts"][string] | undefined): boolean {
  const price = parsePriceText(front?.priceText);
  return Boolean(
    price &&
    price > 0 &&
    front &&
    front.sparkline.length >= 2 &&
    front.sparkline.every((value) => Number.isFinite(value) && value > 0)
  );
}

function stockAsset(stock: Daily30Response["stocks"][number]): "kr" | "us" | "coin" {
  if (stock.market === "COIN") return "coin";
  return stock.country === "US" ? "us" : "kr";
}

function previousRepeatRatio(response: Daily30Response, previous: Daily30Response | null): number {
  if (typeof response.meta.repeatRatio === "number" && Number.isFinite(response.meta.repeatRatio)) {
    return Math.max(0, Math.min(1, response.meta.repeatRatio));
  }
  if (!previous || response.stocks.length === 0) return 0;
  const prior = new Set(previous.stocks.map((stock) => stock.canonical));
  return roundedRatio(response.stocks.filter((stock) => prior.has(stock.canonical)).length, response.stocks.length, 0);
}

function reportFactGate(report: CommitteeRunReport | undefined): {
  discarded: number | null;
  fallback: number | null;
} {
  if (!report) return { discarded: null, fallback: null };
  return {
    discarded: report.reviews.filter((review) => review.factGate.invalidNumbers.length > 0).length,
    fallback: report.reviews.filter(
      (review) => review.factGate.tradingFallback || review.factGate.financialFallback
    ).length,
  };
}

export function calculateQualitySloSnapshot(input: {
  date: string;
  response: Daily30Response;
  previousResponse?: Daily30Response | null;
  committeeReport?: CommitteeRunReport;
  computedAt?: string;
}): QualitySloSnapshot {
  const { response } = input;
  const stocks = response.stocks;
  const movers = stocks.filter((stock) => {
    const change = response.fronts[stock.canonical]?.signals.changePct;
    return typeof change === "number" && Number.isFinite(change) && Math.abs(change) >= 3;
  });
  const explained = movers.filter(isExplained).length;
  const causeRatio = roundedRatio(explained, movers.length, 1);
  const causePassed = causeRatio >= QUALITY_SLO_TARGETS.causeExplanationRate;

  const pricedAndCharted = stocks.filter((stock) => hasRealMarketData(response.fronts[stock.canonical])).length;
  const marketDataRatio = roundedRatio(pricedAndCharted, stocks.length, 0);
  const marketDataPassed = marketDataRatio >= QUALITY_SLO_TARGETS.marketDataRate;

  const stanceCounts = { enter: 0, watch: 0, avoid: 0, missing: 0 };
  const verdictTexts: string[] = [];
  const sentences: string[] = [];
  stocks.forEach((stock) => {
    const front = response.fronts[stock.canonical];
    const stance = front?.verdict?.stance;
    if (stance === "enter" || stance === "watch" || stance === "avoid") stanceCounts[stance] += 1;
    else stanceCounts.missing += 1;
    const verdictText = normalizedSentence(front?.verdict?.stanceText);
    if (verdictText) verdictTexts.push(verdictText);
    for (const value of [stock.headline, stock.whyShown, stock.reason, front?.verdict?.stanceText, front?.companyScore?.interpretation]) {
      const sentence = normalizedSentence(value);
      if (sentence) sentences.push(sentence);
    }
  });
  const uniqueTextCount = new Set(verdictTexts).size;
  const verdictPassed = uniqueTextCount >= QUALITY_SLO_TARGETS.verdictUniqueTextMin;

  const sentenceCounts = new Map<string, number>();
  sentences.forEach((sentence) => sentenceCounts.set(sentence, (sentenceCounts.get(sentence) ?? 0) + 1));
  const repeated = [...sentenceCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const maxRepeatCount = repeated?.[1] ?? 0;
  const templatePassed = maxRepeatCount <= QUALITY_SLO_TARGETS.maxSentenceRepeat;

  const repeatRatio = previousRepeatRatio(response, input.previousResponse ?? null);
  const freshnessPassed = repeatRatio <= QUALITY_SLO_TARGETS.repeatRatioMax;
  const previousDate = input.previousResponse?.asOf?.slice(0, 10) ?? null;

  const assetCounts = stocks.reduce(
    (counts, stock) => ({ ...counts, [stockAsset(stock)]: counts[stockAsset(stock)] + 1 }),
    { kr: 0, us: 0, coin: 0 }
  );
  const assetPassed = assetCounts.us >= QUALITY_SLO_TARGETS.usStockMin &&
    assetCounts.coin >= QUALITY_SLO_TARGETS.coinMin &&
    assetCounts.coin <= QUALITY_SLO_TARGETS.coinMax;

  const report = input.committeeReport;
  const runId = report?.runId ?? response.meta.committee?.runId ?? null;
  const committeePublished = (report?.status ?? (response.meta.committee ? "published" : "missing")) === "published";
  const factGate = reportFactGate(report);
  const rejectedCount = report ? Math.max(0, report.candidateCount - report.selectedCount) : null;

  let financial = 0;
  let theme = 0;
  let signalHistory = 0;
  let complete = 0;
  stocks.forEach((stock, index) => {
    const front = response.fronts[stock.canonical];
    const hasFinancial = Boolean(front?.committeeReview?.fundamentalView?.trim()) || Boolean(
      front?.companyScore?.axes.some((axis) => FINANCIAL_AXES.has(axis.key))
    );
    const hasTheme = Boolean(stock.sector?.trim()) && stock.sector !== "기타 업종";
    const storedTypes = response.meta.cards[index]?.signalTypes ?? [];
    const inferredTypes = storedTypes.length > 0 ? storedTypes : inferStandardSignalTypes({
      ...(stock.headline ? { headline: stock.headline } : {}),
      ...(stock.reason ?? stock.whyShown ? { reason: stock.reason ?? stock.whyShown } : {}),
      ...(stock.sourceLabel ? { sourceLabel: stock.sourceLabel } : {}),
      ...(stock.sourceUrl ? { sourceUrl: stock.sourceUrl } : {}),
      ...(front?.signals ? { signals: front.signals } : {}),
      ...(front?.wyckoff ? { wyckoff: front.wyckoff } : {}),
      ...(typeof front?.companyScore?.score === "number" ? { companyScore: front.companyScore.score } : {}),
    });
    const hasSignalHistory = inferredTypes.length > 0;
    if (hasFinancial) financial += 1;
    if (hasTheme) theme += 1;
    if (hasSignalHistory) signalHistory += 1;
    if (hasFinancial && hasTheme && hasSignalHistory) complete += 1;
  });
  const depthRatio = roundedRatio(complete, stocks.length, 0);
  const depthPassed = depthRatio >= QUALITY_SLO_TARGETS.depthCoverageRate;

  const failures: QualitySloKey[] = [];
  if (!causePassed) failures.push("cause-explanation");
  if (!marketDataPassed) failures.push("market-data");
  if (!verdictPassed) failures.push("verdict-discrimination");
  if (!templatePassed) failures.push("template-diversity");
  if (!freshnessPassed) failures.push("freshness");
  if (!assetPassed) failures.push("asset-mix");
  if (!committeePublished) failures.push("committee");
  if (!depthPassed) failures.push("depth-coverage");

  return {
    version: QUALITY_SLO_VERSION,
    date: input.date,
    computedAt: input.computedAt ?? new Date().toISOString(),
    sourceAsOf: response.asOf,
    ...(runId ? { sourceRunId: runId } : {}),
    passed: failures.length === 0,
    failures,
    metrics: {
      causeExplanation: {
        movers: movers.length,
        explained,
        ratio: causeRatio,
        target: QUALITY_SLO_TARGETS.causeExplanationRate,
        passed: causePassed,
      },
      marketData: {
        cards: stocks.length,
        pricedAndCharted,
        ratio: marketDataRatio,
        target: QUALITY_SLO_TARGETS.marketDataRate,
        passed: marketDataPassed,
      },
      verdict: {
        cards: stocks.length,
        stanceCounts,
        watchRatio: roundedRatio(stanceCounts.watch, stocks.length, 0),
        uniqueTextCount,
        targetUniqueTextMin: QUALITY_SLO_TARGETS.verdictUniqueTextMin,
        passed: verdictPassed,
      },
      templateDiversity: {
        sentenceCount: sentences.length,
        maxRepeatCount,
        mostRepeatedSentence: repeated?.[0] ?? null,
        targetMaxRepeat: QUALITY_SLO_TARGETS.maxSentenceRepeat,
        passed: templatePassed,
      },
      freshness: {
        repeatRatio,
        previousDate,
        targetMax: QUALITY_SLO_TARGETS.repeatRatioMax,
        passed: freshnessPassed,
      },
      assets: {
        ...assetCounts,
        total: stocks.length,
        targetUsMin: QUALITY_SLO_TARGETS.usStockMin,
        targetCoinMin: QUALITY_SLO_TARGETS.coinMin,
        targetCoinMax: QUALITY_SLO_TARGETS.coinMax,
        passed: assetPassed,
      },
      committee: {
        published: committeePublished,
        runId,
        candidateCount: report?.candidateCount ?? response.meta.committee?.candidateCount ?? null,
        selectedCount: report?.selectedCount ?? response.meta.committee?.selectedCount ?? stocks.length,
        rejectedCount,
        factGateDiscardCount: factGate.discarded,
        factGateFallbackCount: factGate.fallback,
        passed: committeePublished,
      },
      depthCoverage: {
        cards: stocks.length,
        financial,
        theme,
        signalHistory,
        complete,
        ratio: depthRatio,
        target: QUALITY_SLO_TARGETS.depthCoverageRate,
        passed: depthPassed,
      },
    },
  };
}

function asQualitySnapshot(payload: Prisma.JsonValue): QualitySloSnapshot | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as unknown as QualitySloSnapshot;
  return value.version === QUALITY_SLO_VERSION && typeof value.date === "string" && value.metrics
    ? value
    : null;
}

async function appendQualitySnapshot(snapshot: QualitySloSnapshot): Promise<number> {
  const key = `quality:${snapshot.date}`;
  const result = await prisma.qualityLedger.createMany({
    data: [{
      id: randomUUID(),
      date: snapshot.date,
      idempotencyKey: key,
      payload: snapshot as unknown as Prisma.InputJsonObject,
      actor: "engine",
    }],
    skipDuplicates: true,
  });
  return result.count;
}

export async function readQualityLedger(limit = 45): Promise<QualityLedgerEntry[]> {
  const rows = await prisma.qualityLedger.findMany({
    where: { idempotencyKey: { startsWith: "quality:" } },
    orderBy: [{ date: "desc" }, { ts: "desc" }],
    take: Math.max(1, Math.min(limit, 366)),
  });
  return rows.flatMap((row) => {
    const snapshot = asQualitySnapshot(row.payload);
    return snapshot ? [{ ...snapshot, date: row.date, recordedAt: row.ts.toISOString() }] : [];
  });
}

async function committeeReportForDate(date: string, reports?: readonly CommitteeRunReport[]): Promise<CommitteeRunReport | undefined> {
  const values = reports ?? await readCommitteeRunReports(45).catch(() => []);
  return values.find((report) => report.date === date && report.status === "published");
}

export async function recordQualityForPublishedResponse(
  date: string,
  response: Daily30Response,
  report?: CommitteeRunReport
): Promise<{ entry: QualityLedgerEntry; appended: boolean }> {
  const existing = (await readQualityLedger(366)).find((entry) => entry.date === date);
  if (existing) return { entry: existing, appended: false };
  const previousSelections = await readLatestSelectionSnapshotBefore(date);
  const previousResponse = daily30ResponseFromSelections(previousSelections);
  const resolvedReport = report ?? await committeeReportForDate(date);
  const snapshot = calculateQualitySloSnapshot({
    date,
    response,
    previousResponse,
    ...(resolvedReport ? { committeeReport: resolvedReport } : {}),
  });
  const appended = await appendQualitySnapshot(snapshot);
  return { entry: { ...snapshot, recordedAt: snapshot.computedAt }, appended: appended > 0 };
}

/** Catch-up appends only missing rows from immutable selection or committee publication history. */
export async function materializeRecentQualitySnapshots(limit = 2): Promise<{
  entries: QualityLedgerEntry[];
  appended: number;
}> {
  const requested = Math.max(1, Math.min(limit, 30));
  const [ledgerDates, publishedHistory] = await Promise.all([
    prisma.judgmentLedger.findMany({
      where: { kind: "selection", actor: { in: ["engine", "committee"] } },
      select: { date: true },
      distinct: ["date"],
      orderBy: { date: "desc" },
      take: requested,
    }),
    readPublishedCommitteeSnapshotHistory(requested).catch(() => []),
  ]);
  const responses = new Map<string, Daily30Response>();
  for (const snapshot of publishedHistory) {
    responses.set(snapshot.report.date || snapshot.response.asOf, snapshot.response);
  }
  for (const { date } of ledgerDates) {
    const response = await readDaily30ResponseFromLedger({ date });
    if (response) responses.set(date, response);
  }
  const dates = [...responses.keys()]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, requested)
    .sort();
  const reports = await readCommitteeRunReports(45).catch(() => []);
  const entries: QualityLedgerEntry[] = [];
  let appended = 0;
  for (const date of dates) {
    const response = responses.get(date);
    if (!response) continue;
    const result = await recordQualityForPublishedResponse(
      date,
      response,
      await committeeReportForDate(date, reports)
    );
    entries.push(result.entry);
    if (result.appended) appended += 1;
  }
  return { entries: entries.sort((a, b) => b.date.localeCompare(a.date)), appended };
}
