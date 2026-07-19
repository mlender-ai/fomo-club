/**
 * 서버 현재가 페처 (2026-07-12 R1 후회 영수증) — Yahoo(KR/US) + Upbit(코인).
 * performance-prices 라우트의 Yahoo 로직을 재사용 가능한 형태로 추출. 코인은 캐시 스냅샷 가격.
 * 어제의 영수증 등 서버 콘텐츠가 "발견가 대비 지금" 성과를 계산할 때 쓴다. 소급 조작 없음(실시세만).
 */

import type { DailyOhlcv, StockCountry, StockMarket } from "@fomo/core";
import { readCoinMarketSnapshots } from "./coin-market-source";
import { readKrCandleCache } from "./kr-candle-cache";
import { fetchStockDaily } from "./stock-front";
import { fetchNasdaqDailyCandles } from "./us-market-source";

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

export function yahooSymbolFor(item: QuoteRequestItem): string | null {
  const rawSymbol = item.symbol?.trim().toUpperCase();
  if (item.country === "US" || item.market === "NASDAQ" || item.market === "NYSE") {
    return rawSymbol || item.stock.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  }
  const code = item.naverCode?.trim() || (/^\d{6}$/.test(rawSymbol ?? "") ? rawSymbol : "");
  if (code && item.market === "KOSDAQ") return `${code}.KQ`;
  if (code && item.market === "KOSPI") return `${code}.KS`;
  return null;
}

export interface HistoricalQuoteRequestItem extends QuoteRequestItem {
  targetDate: string;
  /** Selection-time immutable candles. Preferred over every network source when available. */
  candles?: DailyOhlcv[];
}

export interface HistoricalPricePoint {
  price: number;
  date: string;
}

async function fetchYahooHistoricalPrice(yahooSymbol: string, targetDate: string): Promise<HistoricalPricePoint | null> {
  const targetMs = Date.parse(`${targetDate}T00:00:00.000Z`);
  if (!Number.isFinite(targetMs)) return null;
  const period1 = Math.floor((targetMs - 2 * 86_400_000) / 1000);
  const period2 = Math.floor((targetMs + 9 * 86_400_000) / 1000);
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": YAHOO_UA },
        signal: AbortSignal.timeout(7_000),
        next: { revalidate: 86_400 },
      });
      if (!res.ok) continue;
      const payload = (await res.json()) as {
        chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
      };
      const result = payload.chart?.result?.[0];
      const timestamps = result?.timestamp ?? [];
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      const candidates = timestamps.flatMap((timestamp, index) => {
        const close = closes[index];
        return timestamp * 1000 >= targetMs && typeof close === "number" && Number.isFinite(close) && close > 0
          ? [{ timestamp, close }]
          : [];
      });
      const point = candidates.sort((a, b) => a.timestamp - b.timestamp)[0];
      if (point) return { price: point.close, date: new Date(point.timestamp * 1000).toISOString().slice(0, 10) };
    } catch {
      // 다음 Yahoo 호스트 시도.
    }
  }
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

function candleDate(value: string | undefined): string | null {
  if (!value) return null;
  const digits = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (digits) return `${digits[1]}-${digits[2]}-${digits[3]}`;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function historicalPoint(candles: readonly DailyOhlcv[] | undefined, targetDate: string): HistoricalPricePoint | null {
  const point = (candles ?? [])
    .flatMap((row) => {
      const date = candleDate(row.date);
      return date && date >= targetDate && Number.isFinite(row.close) && row.close > 0 ? [{ date, price: row.close }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return point ?? null;
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

/**
 * 목표일 당일 또는 그 뒤 첫 거래일 종가. 주말·휴장일은 최대 8일 안의 다음 실제 봉을 사용한다.
 * 성과 원장 크론 전용이며 요청 경로에서 호출하지 않는다.
 */
export async function fetchHistoricalPrices(items: readonly HistoricalQuoteRequestItem[]): Promise<Map<string, HistoricalPricePoint>> {
  const prices = new Map<string, HistoricalPricePoint>();
  const coinItems = items.filter(isCoin);
  const stockItems = items.filter((item) => !isCoin(item));

  for (const item of items) {
    const point = historicalPoint(item.candles, item.targetDate);
    if (point) prices.set(item.key, point);
  }

  if (coinItems.length > 0) {
    const snapshots = await readCoinMarketSnapshots().catch(() => []);
    const bySymbol = new Map(snapshots.map((snapshot) => [snapshot.symbol.toUpperCase(), snapshot] as const));
    const byName = new Map(snapshots.map((snapshot) => [snapshot.koreanName, snapshot] as const));
    for (const item of coinItems) {
      const snapshot = (item.symbol ? bySymbol.get(item.symbol.toUpperCase()) : undefined) ?? byName.get(item.stock);
      const candle = snapshot?.candles
        .filter((row) => typeof row.date === "string" && row.date.slice(0, 10) >= item.targetDate && row.close > 0)
        .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))[0];
      if (candle) prices.set(item.key, { price: candle.close, date: candle.date!.slice(0, 10) });
    }
  }

  const unresolvedStocks = () => stockItems.filter((item) => !prices.has(item.key));

  // KR prewarm candles are the primary legacy path. If the cache is stale/missing, the cron may
  // fetch Naver once; public requests never execute this function.
  await mapLimit(
    unresolvedStocks().filter((item) => Boolean(item.naverCode) && item.country !== "US"),
    3,
    async (item) => {
      const code = item.naverCode!;
      const cached = await readKrCandleCache(code).catch(() => null);
      const candles = cached ?? (await fetchStockDaily(code, 420)).candles;
      const point = historicalPoint(candles, item.targetDate);
      if (point) prices.set(item.key, point);
    }
  );

  // Nasdaq historical is independent of Yahoo's shared edge quota and covers migrated US picks.
  await mapLimit(
    unresolvedStocks().filter((item) => item.country === "US" || item.market === "NASDAQ" || item.market === "NYSE"),
    3,
    async (item) => {
      const symbol = yahooSymbolFor(item)?.replace(/\.(?:KS|KQ)$/i, "") ?? "";
      if (!symbol) return;
      const { candles } = await fetchNasdaqDailyCandles(symbol, 180);
      const point = historicalPoint(candles, item.targetDate);
      if (point) prices.set(item.key, point);
    }
  );

  // Yahoo remains a last resort only. Its edge frequently returns 429 under batch workloads.
  const jobs = unresolvedStocks().flatMap((item) => {
    const yahooSymbol = yahooSymbolFor(item);
    return yahooSymbol ? [{ item, yahooSymbol }] : [];
  });
  await mapLimit(jobs, 5, async ({ item, yahooSymbol }) => {
    const point = await fetchYahooHistoricalPrice(yahooSymbol, item.targetDate);
    if (point && point.price > 0) prices.set(item.key, point);
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
