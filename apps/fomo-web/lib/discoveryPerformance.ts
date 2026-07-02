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
  symbol?: string;
  naverCode?: string;
  market?: StockMarket;
  country?: StockCountry;
  sector?: string;
  reason?: string;
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
          ...(typeof candidate.symbol === "string" ? { symbol: candidate.symbol } : {}),
          ...(typeof candidate.naverCode === "string" ? { naverCode: candidate.naverCode } : {}),
          ...(typeof candidate.market === "string" ? { market: candidate.market as StockMarket } : {}),
          ...(typeof candidate.country === "string" ? { country: candidate.country as StockCountry } : {}),
          ...(typeof candidate.sector === "string" ? { sector: candidate.sector } : {}),
          ...(typeof candidate.reason === "string" ? { reason: candidate.reason } : {}),
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
  };

  if (index >= 0) {
    items[index] = next;
    write(items.sort((a, b) => b.firstSeenAt - a.firstSeenAt));
    return;
  }
  write([next, ...items]);
}

export function daysSince(ts: number, nowMs = Date.now()): number {
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  return Math.max(0, Math.floor((nowMs - ts) / 86_400_000));
}

export function formatReturnPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}
