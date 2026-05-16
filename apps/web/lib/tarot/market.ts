import type { MarketCondition, MarketSnapshot } from "@taro/core";

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const USER_AGENT = "Mozilla/5.0 (compatible; TarotStockBot/1.0)";

interface YahooQuote {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  shortName?: string;
  longName?: string;
  symbol?: string;
}

interface YahooChartResult {
  meta?: {
    regularMarketPrice?: number;
    previousClose?: number;
    regularMarketVolume?: number;
    shortName?: string;
  };
  indicators?: {
    quote?: Array<{
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
  timestamp?: number[];
}

function inferCondition(changePercent: number, rsi: number | undefined): MarketCondition {
  if (rsi !== undefined) {
    if (rsi >= 70) return "bullish";
    if (rsi <= 30) return "bearish";
  }
  if (changePercent >= 3) return "bullish";
  if (changePercent <= -3) return "bearish";
  if (Math.abs(changePercent) <= 0.5) return "consolidating";
  return "neutral";
}

function calcRsi(closes: number[], period = 14): number | undefined {
  if (closes.length < period + 1) return undefined;
  const recent = closes.slice(-period - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = (recent[i] ?? 0) - (recent[i - 1] ?? 0);
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}

export async function fetchMarketSnapshot(
  ticker: string,
  market: "US" | "KR"
): Promise<MarketSnapshot> {
  const symbol = market === "KR" && !ticker.includes(".")
    ? `${ticker}.KS`
    : ticker;

  const url = new URL(`${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "3mo");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includePrePost", "false");

  const res = await fetch(url.toString(), {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(8_000),
    next: { revalidate: 300 },
  });

  if (!res.ok) throw new Error(`Yahoo chart ${res.status}`);

  const payload = (await res.json()) as { chart?: { result?: YahooChartResult[] } };
  const result = payload.chart?.result?.[0];
  const meta = result?.meta;
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp ?? [];

  const closes = (quote?.close ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const price = meta?.regularMarketPrice ?? closes[closes.length - 1] ?? 0;
  const prevClose = meta?.previousClose ?? (closes[closes.length - 2] ?? price);
  const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  const volume = meta?.regularMarketVolume ?? 0;
  const rsi = calcRsi(closes);
  const condition = inferCondition(changePercent, rsi);

  const conditionLabel: Record<MarketCondition, string> = {
    bullish: "강세",
    bearish: "약세",
    volatile: "변동성 확대",
    neutral: "중립",
    consolidating: "횡보",
  };

  const snapshot: MarketSnapshot = {
    ticker,
    market,
    price,
    changePercent: parseFloat(changePercent.toFixed(2)),
    volume,
    condition,
    summary: `${ticker} ${price.toLocaleString()} (${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%) — ${conditionLabel[condition]}`,
  };
  if (rsi !== undefined) snapshot.rsi = rsi;
  return snapshot;
}
