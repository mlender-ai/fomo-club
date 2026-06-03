import { NextRequest, NextResponse } from "next/server";
import type { StockChartResponse } from "@trading/shared/src/stockTypes";
import { VALID_RANGES, RANGE_INTERVAL_MAP, fetchChartBars } from "@/lib/tarot/chartProviders";

// 5분 in-memory 캐시 — 성공(비어있지 않은) 응답만 저장. 에러/빈응답은 캐시하지 않음.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: StockChartResponse; expiresAt: number }>();

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const range = req.nextUrl.searchParams.get("range") ?? "3mo";
  if (!VALID_RANGES.includes(range)) {
    return NextResponse.json({ error: `Invalid range. Valid: ${VALID_RANGES.join(",")}` }, { status: 400 });
  }

  const interval = req.nextUrl.searchParams.get("interval") ?? RANGE_INTERVAL_MAP[range] ?? "1d";
  const cacheKey = `${symbol}:${range}:${interval}`;

  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    return NextResponse.json(hit.data);
  }

  try {
    // Yahoo → Stooq 폴백 체인
    const data = await fetchChartBars(symbol, range, interval);
    if (!data || data.bars.length === 0) {
      // 빈응답은 캐시하지 않음 — 다음 요청에서 재시도 가능
      console.warn(`[chart] no data for ${symbol} (${range}/${interval})`);
      return NextResponse.json({ error: "No chart data available" }, { status: 404 });
    }
    cache.set(cacheKey, { data, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn(`[chart] error for ${symbol}: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
