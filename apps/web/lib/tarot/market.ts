import type { MarketCondition, MarketSnapshot } from "@taro/core";
import {
  calculateRsi,
  calculateMacd,
  latestAverage,
} from "@trading/shared/src/researchLive";

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const USER_AGENT = "Mozilla/5.0 (compatible; TarotStockBot/1.0)";

// in-memory 시장 데이터 캐시 — Yahoo Finance 중복 호출 방지 (TTL: 5분)
const MARKET_CACHE_TTL_MS = 5 * 60 * 1000;
const marketCache = new Map<string, { snapshot: MarketSnapshot; expiresAt: number }>();

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
      high?: Array<number | null>;
      low?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
  timestamp?: number[];
}

function calcBollingerBands(
  closes: number[],
  period = 20,
  stdDev = 2
): { upper: number; middle: number; lower: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance) * stdDev;
  return { upper: mean + sd, middle: mean, lower: mean - sd };
}

function inferCondition(
  changePercent: number,
  rsi: number | null,
  macdHistogram: number | null,
  price: number,
  sma20: number | null,
  bbUpper: number | null,
  bbLower: number | null
): MarketCondition {
  let bullScore = 0;
  let bearScore = 0;

  // RSI
  if (rsi !== null) {
    if (rsi >= 70) bullScore += 2;
    else if (rsi >= 55) bullScore += 1;
    else if (rsi <= 30) bearScore += 2;
    else if (rsi <= 45) bearScore += 1;
  }

  // MACD histogram 방향
  if (macdHistogram !== null) {
    if (macdHistogram > 0) bullScore += 1;
    else if (macdHistogram < 0) bearScore += 1;
  }

  // 가격 vs SMA20
  if (sma20 !== null) {
    if (price > sma20) bullScore += 1;
    else bearScore += 1;
  }

  // 일간 등락률
  if (changePercent >= 3) bullScore += 2;
  else if (changePercent >= 1) bullScore += 1;
  else if (changePercent <= -3) bearScore += 2;
  else if (changePercent <= -1) bearScore += 1;

  // 볼린저밴드 — 밴드 밖이면 volatile
  if (bbUpper !== null && bbLower !== null) {
    if (price > bbUpper || price < bbLower) return "volatile";
  }

  const net = bullScore - bearScore;
  if (net >= 3) return "bullish";
  if (net <= -3) return "bearish";
  if (Math.abs(changePercent) <= 0.5 && Math.abs(net) <= 1) return "consolidating";
  if (net > 0) return "bullish";
  if (net < 0) return "bearish";
  return "neutral";
}

export async function fetchMarketSnapshot(
  ticker: string,
  market: "US" | "KR"
): Promise<MarketSnapshot> {
  const cacheKey = `${ticker}:${market}`;
  const now = Date.now();
  const hit = marketCache.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit.snapshot;

  const symbol = market === "KR" && !ticker.includes(".")
    ? `${ticker}.KS`
    : ticker;

  const url = new URL(`${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "1y");
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

  const closes = (quote?.close ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const highs = (quote?.high ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const lows = (quote?.low ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const price = meta?.regularMarketPrice ?? closes[closes.length - 1] ?? 0;
  const prevClose = meta?.previousClose ?? (closes[closes.length - 2] ?? price);
  const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  const volume = meta?.regularMarketVolume ?? 0;

  // --- 기술적 지표 (researchLive.ts 함수 재사용) ---
  const rsi = calculateRsi(closes, 14);
  const macd = calculateMacd(closes);
  const sma20 = latestAverage(closes, 20);
  const sma50 = latestAverage(closes, 50);
  const sma200 = latestAverage(closes, 200);
  const bb = calcBollingerBands(closes);

  // 지지/저항 (최근 20봉 기준)
  const recentHighs = highs.slice(-20);
  const recentLows = lows.slice(-20);
  const support20 = recentLows.length > 0 ? Math.min(...recentLows) : undefined;
  const resistance20 = recentHighs.length > 0 ? Math.max(...recentHighs) : undefined;

  // 52주 위치 — 1년 데이터의 high/low 범위 내 현재 가격 위치 (0~1)
  let fiftyTwoWeekPosition: number | undefined;
  if (highs.length > 0 && lows.length > 0) {
    const high52 = Math.max(...highs);
    const low52 = Math.min(...lows);
    const range = high52 - low52;
    if (range > 0) {
      fiftyTwoWeekPosition = Math.min(1, Math.max(0, (price - low52) / range));
    }
  }

  const condition = inferCondition(
    changePercent, rsi, macd.histogram, price, sma20, bb?.upper ?? null, bb?.lower ?? null
  );

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

  // optional 필드는 값 있을 때만 세팅
  if (rsi !== null) snapshot.rsi = rsi;
  if (macd.macd !== null) snapshot.macd = macd.macd;
  if (macd.signal !== null) snapshot.macdSignal = macd.signal;
  if (macd.histogram !== null) snapshot.macdHistogram = macd.histogram;
  if (sma20 !== null) snapshot.sma20 = sma20;
  if (sma50 !== null) snapshot.sma50 = sma50;
  if (sma200 !== null) snapshot.sma200 = sma200;
  if (bb) {
    snapshot.bbUpper = bb.upper;
    snapshot.bbMiddle = bb.middle;
    snapshot.bbLower = bb.lower;
  }
  if (support20 !== undefined) snapshot.support20 = support20;
  if (resistance20 !== undefined) snapshot.resistance20 = resistance20;

  // 종목 정체성 — chart meta로부터 즉시 채울 수 있는 것만. sector/industry/marketCap은 별도 API 통합 후 추가 예정.
  if (meta?.shortName) snapshot.name = meta.shortName;
  if (fiftyTwoWeekPosition !== undefined) snapshot.fiftyTwoWeekPosition = fiftyTwoWeekPosition;

  // 시간축(trajectory) 메트릭 — 신호 엔진(computeSignal) 접지용. 1y 캔들에서 파생.
  if (closes.length >= 21) {
    const past = closes[closes.length - 21];
    if (past && past > 0) {
      snapshot.momentum20 = parseFloat((((price - past) / past) * 100).toFixed(1));
    }
  }
  if (sma200 !== null) {
    // 현재 200일선 위를 연속으로 유지한 봉 수(근사 — 현 SMA200 기준 최근 연속).
    let days = 0;
    for (let i = closes.length - 1; i >= 0; i--) {
      if ((closes[i] ?? 0) >= sma200) days++;
      else break;
    }
    if (days > 0) snapshot.daysAboveSma200 = days;
  }

  marketCache.set(cacheKey, { snapshot, expiresAt: now + MARKET_CACHE_TTL_MS });
  return snapshot;
}
