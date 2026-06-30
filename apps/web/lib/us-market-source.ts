import type { DiscoveryMarket } from "@fomo/core";
import type { DiscoveryMarketRow } from "./market-source-types";
import { usDiscoverySeedForSymbol, usDiscoveryUniverse, type UsDiscoverySymbol } from "./us-symbols";

const TWELVE_DATA_URL = "https://api.twelvedata.com/quote";
const TWELVE_TIME_SERIES_URL = "https://api.twelvedata.com/time_series";
const TWELVE_MARKET_MOVERS_URL = "https://api.twelvedata.com/market_movers/stocks";
const NASDAQ_HISTORICAL_URL = "https://api.nasdaq.com/api/quote";
const NASDAQ_SCREENER_URL = "https://api.nasdaq.com/api/screener/stocks";
const UA = "Mozilla/5.0 (compatible; FomoClubBot/1.0)";
const NASDAQ_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const US_DYNAMIC_UNIVERSE_LIMIT = 260;
const US_QUOTE_BATCH_SIZE = 80;
const US_SPARKLINE_LIMIT = 90;
const US_NASDAQ_SCREENER_LIMIT = 7000;
const US_NASDAQ_FALLBACK_LIMIT = 120;
const US_NASDAQ_FALLBACK_CONCURRENCY = 12;
const US_MOVER_TYPES = ["gainers", "losers", "most_active"] as const;

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

export interface UsMarketDiagnostics {
  seedCount: number;
  moverSymbols: number;
  quoteSymbols: number;
  rows: number;
  rowsWithPrice: number;
  rowsWithSparkline: number;
  dynamicRows: number;
  strongMomentumRows: number;
  source: "twelve-data" | "nasdaq-screener" | "nasdaq-fallback" | "seed";
}

interface TwelveTimeSeriesValue {
  datetime?: string;
  close?: string;
}

interface TwelveTimeSeries {
  symbol?: string;
  values?: TwelveTimeSeriesValue[];
}

interface NasdaqDailyPoint {
  date: string;
  close: number;
  volume?: number;
}

interface NasdaqScreenerRow {
  symbol?: string;
  name?: string;
  lastsale?: string;
  netchange?: string;
  pctchange?: string;
  volume?: string;
  marketCap?: string;
  country?: string;
  sector?: string;
  industry?: string;
}

function tdKey(): string | undefined {
  return process.env.TWELVE_DATA_API_KEY?.trim();
}

function num(value: string | number | undefined): number | undefined {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,%]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function money(value: number | undefined): string | undefined {
  if (typeof value !== "number") return undefined;
  return `$${value >= 100 ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : value.toFixed(2)}`;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size) as T[]);
  return out;
}

function marketFor(defMarket: string, exchange: string | undefined): DiscoveryMarket {
  if (defMarket === "NYSE" || /NYSE/i.test(exchange ?? "")) return "NYSE";
  return "NASDAQ";
}

function inferredSector(symbol: string, name: string | undefined, fallback = "미국주식"): string {
  const text = `${symbol} ${name ?? ""}`.toLowerCase();
  if (/\b(tsla|nio|xpev|li|lcid|rivn)\b|lucid|rivian|vehicle|automotive|electric/.test(text)) return "전기차";
  if (/\b(mara|riot|coin|mstr|hood)\b|bitcoin|crypto|coinbase|blockchain/.test(text)) return "크립토";
  if (/\b(ionq|rgti|qbts|qubt)\b|quantum|d-wave|rigetti/.test(text)) return "양자";
  if (/semiconductor|chip|micro|advanced micro|nvidia|broadcom|asml|tsmc|micron/.test(text)) return "반도체";
  if (/biotech|therapeutics|pharma|medicine|biologics|oncology|clinical/.test(text)) return "바이오";
  if (/\b(ai|pltr|soun|bbai|c3\.ai)\b|artificial|software|cloud|data|cyber|security/.test(text)) return "AI";
  if (/solar|energy|nuclear|uranium|power|renewable/.test(text)) return "에너지";
  if (/bank|insurance|financial|fintech|capital/.test(text)) return "금융";
  return fallback;
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
  return usSessionAsOfLabel(latestUsSessionDate(now));
}

function usSessionAsOfLabel(date: string): { date: string; label: string } {
  const [, month, day] = date.match(/^\d{4}-(\d{2})-(\d{2})$/) ?? [];
  return {
    date,
    label: month && day ? `${Number(month)}월 ${Number(day)}일(ET) 종가 기준` : `${date}(ET) 기준`,
  };
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index] as T) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
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

function isoFromNasdaqDate(value: string | undefined): string | undefined {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return undefined;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

function parseNasdaqHistorical(data: unknown): NasdaqDailyPoint[] {
  if (!data || typeof data !== "object") return [];
  const rows = (((data as Record<string, unknown>).data as Record<string, unknown> | undefined)?.tradesTable as Record<string, unknown> | undefined)
    ?.rows;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, unknown>;
      const date = isoFromNasdaqDate(String(record.date ?? ""));
      const close = num(String(record.close ?? ""));
      if (!date || typeof close !== "number") return null;
      const volume = num(String(record.volume ?? ""));
      return {
        date,
        close,
        ...(typeof volume === "number" ? { volume } : {}),
      } satisfies NasdaqDailyPoint;
    })
    .filter((row): row is NasdaqDailyPoint => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeNasdaqScreenerRows(data: unknown): NasdaqScreenerRow[] {
  if (!data || typeof data !== "object") return [];
  const rows = (((data as Record<string, unknown>).data as Record<string, unknown> | undefined)?.rows as unknown) ?? [];
  return Array.isArray(rows) ? (rows.filter((row) => row && typeof row === "object") as NasdaqScreenerRow[]) : [];
}

function isUsCommonLike(row: NasdaqScreenerRow): boolean {
  const symbol = String(row.symbol ?? "").toUpperCase();
  const name = String(row.name ?? "");
  const industry = String(row.industry ?? "");
  const country = String(row.country ?? "");
  const marketCap = num(row.marketCap);
  const price = num(row.lastsale);
  const volume = num(row.volume);
  if (!/^[A-Z]{1,5}$/.test(symbol)) return false;
  if (country && !/United States/i.test(country)) return false;
  if (!price || price <= 0) return false;
  if (!volume || volume < 50_000) return false;
  if (typeof marketCap === "number" && marketCap <= 0) return false;
  if (/Acquisition|Blank Checks?|SPAC|Warrant|Rights|Unit/i.test(`${name} ${industry}`)) return false;
  return true;
}

function sectorFromNasdaq(row: NasdaqScreenerRow): string {
  const symbol = String(row.symbol ?? "").toUpperCase();
  const sector = String(row.sector ?? "");
  const industry = String(row.industry ?? "");
  const mapped: Record<string, string> = {
    Technology: "AI",
    "Health Care": "바이오",
    Healthcare: "바이오",
    Industrials: "산업재",
    Finance: "금융",
    "Consumer Discretionary": "소비재",
    "Consumer Staples": "소비재",
    Energy: "에너지",
    Utilities: "에너지",
    Telecommunications: "통신",
    "Real Estate": "부동산",
  };
  return mapped[sector] ?? inferredSector(symbol, `${row.name ?? ""} ${sector} ${industry}`, sector || "미국주식");
}

function parseNasdaqScreenerRow(row: NasdaqScreenerRow): DiscoveryMarketRow | null {
  if (!isUsCommonLike(row)) return null;
  const symbol = String(row.symbol ?? "").toUpperCase();
  const price = num(row.lastsale);
  const pct = num(row.pctchange);
  const change = num(row.netchange);
  const volume = num(row.volume);
  const priceText = money(price);
  const session = latestUsSessionAsOf();
  const canonical = String(row.name ?? symbol)
    .replace(/\s+(Common Stock|Ordinary Shares?|American Depositary Shares?|Class [A-Z].*)\s*$/i, "")
    .trim();
  return {
    canonical: canonical || symbol,
    symbol,
    market: "NASDAQ",
    country: "US",
    currency: "USD",
    ...(volume ? { tradingValue: volume } : {}),
    ...(priceText ? { priceText } : {}),
    ...(typeof pct === "number" ? { changePct: pct } : {}),
    ...(typeof pct === "number" || typeof change === "number"
      ? { changeText: `${typeof change === "number" ? `${change > 0 ? "+" : ""}${change.toFixed(2)}` : ""}${typeof pct === "number" ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(2)}%)` : ""}`.trim() }
      : {}),
    changeDir: typeof pct === "number" ? (pct > 0 ? "up" : pct < 0 ? "down" : "flat") : "flat",
    sectorHint: sectorFromNasdaq(row),
    sessionLabel: session.label,
  };
}

function mergeCuratedSeed(row: DiscoveryMarketRow, seed: UsDiscoverySymbol): DiscoveryMarketRow {
  return {
    ...row,
    canonical: seed.canonical,
    market: marketFor(seed.market, row.market),
    sectorHint: seed.sector,
    ...(seed.fameRank ? { marketCapRank: seed.fameRank, marketCapRankSource: "curated" as const } : {}),
  };
}

function curatedScreenerRows(rows: readonly DiscoveryMarketRow[], seeds: readonly UsDiscoverySymbol[]): DiscoveryMarketRow[] {
  const seedBySymbol = new Map(seeds.map((seed) => [seed.symbol.toUpperCase(), seed]));
  return rows
    .map((row) => {
      const seed = seedBySymbol.get(row.symbol.toUpperCase());
      return seed ? mergeCuratedSeed(row, seed) : null;
    })
    .filter((row): row is DiscoveryMarketRow => row !== null);
}

function nasdaqMoverScore(row: DiscoveryMarketRow): number {
  const pct = Math.abs(row.changePct ?? 0);
  const volume = Math.log10(Math.max(1, row.tradingValue ?? 0));
  return pct * 10 + volume;
}

async function fetchNasdaqScreenerRows(): Promise<DiscoveryMarketRow[]> {
  const url = new URL(NASDAQ_SCREENER_URL);
  url.searchParams.set("tableonly", "true");
  url.searchParams.set("limit", String(US_NASDAQ_SCREENER_LIMIT));
  url.searchParams.set("offset", "0");
  url.searchParams.set("download", "true");
  const res = await fetch(url.toString(), {
    headers: {
      accept: "application/json, text/plain, */*",
      "user-agent": NASDAQ_UA,
      origin: "https://www.nasdaq.com",
      referer: "https://www.nasdaq.com/",
    },
    signal: AbortSignal.timeout(8_000),
    next: { revalidate: 900 },
  });
  if (!res.ok) return [];
  const deduped = new Map<string, DiscoveryMarketRow>();
  for (const row of normalizeNasdaqScreenerRows(await res.json())) {
    const parsed = parseNasdaqScreenerRow(row);
    if (parsed) deduped.set(parsed.symbol.toUpperCase(), parsed);
  }
  return [...deduped.values()]
    .sort((a, b) => {
      const byScore = nasdaqMoverScore(b) - nasdaqMoverScore(a);
      return byScore !== 0 ? byScore : a.symbol.localeCompare(b.symbol);
    })
    .slice(0, US_DYNAMIC_UNIVERSE_LIMIT);
}

function parseNasdaqRow(seed: UsDiscoverySymbol, points: readonly NasdaqDailyPoint[]): DiscoveryMarketRow | null {
  const valid = points.filter((point) => Number.isFinite(point.close));
  if (valid.length < 2) return null;
  const latest = valid.at(-1);
  const previous = valid.at(-2);
  if (!latest || !previous) return null;
  const change = latest.close - previous.close;
  const pct = previous.close !== 0 ? (change / previous.close) * 100 : undefined;
  const session = usSessionAsOfLabel(latest.date);
  const sparkline = valid.slice(-42).map((point) => point.close);
  const priceText = money(latest.close);
  return {
    canonical: seed.canonical,
    symbol: seed.symbol,
    market: marketFor(seed.market, undefined),
    country: "US",
    currency: "USD",
    ...(seed.fameRank ? { marketCapRank: seed.fameRank, marketCapRankSource: "curated" as const } : {}),
    ...(priceText ? { priceText } : {}),
    ...(typeof pct === "number" ? { changePct: pct } : {}),
    changeText: `${change > 0 ? "+" : ""}${change.toFixed(2)} (${typeof pct === "number" ? `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%` : "0.00%"})`,
    changeDir: change > 0 ? "up" : change < 0 ? "down" : "flat",
    ...(typeof latest.volume === "number" ? { tradingValue: latest.volume } : {}),
    ...(sparkline.length >= 2 ? { sparkline } : {}),
    sectorHint: seed.sector,
    sessionLabel: session.label,
  };
}

function historyRange(): { from: string; to: string } {
  const to = latestUsSessionDate();
  const fromDate = new Date(`${to}T12:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - 120);
  return { from: fromDate.toISOString().slice(0, 10), to };
}

async function fetchNasdaqDaily(seed: UsDiscoverySymbol): Promise<DiscoveryMarketRow | null> {
  const { from, to } = historyRange();
  const url = new URL(`${NASDAQ_HISTORICAL_URL}/${encodeURIComponent(seed.symbol)}/historical`);
  url.searchParams.set("assetclass", "stocks");
  url.searchParams.set("fromdate", from);
  url.searchParams.set("todate", to);
  url.searchParams.set("limit", "42");
  const res = await fetch(url.toString(), {
    headers: {
      accept: "application/json, text/plain, */*",
      "user-agent": NASDAQ_UA,
      origin: "https://www.nasdaq.com",
      referer: "https://www.nasdaq.com/",
    },
    signal: AbortSignal.timeout(4_000),
    next: { revalidate: 1_800 },
  });
  if (!res.ok) return null;
  return parseNasdaqRow(seed, parseNasdaqHistorical(await res.json()));
}

async function fetchNasdaqRows(seeds: readonly UsDiscoverySymbol[]): Promise<DiscoveryMarketRow[]> {
  const settled = await mapLimit(seeds.slice(0, US_NASDAQ_FALLBACK_LIMIT), US_NASDAQ_FALLBACK_CONCURRENCY, fetchNasdaqDaily);
  return settled
    .filter((row): row is PromiseFulfilledResult<DiscoveryMarketRow | null> => row.status === "fulfilled")
    .map((row) => row.value)
    .filter((row): row is DiscoveryMarketRow => row !== null);
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
  for (const type of US_MOVER_TYPES) {
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

async function fetchQuoteBatches(symbols: readonly string[], key: string): Promise<Record<string, TwelveQuote>> {
  const out: Record<string, TwelveQuote> = {};
  const settled = await Promise.allSettled(chunks(symbols, US_QUOTE_BATCH_SIZE).map((batch) => fetchQuotes(batch, key)));
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    Object.assign(out, result.value);
  }
  return out;
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

async function fetchSparklineBatches(symbols: readonly string[], key: string): Promise<Record<string, number[]>> {
  const out: Record<string, number[]> = {};
  const settled = await Promise.allSettled(chunks(symbols, US_QUOTE_BATCH_SIZE).map((batch) => fetchSparklines(batch, key)));
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    Object.assign(out, result.value);
  }
  return out;
}

function buildDynamicSeed(symbol: string, quote: TwelveQuote | undefined): UsDiscoverySymbol {
  const upper = symbol.toUpperCase();
  const canonical = quote?.name?.trim() || upper;
  return {
    canonical,
    symbol: upper,
    market: /NYSE/i.test(quote?.exchange ?? "") ? "NYSE" : "NASDAQ",
    sector: inferredSector(upper, quote?.name),
  };
}

function strongMomentumRows(rows: readonly DiscoveryMarketRow[]): number {
  return rows.filter((row) => Math.abs(row.changePct ?? 0) >= 7).length;
}

function mergeSparkline(row: DiscoveryMarketRow, fallback: DiscoveryMarketRow | undefined): DiscoveryMarketRow {
  if (!fallback?.sparkline || (row.sparkline?.length ?? 0) >= 2) return row;
  return {
    ...row,
    sparkline: fallback.sparkline,
    ...(fallback.sessionLabel ? { sessionLabel: fallback.sessionLabel } : {}),
  };
}

function mergePreferredRows(primary: readonly DiscoveryMarketRow[], fallback: readonly DiscoveryMarketRow[]): DiscoveryMarketRow[] {
  const primarySymbols = new Set(primary.map((row) => row.symbol.toUpperCase()));
  const rowsBySymbol = new Map<string, DiscoveryMarketRow>();

  for (const row of fallback) {
    rowsBySymbol.set(row.symbol.toUpperCase(), row);
  }
  for (const row of primary) {
    const key = row.symbol.toUpperCase();
    rowsBySymbol.set(key, mergeSparkline(row, rowsBySymbol.get(key)));
  }

  return [...rowsBySymbol.values()].sort((a, b) => {
    const aPrimary = primarySymbols.has(a.symbol.toUpperCase());
    const bPrimary = primarySymbols.has(b.symbol.toUpperCase());
    if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
    const aRank = a.marketCapRank ?? 9999;
    const bRank = b.marketCapRank ?? 9999;
    if (aRank !== bRank) return aRank - bRank;
    return a.symbol.localeCompare(b.symbol);
  });
}

async function fetchUsMarketRowsInternal(): Promise<{ rows: DiscoveryMarketRow[]; diagnostics: UsMarketDiagnostics }> {
  const key = tdKey();
  const seeds = usDiscoveryUniverse();
  const seedSymbols = new Set(seeds.map((seed) => seed.symbol.toUpperCase()));
  const fallbackDiagnostics = (rows: DiscoveryMarketRow[], source: UsMarketDiagnostics["source"]): UsMarketDiagnostics => ({
    seedCount: seeds.length,
    moverSymbols: 0,
    quoteSymbols: rows.length,
    rows: rows.length,
    rowsWithPrice: rows.filter((row) => typeof row.changePct === "number" || row.priceText).length,
    rowsWithSparkline: rows.filter((row) => (row.sparkline?.length ?? 0) >= 2).length,
    dynamicRows: rows.filter((row) => !seedSymbols.has(row.symbol.toUpperCase())).length,
    strongMomentumRows: strongMomentumRows(rows),
    source,
  });

  if (!key) {
    const screenerRows = curatedScreenerRows(await fetchNasdaqScreenerRows().catch((): DiscoveryMarketRow[] => []), seeds);
    if (screenerRows.length > 0) {
      const nasdaqRows = await fetchNasdaqRows(seeds).catch((): DiscoveryMarketRow[] => []);
      const rows = mergePreferredRows(screenerRows, nasdaqRows);
      return {
        rows,
        diagnostics: {
          ...fallbackDiagnostics(rows, "nasdaq-screener"),
          moverSymbols: screenerRows.length,
          quoteSymbols: rows.length,
          dynamicRows: screenerRows.length,
        },
      };
    }
    const nasdaqRows = await fetchNasdaqRows(seeds).catch((): DiscoveryMarketRow[] => []);
    const rows = nasdaqRows.length > 0 ? nasdaqRows : seedRows();
    return { rows, diagnostics: fallbackDiagnostics(rows, nasdaqRows.length > 0 ? "nasdaq-fallback" : "seed") };
  }
  const bySymbol = new Map(seeds.map((seed) => [seed.symbol.toUpperCase(), seed]));
  try {
    const moverSymbols = (await fetchMoverSymbols(key)).filter((symbol) => bySymbol.has(symbol.toUpperCase()));
    const symbols = [...new Set([...moverSymbols, ...seeds.map((seed) => seed.symbol)])]
      .filter((symbol) => /^[A-Z.]{1,6}$/.test(symbol))
      .slice(0, US_DYNAMIC_UNIVERSE_LIMIT);
    if (symbols.length === 0) {
      const rows = seedRows();
      return { rows, diagnostics: fallbackDiagnostics(rows, "seed") };
    }
    const [quotes, sparklines] = await Promise.all([
      fetchQuoteBatches(symbols, key),
      fetchSparklineBatches(symbols.slice(0, US_SPARKLINE_LIMIT), key).catch((): Record<string, number[]> => ({})),
    ]);
    const rows: DiscoveryMarketRow[] = [];
    for (const symbol of symbols) {
      const upper = symbol.toUpperCase();
      const quote = quotes[upper];
      const seed = bySymbol.get(upper) ?? usDiscoverySeedForSymbol(upper) ?? buildDynamicSeed(upper, quote);
      const row = parseQuote(seed, quote, sparklines[upper]);
      if (row) rows.push(row);
    }
    if (rows.length === 0) {
      const nasdaqRows = await fetchNasdaqRows(seeds).catch((): DiscoveryMarketRow[] => []);
      const fallbackRows = nasdaqRows.length > 0 ? nasdaqRows : seedRows();
      return { rows: fallbackRows, diagnostics: fallbackDiagnostics(fallbackRows, nasdaqRows.length > 0 ? "nasdaq-fallback" : "seed") };
    }
    let hydratedRows = rows;
    if (Object.keys(sparklines).length === 0) {
      const nasdaqRows = await fetchNasdaqRows(seeds).catch((): DiscoveryMarketRow[] => []);
      const nasdaqBySymbol = new Map(nasdaqRows.map((row) => [row.symbol.toUpperCase(), row]));
      hydratedRows = rows.map((row) => {
        const fallback = nasdaqBySymbol.get(row.symbol.toUpperCase());
        return fallback?.sparkline && (row.sparkline?.length ?? 0) < 2 ? { ...row, sparkline: fallback.sparkline } : row;
      });
    }
    return {
      rows: hydratedRows,
      diagnostics: {
        seedCount: seeds.length,
        moverSymbols: moverSymbols.length,
        quoteSymbols: symbols.length,
        rows: hydratedRows.length,
        rowsWithPrice: hydratedRows.filter((row) => typeof row.changePct === "number" || row.priceText).length,
        rowsWithSparkline: hydratedRows.filter((row) => (row.sparkline?.length ?? 0) >= 2).length,
        dynamicRows: hydratedRows.filter((row) => moverSymbols.includes(row.symbol.toUpperCase())).length,
        strongMomentumRows: strongMomentumRows(hydratedRows),
        source: "twelve-data",
      },
    };
  } catch (err) {
    console.warn("[us-market-source] Twelve Data quote failed", (err as Error)?.message);
    const screenerRows = curatedScreenerRows(await fetchNasdaqScreenerRows().catch((): DiscoveryMarketRow[] => []), seeds);
    if (screenerRows.length > 0) {
      const nasdaqRows = await fetchNasdaqRows(seeds).catch((): DiscoveryMarketRow[] => []);
      const rows = mergePreferredRows(screenerRows, nasdaqRows);
      return {
        rows,
        diagnostics: {
          ...fallbackDiagnostics(rows, "nasdaq-screener"),
          moverSymbols: screenerRows.length,
          quoteSymbols: rows.length,
          dynamicRows: screenerRows.length,
        },
      };
    }
    const nasdaqRows = await fetchNasdaqRows(seeds).catch((): DiscoveryMarketRow[] => []);
    const rows = nasdaqRows.length > 0 ? nasdaqRows : seedRows();
    return { rows, diagnostics: fallbackDiagnostics(rows, nasdaqRows.length > 0 ? "nasdaq-fallback" : "seed") };
  }
}

/**
 * US quote adapter. Twelve Data is used because Yahoo chart endpoints are unstable from Node/undici.
 * If the key is absent or the upstream fails, return a verified seed universe without price data.
 * We never synthesize quotes: price/change fields are present only when a live source returns them.
 */
export async function fetchUsMarketRows(): Promise<DiscoveryMarketRow[]> {
  return (await fetchUsMarketRowsInternal()).rows;
}

export async function fetchUsMarketDiagnostics(): Promise<UsMarketDiagnostics> {
  return (await fetchUsMarketRowsInternal()).diagnostics;
}
