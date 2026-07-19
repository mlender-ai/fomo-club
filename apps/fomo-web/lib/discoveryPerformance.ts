"use client";

import type { StockCountry, StockMarket } from "@fomo/core";
import type { DeckStock } from "@/lib/discoveryDeck";

const KEY = "fomo_discovery_seen";
const CAP = 240;
const PRICE_CAPTURE_GRACE_MS = 10 * 60_000;

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
  /** R1 후회 영수증(2026-07-12): 스와이프 결과. undefined=봤다만, skip=넘김(X), save=담음(★). */
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

function read(): DiscoverySeenItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): DiscoverySeenItem | null => {
        if (!row || typeof row !== "object") return null;
        const candidate = row as Partial<DiscoverySeenItem>;
        if (typeof candidate.stock !== "string" || typeof candidate.firstSeenAt !== "number") return null;
        return {
          stock: candidate.stock,
          firstSeenAt: candidate.firstSeenAt,
          ...(typeof candidate.firstSeenPrice === "number" ? { firstSeenPrice: candidate.firstSeenPrice } : {}),
          ...(typeof candidate.firstSeenPriceText === "string" ? { firstSeenPriceText: candidate.firstSeenPriceText } : {}),
          ...(typeof candidate.firstSeenPriceCapturedAt === "number"
            ? { firstSeenPriceCapturedAt: candidate.firstSeenPriceCapturedAt }
            : {}),
          ...(typeof candidate.companyScore === "number" ? { companyScore: candidate.companyScore } : {}),
          ...(typeof candidate.companyScoreLabel === "string" ? { companyScoreLabel: candidate.companyScoreLabel } : {}),
          ...(typeof candidate.symbol === "string" ? { symbol: candidate.symbol } : {}),
          ...(typeof candidate.naverCode === "string" ? { naverCode: candidate.naverCode } : {}),
          ...(typeof candidate.market === "string" ? { market: candidate.market as StockMarket } : {}),
          ...(typeof candidate.country === "string" ? { country: candidate.country as StockCountry } : {}),
          ...(typeof candidate.sector === "string" ? { sector: candidate.sector } : {}),
          ...(typeof candidate.reason === "string" ? { reason: candidate.reason } : {}),
          ...(candidate.action === "skip" || candidate.action === "save" ? { action: candidate.action } : {}),
          ...(typeof candidate.actionAt === "number" ? { actionAt: candidate.actionAt } : {}),
        };
      })
      .filter((row): row is DiscoverySeenItem => row !== null);
  } catch {
    return [];
  }
}

function write(items: DiscoverySeenItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, CAP)));
    window.dispatchEvent(new CustomEvent(DISCOVERY_PERFORMANCE_UPDATED_EVENT));
  } catch {
    /* localStorage failure should not block the deck */
  }
}

export function getDiscoverySeen(): DiscoverySeenItem[] {
  return read().sort((a, b) => b.firstSeenAt - a.firstSeenAt);
}

export function recordDiscoverySeen(
  stock: DeckStock | DiscoverySeenInput,
  nowMs: number,
  opts: { front?: PriceFront; reason?: string } = {}
): void {
  if (typeof window === "undefined") return;
  const stockName = "canonical" in stock ? stock.canonical : stock.stock;
  if (!stockName) return;

  const price = parsePriceText(opts.front?.priceText);
  const items = read();
  const index = items.findIndex((item) => item.stock === stockName);
  const existing = index >= 0 ? items[index] : undefined;
  const base: DiscoverySeenItem =
    existing ??
    ({
      stock: stockName,
      firstSeenAt: nowMs,
    } satisfies DiscoverySeenItem);
  const canCapturePrice =
    typeof price === "number" &&
    typeof base.firstSeenPrice !== "number" &&
    nowMs - base.firstSeenAt <= PRICE_CAPTURE_GRACE_MS;
  const score = opts.front?.companyScore?.score;
  const canCaptureScore =
    typeof score === "number" &&
    typeof base.companyScore !== "number" &&
    nowMs - base.firstSeenAt <= PRICE_CAPTURE_GRACE_MS;

  const next: DiscoverySeenItem = {
    ...base,
    ...(("symbol" in stock && stock.symbol) ? { symbol: stock.symbol } : {}),
    ...(("naverCode" in stock && stock.naverCode) ? { naverCode: stock.naverCode } : {}),
    ...(("market" in stock && stock.market) ? { market: stock.market } : {}),
    ...(("country" in stock && stock.country) ? { country: stock.country } : {}),
    ...(("sector" in stock && stock.sector) ? { sector: stock.sector } : {}),
    ...(opts.reason ? { reason: opts.reason } : base.reason ? { reason: base.reason } : {}),
    ...(canCapturePrice
      ? {
          firstSeenPrice: price,
          firstSeenPriceCapturedAt: nowMs,
          ...(opts.front?.priceText ? { firstSeenPriceText: opts.front.priceText } : {}),
        }
      : {}),
    ...(canCaptureScore
      ? {
          companyScore: score,
          ...(opts.front?.companyScore?.label ? { companyScoreLabel: opts.front.companyScore.label } : {}),
        }
      : {}),
  };

  if (index >= 0) {
    items[index] = next;
    write(items.sort((a, b) => b.firstSeenAt - a.firstSeenAt));
    return;
  }
  write([next, ...items]);
}

/**
 * R1 후회 영수증: 카드의 스와이프 결과를 기록한다(발견가는 recordDiscoverySeen 이 이미 캡처).
 * view → skip/save 는 확정이므로 항상 갱신. 대상이 없으면(관측 누락) 최소 항목 생성.
 */
export function markDiscoverySeenAction(stockName: string, action: "skip" | "save", nowMs = Date.now()): void {
  if (typeof window === "undefined" || !stockName) return;
  const items = read();
  const index = items.findIndex((item) => item.stock === stockName);
  if (index >= 0) {
    items[index] = { ...items[index]!, action, actionAt: nowMs };
    write(items);
  } else {
    write([{ stock: stockName, firstSeenAt: nowMs, action, actionAt: nowMs }, ...items]);
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DISCOVERY_PERFORMANCE_UPDATED_EVENT));
}

/** 넘긴(X) 카드만 — 발견가가 있는 것만(성과 계산 가능). 최신순. */
export function getSkippedSeen(): DiscoverySeenItem[] {
  return read()
    .filter((item) => item.action === "skip" && typeof item.firstSeenPrice === "number")
    .sort((a, b) => (b.actionAt ?? b.firstSeenAt) - (a.actionAt ?? a.firstSeenAt));
}

export function daysSince(ts: number, nowMs = Date.now()): number {
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  return Math.max(0, Math.floor((nowMs - ts) / 86_400_000));
}

export function formatReturnPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}
