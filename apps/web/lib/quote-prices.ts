/**
 * 서버 현재가 페처 (2026-07-12 R1 후회 영수증) — Yahoo(KR/US) + Upbit(코인).
 * performance-prices 라우트의 Yahoo 로직을 재사용 가능한 형태로 추출. 코인은 캐시 스냅샷 가격.
 * 어제의 영수증 등 서버 콘텐츠가 "발견가 대비 지금" 성과를 계산할 때 쓴다. 소급 조작 없음(실시세만).
 */

import type { StockCountry, StockMarket } from "@fomo/core";
import { readCoinMarketSnapshots } from "./coin-market-source";

const YAHOO_HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const YAHOO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface QuoteRequestItem {
  key: string; // 결과 맵 키 (canonical 등)
  stock: string;
  symbol?: string;
  naverCode?: string;
  market?: StockMarket | string;
  country?: StockCountry | string;
}

function yahooSymbolFor(item: QuoteRequestItem): string | null {
  const rawSymbol = item.symbol?.trim().toUpperCase();
  if (item.country === "US" || item.market === "NASDAQ" || item.market === "NYSE") {
    return rawSymbol || item.stock.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  }
  const code = item.naverCode?.trim() || (/^\d{6}$/.test(rawSymbol ?? "") ? rawSymbol : "");
  if (code && item.market === "KOSDAQ") return `${code}.KQ`;
  if (code && item.market === "KOSPI") return `${code}.KS`;
  return null;
}

async function fetchYahooPrice(yahooSymbol: string): Promise<number | null> {
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=1d`;
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": YAHOO_UA },
        signal: AbortSignal.timeout(7_000),
        next: { revalidate: 600 },
      });
      if (!res.ok) continue;
      const payload = (await res.json()) as {
        chart?: { result?: { meta?: { regularMarketPrice?: number }; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
      };
      const result = payload.chart?.result?.[0];
      const closes = result?.indicators?.quote?.[0]?.close?.filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0
      );
      const price =
        typeof result?.meta?.regularMarketPrice === "number" && result.meta.regularMarketPrice > 0
          ? result.meta.regularMarketPrice
          : closes?.at(-1);
      if (typeof price === "number" && Number.isFinite(price) && price > 0) return price;
    } catch {
      // 다음 호스트 시도.
    }
  }
  return null;
}

function isCoin(item: QuoteRequestItem): boolean {
  return item.market === "COIN" || item.country === "GLOBAL";
}

async function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(worker))));
  }
  return out;
}

/**
 * key → 현재가 맵. Yahoo(KR/US) + Upbit 캐시(코인). 실패분은 맵에서 빠진다(폴백 없음, 정직).
 */
export async function fetchCurrentPrices(items: readonly QuoteRequestItem[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const coinItems = items.filter(isCoin);
  const stockItems = items.filter((item) => !isCoin(item));

  if (coinItems.length > 0) {
    const snapshots = await readCoinMarketSnapshots().catch(() => []);
    const byName = new Map(snapshots.map((s) => [s.koreanName, s.price] as const));
    const bySymbol = new Map(snapshots.map((s) => [s.symbol.toUpperCase(), s.price] as const));
    for (const item of coinItems) {
      const price = byName.get(item.stock) ?? (item.symbol ? bySymbol.get(item.symbol.toUpperCase()) : undefined);
      if (typeof price === "number" && price > 0) prices.set(item.key, price);
    }
  }

  const jobs = stockItems
    .map((item) => ({ item, yahooSymbol: yahooSymbolFor(item) }))
    .filter((job): job is { item: QuoteRequestItem; yahooSymbol: string } => !!job.yahooSymbol);
  await mapLimit(jobs, 5, async ({ item, yahooSymbol }) => {
    const price = await fetchYahooPrice(yahooSymbol);
    if (typeof price === "number" && price > 0) prices.set(item.key, price);
  });
  return prices;
}

export function parsePriceText(text: string | undefined): number | null {
  if (!text) return null;
  const raw = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/u)?.[0];
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
