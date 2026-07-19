"use client";

import type { StockCountry, StockMarket } from "@fomo/core";
import type { DeckStock } from "./discoveryDeck";
import {
  recordJudgmentAction,
  recordJudgmentActions,
  type JudgmentActionInput,
  type LedgerAsset,
} from "./judgmentLedgerClient";

// Legacy-only key. New history is never written here; a first visit migrates priced rows to JudgmentLedger and removes it.
const LEGACY_KEY = "fomo_discovery_seen";
const CAP = 240;
const PRICE_CAPTURE_GRACE_MS = 10 * 60_000;
const memory = new Map<string, DiscoverySeenItem>();
const recordedSeen = new Set<string>();

export const DISCOVERY_PERFORMANCE_UPDATED_EVENT = "fomo:discovery-performance-updated";

export interface DiscoverySeenItem {
  stock: string;
  firstSeenAt: number;
  firstSeenPrice?: number;
  firstSeenPriceText?: string;
  firstSeenPriceCapturedAt?: number;
  companyScore?: number;
  companyScoreLabel?: string;
  symbol?: string;
  naverCode?: string;
  market?: StockMarket;
  country?: StockCountry;
  sector?: string;
  reason?: string;
  action?: "skip" | "save";
  actionAt?: number;
}

export interface DiscoverySeenInput {
  stock: string;
  symbol?: string;
  naverCode?: string;
  market?: StockMarket;
  country?: StockCountry;
  sector?: string;
  reason?: string;
}

interface PriceFront {
  priceText?: string;
  companyScore?: { score: number | null; label: string };
}

function parsePriceText(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/u)?.[0];
  if (!normalized) return undefined;
  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

function assetOf(item: Pick<DiscoverySeenItem, "country" | "market">): LedgerAsset {
  if (item.market === "COIN" || item.country === "GLOBAL") return "coin";
  return item.country === "US" ? "us-stock" : "kr-stock";
}

function detailsOf(item: DiscoverySeenItem): Record<string, string | number | boolean | undefined> {
  return {
    ...(item.firstSeenPriceText ? { firstSeenPriceText: item.firstSeenPriceText } : {}),
    ...(typeof item.companyScore === "number" ? { companyScore: item.companyScore } : {}),
    ...(item.companyScoreLabel ? { companyScoreLabel: item.companyScoreLabel } : {}),
    ...(item.naverCode ? { naverCode: item.naverCode } : {}),
    ...(item.market ? { market: item.market } : {}),
    ...(item.country ? { country: item.country } : {}),
    ...(item.sector ? { sector: item.sector } : {}),
    ...(item.reason ? { reason: item.reason } : {}),
  };
}

function actionEntry(item: DiscoverySeenItem, action: JudgmentActionInput["action"], occurredAt: number): JudgmentActionInput | null {
  if (typeof item.firstSeenPrice !== "number" || item.firstSeenPrice <= 0) return null;
  return {
    action,
    occurredAt,
    subject: {
      asset: assetOf(item),
      canonical: item.stock,
      ...(item.symbol || item.naverCode ? { symbol: item.symbol ?? item.naverCode } : {}),
    },
    priceAt: item.firstSeenPrice,
    details: detailsOf(item),
  };
}

function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DISCOVERY_PERFORMANCE_UPDATED_EVENT));
}

export function recordDiscoverySeen(
  stock: DeckStock | DiscoverySeenInput,
  nowMs: number,
  opts: { front?: PriceFront; reason?: string } = {}
): void {
  if (typeof window === "undefined") return;
  const stockName = "canonical" in stock ? stock.canonical : stock.stock;
  if (!stockName) return;
  const existing = memory.get(stockName);
  const price = parsePriceText(opts.front?.priceText);
  const score = opts.front?.companyScore?.score;
  const base: DiscoverySeenItem = existing ?? { stock: stockName, firstSeenAt: nowMs };
  const withinCaptureWindow = nowMs - base.firstSeenAt <= PRICE_CAPTURE_GRACE_MS;
  const next: DiscoverySeenItem = {
    ...base,
    ...("symbol" in stock && stock.symbol ? { symbol: stock.symbol } : {}),
    ...("naverCode" in stock && stock.naverCode ? { naverCode: stock.naverCode } : {}),
    ...("market" in stock && stock.market ? { market: stock.market } : {}),
    ...("country" in stock && stock.country ? { country: stock.country } : {}),
    ...("sector" in stock && stock.sector ? { sector: stock.sector } : {}),
    ...(opts.reason ? { reason: opts.reason } : {}),
    ...(withinCaptureWindow && typeof price === "number" && typeof base.firstSeenPrice !== "number"
      ? {
          firstSeenPrice: price,
          ...(opts.front?.priceText ? { firstSeenPriceText: opts.front.priceText } : {}),
          firstSeenPriceCapturedAt: nowMs,
        }
      : {}),
    ...(withinCaptureWindow && typeof score === "number" && typeof base.companyScore !== "number"
      ? {
          companyScore: score,
          ...(opts.front?.companyScore?.label ? { companyScoreLabel: opts.front.companyScore.label } : {}),
        }
      : {}),
  };
  memory.set(stockName, next);

  if (!recordedSeen.has(stockName)) {
    const entry = actionEntry(next, "seen", next.firstSeenAt);
    if (entry) {
      recordedSeen.add(stockName);
      recordJudgmentAction(entry);
      notify();
    }
  }
}

export function markDiscoverySeenAction(stockName: string, action: "skip" | "save", nowMs = Date.now()): void {
  const item = memory.get(stockName);
  if (!item) return;
  const next = { ...item, action, actionAt: nowMs } satisfies DiscoverySeenItem;
  memory.set(stockName, next);
  const entry = actionEntry(next, action === "skip" ? "pass" : "star", nowMs);
  if (entry) recordJudgmentAction(entry);
  notify();
}

export function recordDiscoveryDepth(stockName: string, nowMs = Date.now()): void {
  const item = memory.get(stockName);
  if (!item) return;
  const entry = actionEntry(item, "depth", nowMs);
  if (entry) recordJudgmentAction(entry);
}

function readLegacy(): DiscoverySeenItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEGACY_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Partial<DiscoverySeenItem>;
      if (typeof item.stock !== "string" || typeof item.firstSeenAt !== "number") return [];
      return [{ ...item, stock: item.stock, firstSeenAt: item.firstSeenAt } as DiscoverySeenItem];
    }).slice(0, CAP);
  } catch {
    return [];
  }
}

/** One-way migration. Rows without an actually captured discovery price are not invented or backfilled. */
export async function migrateLegacyDiscoverySeen(): Promise<number> {
  if (typeof window === "undefined") return 0;
  const legacy = readLegacy();
  const entries = legacy.flatMap((item): JudgmentActionInput[] => {
    if (typeof item.firstSeenPrice !== "number" || item.firstSeenPrice <= 0) return [];
    const seen = actionEntry(item, "seen", item.firstSeenAt);
    const action = item.action
      ? actionEntry(item, item.action === "skip" ? "pass" : "star", item.actionAt ?? item.firstSeenAt)
      : null;
    return [seen, action].filter((entry): entry is JudgmentActionInput => !!entry).map((entry) => ({ ...entry, imported: true }));
  });
  let appended = 0;
  for (let index = 0; index < entries.length; index += 80) {
    const result = await recordJudgmentActions(entries.slice(index, index + 80));
    appended += result.appended;
  }
  window.localStorage.removeItem(LEGACY_KEY);
  return appended;
}

export function daysSince(ts: number, nowMs = Date.now()): number {
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  return Math.max(0, Math.floor((nowMs - ts) / 86_400_000));
}

export function formatReturnPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}
