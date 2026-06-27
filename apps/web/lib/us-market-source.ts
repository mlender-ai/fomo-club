import type { DiscoveryMarket } from "@fomo/core";
import type { DiscoveryMarketRow } from "./market-source-types";
import { usDiscoveryUniverse, type UsDiscoverySymbol } from "./us-symbols";

const TWELVE_DATA_URL = "https://api.twelvedata.com/quote";
const TWELVE_TIME_SERIES_URL = "https://api.twelvedata.com/time_series";
const TWELVE_MARKET_MOVERS_URL = "https://api.twelvedata.com/market_movers/stocks";
const UA = "Mozilla/5.0 (compatible; FomoClubBot/1.0)";
const US_QUOTE_LIMIT = 80;
const US_SPARKLINE_LIMIT = 60;

interface TwelveQuote {
  symbol?: string;
  name?: string;
  exchange?: string;
  close?: string;
  price?: string;
  change?: string;
  percent_change?: string;
  volume?: string;
  currency?: string;
}

interface TwelveTimeSeriesValue {
  datetime?: string;
  close?: string;
}

interface TwelveTimeSeries {
  symbol?: string;
  values?: TwelveTimeSeriesValue[];
}

function tdKey(): string | undefined {
  return process.env.TWELVE_DATA_API_KEY?.trim();
}

function num(value: string | number | undefined): number | undefined {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function money(value: number | undefined): string | undefined {
  if (typeof value !== "number") return undefined;
  return `$${value >= 100 ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : value.toFixed(2)}`;
}

function marketFor(defMarket: string, exchange: string | undefined): DiscoveryMarket {
  if (defMarket === "NYSE" || /NYSE/i.test(exchange ?? "")) return "NYSE";
  return "NASDAQ";
}

function latestUsSessionDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const ymd = `${value("year")}-${value("month")}-${value("day")}`;
  const day = value("weekday");
  const current = new Date(`${ymd}T12:00:00-05:00`);
  while (current.getUTCDay() === 0 || current.getUTCDay() === 6 || isSimpleUsMarketHoliday(current)) {
    current.setUTCDate(current.getUTCDate() - 1);
  }
  return current.toISOString().slice(0, 10);
}

function isSimpleUsMarketHoliday(date: Date): boolean {
  const yyyy = date.getUTCFullYear();
  const mmdd = date.toISOString().slice(5, 10);
  const holidays = new Set([
    `${yyyy}-01-01`.slice(5),
    `${yyyy}-06-19`.slice(5),
    `${yyyy}-07-04`.slice(5),
    `${yyyy}-12-25`.slice(5),
  ]);
  return holidays.has(mmdd);
}

export function latestUsSessionAsOf(now = new Date()): { date: string; label: string } {
  const date = latestUsSessionDate(now);
  const [, month, day] = date.match(/^\d{4}-(\d{2})-(\d{2})$/) ?? [];
  return {
    date,
    label: month && day ? `${Number(month)}월 ${Number(day)}일(ET) 종가 기준` : `${date}(ET) 기준`,
  };
}

function parseQuote(seed: UsDiscoverySymbol, quote: TwelveQuote | undefined, sparkline?: number[]): DiscoveryMarketRow | null {
  const symbol = (quote?.symbol ?? seed.symbol).toUpperCase();
  if (!symbol) return null;
  const session = latestUsSessionAsOf();
  const price = num(quote?.price) ?? num(quote?.close);
  const pct = num(quote?.percent_change);
  const change = num(quote?.change);
  const priceText = money(price);
  const volume = num(quote?.volume);
  const dir = typeof pct !== "number" ? "flat" : pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return {
    canonical: seed.canonical,
    symbol,
    market: marketFor(seed.market, quote?.exchange),
    country: "US",
    currency: "USD",
    ...(seed.fameRank ? { marketCapRank: seed.fameRank, marketCapRankSource: "curated" as const } : {}),
    ...(priceText ? { priceText } : {}),
    ...(typeof pct === "number" ? { changePct: pct } : {}),
    ...(typeof pct === "number" || typeof change === "number"
      ? { changeText: `${typeof change === "number" ? `${change > 0 ? "+" : ""}${change.toFixed(2)}` : ""}${typeof pct === "number" ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(2)}%)` : ""}`.trim() }
      : {}),
    changeDir: dir,
    ...(volume ? { tradingValue: volume } : {}),
    ...(sparkline && sparkline.length >= 2 ? { sparkline } : {}),
    sectorHint: seed.sector,
    sessionLabel: session.label,
  };
}

function seedRows(): DiscoveryMarketRow[] {
  const session = latestUsSessionAsOf();
  return usDiscoveryUniverse().map((seed) => ({
    canonical: seed.canonical,
    symbol: seed.symbol,
    market: marketFor(seed.market, undefined),
    country: "US",
    currency: "USD",
    ...(seed.fameRank ? { marketCapRank: seed.fameRank, marketCapRankSource: "curated" as const } : {}),
    sectorHint: seed.sector,
    sessionLabel: session.label,
  }));
}

function normalizeQuoteResponse(data: unknown): Record<string, TwelveQuote> {
  if (!data || typeof data !== "object") return {};
  const root = data as Record<string, unknown>;
  if ("symbol" in root) {
    const q = root as TwelveQuote;
    return q.symbol ? { [q.symbol.toUpperCase()]: q } : {};
  }
  const out: Record<string, TwelveQuote> = {};
  for (const [key, value] of Object.entries(root)) {
    if (value && typeof value === "object" && !("code" in (value as Record<string, unknown>))) {
      out[key.toUpperCase()] = value as TwelveQuote;
    }
  }
  return out;
}

function normalizeTimeSeriesResponse(data: unknown): Record<string, number[]> {
  if (!data || typeof data !== "object") return {};
  const root = data as Record<string, unknown>;
  const parseOne = (series: TwelveTimeSeries): number[] =>
    (series.values ?? [])
      .map((row) => num(row.close))
      .filter((value): value is number => typeof value === "number")
      .reverse();
  if ("values" in root) {
    const series = root as TwelveTimeSeries;
    return series.symbol ? { [series.symbol.toUpperCase()]: parseOne(series) } : {};
  }
  const out: Record<string, number[]> = {};
  for (const [key, value] of Object.entries(root)) {
    if (value && typeof value === "object" && !("code" in (value as Record<string, unknown>))) {
      const parsed = parseOne(value as TwelveTimeSeries);
      if (parsed.length > 0) out[key.toUpperCase()] = parsed;
    }
  }
  return out;
}

function normalizeMoverSymbols(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const arrays = [root.values, root.data, root.gainers, root.losers, root.most_active].filter(Array.isArray) as unknown[][];
  const symbols = new Set<string>();
  for (const arr of arrays) {
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const symbol = String((item as Record<string, unknown>).symbol ?? "").toUpperCase();
      if (/^[A-Z.]{1,6}$/.test(symbol)) symbols.add(symbol);
    }
  }
  return [...symbols];
}

async function fetchMoverSymbols(key: string): Promise<string[]> {
  const out = new Set<string>();
  for (const type of ["gainers", "most_active"] as const) {
    try {
      const url = new URL(TWELVE_MARKET_MOVERS_URL);
      url.searchParams.set("apikey", key);
      url.searchParams.set("country", "United States");
      url.searchParams.set("type", type);
      const res = await fetch(url.toString(), {
        headers: { accept: "application/json", "user-agent": UA },
        signal: AbortSignal.timeout(5_000),
        next: { revalidate: 900 },
      });
      if (!res.ok) continue;
      for (const symbol of normalizeMoverSymbols(await res.json())) out.add(symbol);
    } catch {
      // Market movers is opportunistic. The curated universe + quote batch is the fail-closed path.
    }
  }
  return [...out];
}

async function fetchQuotes(symbols: readonly string[], key: string): Promise<Record<string, TwelveQuote>> {
  if (symbols.length === 0) return {};
  const url = new URL(TWELVE_DATA_URL);
  url.searchParams.set("symbol", symbols.join(","));
  url.searchParams.set("apikey", key);
  const res = await fetch(url.toString(), {
    headers: { accept: "application/json", "user-agent": UA },
    signal: AbortSignal.timeout(8_000),
    next: { revalidate: 600 },
  });
  if (!res.ok) return {};
  return normalizeQuoteResponse(await res.json());
}

async function fetchSparklines(symbols: readonly string[], key: string): Promise<Record<string, number[]>> {
  if (symbols.length === 0) return {};
  const url = new URL(TWELVE_TIME_SERIES_URL);
  url.searchParams.set("symbol", symbols.join(","));
  url.searchParams.set("interval", "1day");
  url.searchParams.set("outputsize", "42");
  url.searchParams.set("apikey", key);
  const res = await fetch(url.toString(), {
    headers: { accept: "application/json", "user-agent": UA },
    signal: AbortSignal.timeout(8_000),
    next: { revalidate: 1_800 },
  });
  if (!res.ok) return {};
  return normalizeTimeSeriesResponse(await res.json());
}

/**
 * US quote adapter. Twelve Data is used because Yahoo chart endpoints are unstable from Node/undici.
 * If the key is absent or the upstream fails, return a verified seed universe without price data.
 * We never synthesize quotes: price/change fields are present only when a live source returns them.
 */
export async function fetchUsMarketRows(): Promise<DiscoveryMarketRow[]> {
  const key = tdKey();
  if (!key) return seedRows();
  const seeds = usDiscoveryUniverse();
  const bySymbol = new Map(seeds.map((seed) => [seed.symbol.toUpperCase(), seed]));
  try {
    const moverSymbols = await fetchMoverSymbols(key);
    const symbols = [...new Set([...moverSymbols, ...seeds.map((seed) => seed.symbol)])]
      .filter((symbol) => /^[A-Z.]{1,6}$/.test(symbol))
      .slice(0, US_QUOTE_LIMIT);
    if (symbols.length === 0) return seedRows();
    const [quotes, sparklines] = await Promise.all([
      fetchQuotes(symbols, key),
      fetchSparklines(symbols.slice(0, US_SPARKLINE_LIMIT), key).catch((): Record<string, number[]> => ({})),
    ]);
    const rows: DiscoveryMarketRow[] = [];
    for (const symbol of symbols) {
      const upper = symbol.toUpperCase();
      const quote = quotes[upper];
      const seed = bySymbol.get(upper) ?? {
        canonical: quote?.name?.trim() || upper,
        symbol: upper,
        market: /NYSE/i.test(quote?.exchange ?? "") ? "NYSE" : "NASDAQ",
        sector: "미국주식",
      };
      const row = parseQuote(seed, quote, sparklines[upper]);
      if (row) rows.push(row);
    }
    return rows.length > 0 ? rows : seedRows();
  } catch (err) {
    console.warn("[us-market-source] Twelve Data quote failed", (err as Error)?.message);
    return seedRows();
  }
}
