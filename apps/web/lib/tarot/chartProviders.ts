import type { StockChartBar, StockChartResponse } from "@trading/shared/src/stockTypes";

/**
 * 차트 데이터 제공자 체인 — Yahoo Finance(주) → Stooq(무키 폴백).
 *
 * Yahoo 가 서버리스/데이터센터 IP에 403/429를 내거나 빈 응답을 주는 경우가 잦아,
 * 무키·무계정 CSV 소스(Stooq)로 폴백한다. 순수 헬퍼(파싱·매핑·range)는
 * apps/web/__tests__/chart-providers.test.ts 에서 vitest 로 검증한다.
 */

export const VALID_RANGES = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"];

export const RANGE_INTERVAL_MAP: Record<string, string> = {
  "1d": "5m",
  "5d": "15m",
  "1mo": "1d",
  "3mo": "1d",
  "6mo": "1d",
  "1y": "1wk",
  "2y": "1wk",
  "5y": "1mo",
  max: "1mo",
};

/** range 를 대략적인 일수로 — Stooq 일봉 tail 슬라이스에 사용. */
export function rangeToDays(range: string): number {
  switch (range) {
    case "1d": return 2;
    case "5d": return 7;
    case "1mo": return 31;
    case "3mo": return 93;
    case "6mo": return 186;
    case "1y": return 370;
    case "2y": return 740;
    case "5y": return 1830;
    default: return 100000; // max
  }
}

const BROWSER_HEADERS: Record<string, string> = {
  accept: "application/json,text/plain,*/*",
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

/** 입력 심볼을 Stooq 심볼로 매핑. 6자리 숫자(.KS/.KQ 포함)=KR, 그 외=US. */
export function toStooqSymbol(symbol: string): { stooq: string; market: "US" | "KR" } {
  const cleaned = symbol.trim();
  const digits = cleaned.replace(/\.(KS|KQ)$/i, "");
  if (/^\d{6}$/.test(digits)) {
    return { stooq: `${digits}.kr`, market: "KR" };
  }
  return { stooq: `${cleaned.toLowerCase()}.us`, market: "US" };
}

/** Stooq 일봉 CSV(Date,Open,High,Low,Close,Volume) → StockChartBar[]. */
export function parseStooqCsv(csv: string): StockChartBar[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0]!.toLowerCase();
  if (!header.startsWith("date")) return [];
  const bars: StockChartBar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(",");
    if (cols.length < 5) continue;
    const [date, o, h, l, c, v] = cols;
    if (!date || c == null || c.trim() === "") continue; // 빈 종가(Number("")===0) 방지
    const close = Number(c);
    if (!Number.isFinite(close)) continue;
    const open = Number(o);
    const high = Number(h);
    const low = Number(l);
    const volume = Number(v);
    bars.push({
      date: `${date}T00:00:00.000Z`,
      open: Number.isFinite(open) ? open : close,
      high: Number.isFinite(high) ? high : close,
      low: Number.isFinite(low) ? low : close,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  return bars;
}

interface YahooChartResult {
  meta?: { currency?: string; symbol?: string; exchangeName?: string };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
}

function parseYahoo(result: YahooChartResult, fallbackSymbol: string): StockChartResponse | null {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  if (!quote || timestamps.length === 0) return null;
  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];
  const bars: StockChartBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    bars.push({
      date: new Date(timestamps[i]! * 1000).toISOString(),
      open: opens[i] ?? c,
      high: highs[i] ?? c,
      low: lows[i] ?? c,
      close: c,
      volume: volumes[i] ?? 0,
    });
  }
  if (bars.length === 0) return null;
  const meta: StockChartResponse["meta"] = {
    currency: result.meta?.currency ?? "USD",
    symbol: result.meta?.symbol ?? fallbackSymbol,
  };
  if (result.meta?.exchangeName) meta.exchangeName = result.meta.exchangeName;
  return { bars, meta };
}

/** Yahoo 차트 — query1 실패 시 query2 재시도. 실패/빈응답이면 null. */
export async function fetchYahooBars(
  symbol: string,
  range: string,
  interval: string,
): Promise<StockChartResponse | null> {
  for (const host of ["query1", "query2"]) {
    try {
      const url = new URL(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
      url.searchParams.set("range", range);
      url.searchParams.set("interval", interval);
      url.searchParams.set("includePrePost", "false");
      const res = await fetch(url.toString(), {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      const payload = (await res.json()) as { chart?: { result?: YahooChartResult[] } };
      const result = payload.chart?.result?.[0];
      if (!result) continue;
      const parsed = parseYahoo(result, symbol);
      if (parsed) return parsed;
    } catch {
      // 다음 호스트 시도
    }
  }
  return null;
}

/** Stooq 무키 일봉 폴백. range 일수만큼 tail 슬라이스. 실패/빈응답이면 null. */
export async function fetchStooqBars(symbol: string, range: string): Promise<StockChartResponse | null> {
  const { stooq, market } = toStooqSymbol(symbol);
  try {
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooq)}&i=d`;
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const csv = await res.text();
    let bars = parseStooqCsv(csv);
    if (bars.length === 0) return null;
    const days = rangeToDays(range);
    if (bars.length > days) bars = bars.slice(-days);
    return { bars, meta: { currency: market === "KR" ? "KRW" : "USD", symbol } };
  } catch {
    return null;
  }
}

/** 제공자 체인: Yahoo → Stooq. 둘 다 실패면 null. */
export async function fetchChartBars(
  symbol: string,
  range: string,
  interval: string,
): Promise<StockChartResponse | null> {
  const yahoo = await fetchYahooBars(symbol, range, interval);
  if (yahoo && yahoo.bars.length > 0) return yahoo;
  return fetchStooqBars(symbol, range);
}
