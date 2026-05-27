import { NextRequest, NextResponse } from "next/server";
import type { StockQuote } from "@trading/shared/src/stockTypes";

const YAHOO_QUOTE_URL = "https://query2.finance.yahoo.com/v10/finance/quoteSummary";
const USER_AGENT = "Mozilla/5.0 (compatible; TarotStockBot/1.0)";

// 캐시 TTL: 장중 30초 / 장외 5분 (Yahoo marketState 기준)
const CACHE_TTL_REGULAR_MS = 30 * 1000;
const CACHE_TTL_OFF_HOURS_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: StockQuote; completeness: string; expiresAt: number }>();

// 결측 가능 필드 — 외부 데이터 소스에서 누락 시 null. 0과 결측을 구분.
const NULLABLE_FIELDS = ["dayLow", "dayHigh", "fiftyTwoWeekLow", "fiftyTwoWeekHigh", "marketCap"] as const;

function extractNum(obj: unknown): number | null {
  if (obj && typeof obj === "object" && "raw" in obj) {
    const raw = (obj as { raw?: unknown }).raw;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  }
  if (typeof obj === "number" && Number.isFinite(obj)) return obj;
  return null;
}

function logMissing(symbol: string, fields: readonly string[]): void {
  if (fields.length === 0) return;
  for (const field of fields) {
    console.warn(JSON.stringify({ metric: "quote_field_missing", symbol, field }));
  }
}

function pickCacheTtl(marketState: string | null): number {
  return marketState === "REGULAR" ? CACHE_TTL_REGULAR_MS : CACHE_TTL_OFF_HOURS_MS;
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const now = Date.now();
  const hit = cache.get(symbol);
  if (hit && hit.expiresAt > now) {
    return NextResponse.json(hit.data, {
      headers: { "X-Data-Completeness": hit.completeness, "X-Cache": "HIT" },
    });
  }

  try {
    const modules = "price,summaryDetail,defaultKeyStatistics,financialData";
    const url = `${YAHOO_QUOTE_URL}/${encodeURIComponent(symbol)}?modules=${modules}`;
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo API error ${res.status}` },
        { status: 502 }
      );
    }

    const payload = await res.json() as {
      quoteSummary?: {
        result?: Array<{
          price?: Record<string, unknown>;
          summaryDetail?: Record<string, unknown>;
          defaultKeyStatistics?: Record<string, unknown>;
          financialData?: Record<string, unknown>;
        }>;
      };
    };

    const result = payload.quoteSummary?.result?.[0];
    if (!result) {
      return NextResponse.json({ error: "No data found" }, { status: 404 });
    }

    const price = result.price ?? {};
    const summary = result.summaryDetail ?? {};
    const keyStats = result.defaultKeyStatistics ?? {};
    const financialData = result.financialData ?? {};

    const currentPrice = extractNum(price.regularMarketPrice) ?? 0;
    const previousClose = extractNum(price.regularMarketPreviousClose) ?? 0;
    const change = extractNum(price.regularMarketChange) ?? (currentPrice - previousClose);
    const changePercent = extractNum(price.regularMarketChangePercent) ??
      (previousClose ? ((currentPrice - previousClose) / previousClose) * 100 : 0);

    const dayLow = extractNum(summary.dayLow);
    const dayHigh = extractNum(summary.dayHigh);
    const fiftyTwoWeekLow = extractNum(summary.fiftyTwoWeekLow);
    const fiftyTwoWeekHigh = extractNum(summary.fiftyTwoWeekHigh);
    const marketCap = extractNum(price.marketCap);

    const quote: StockQuote = {
      symbol,
      shortName: (price.shortName as string) ?? symbol,
      longName: (price.longName as string) ?? (price.shortName as string) ?? symbol,
      currency: (price.currency as string) ?? "USD",
      exchange: (price.exchangeName as string) ?? "",
      currentPrice,
      previousClose,
      change,
      changePercent,
      dayLow,
      dayHigh,
      fiftyTwoWeekLow,
      fiftyTwoWeekHigh,
      marketCap,
      trailingPE: extractNum(summary.trailingPE),
      forwardPE: extractNum(keyStats.forwardPE) ?? extractNum(summary.forwardPE),
      priceToBook: extractNum(keyStats.priceToBook),
      dividendYield: extractNum(summary.dividendYield),
      volume: extractNum(summary.volume) ?? 0,
      averageVolume: extractNum(summary.averageVolume) ?? 0,
      returnOnEquity: extractNum(financialData.returnOnEquity),
      grossMargins: extractNum(financialData.grossMargins),
      operatingMargins: extractNum(financialData.operatingMargins),
      totalRevenue: extractNum(financialData.totalRevenue),
      revenueGrowth: extractNum(financialData.revenueGrowth),
      debtToEquity: extractNum(financialData.debtToEquity),
      dataAt: new Date(now).toISOString(),
    };

    // 결측치 추적: null인 필드 목록
    const missing = NULLABLE_FIELDS.filter((f) => quote[f] === null);
    logMissing(symbol, missing);

    const completeness = missing.length === 0 ? "full" : missing.join(",");
    const marketState = (price.marketState as string | undefined) ?? null;
    const ttl = pickCacheTtl(marketState);

    cache.set(symbol, { data: quote, completeness, expiresAt: now + ttl });

    return NextResponse.json(quote, {
      headers: { "X-Data-Completeness": completeness, "X-Cache": "MISS" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
