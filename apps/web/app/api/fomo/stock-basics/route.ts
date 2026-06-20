import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import type { StockBasics } from "@fomo/core";
import { withCors, kstDate, cacheVersion } from "../../../../lib/fomo";
import { fetchStockBasics } from "../../../../lib/stock-basics";

/**
 * 종목 기본 정보(바닥) API — STOCK_SCREEN_REDESIGN. 읽기 전용.
 * 주가·회사개요·시총·핵심지표·연간 재무 = DB 객관 사실(원문 grounding 무관) → 항상 깔리는 바닥.
 * (KST날짜, 종목) 캐시로 네이버 호출 절약. 정직: 없는 값은 omit(가짜 숫자 금지).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

const REVALIDATE_S = 21_600; // 6h (가격은 약간 지연 허용 — 바닥 정보 안정성 우선, SWR)
const inflight = new Map<string, Promise<StockBasics>>();

async function getBasics(stock: string): Promise<StockBasics> {
  const today = kstDate();
  const key = `${today}:${stock}`;
  const running = inflight.get(key);
  if (running) return running;

  const load = unstable_cache(
    async () => fetchStockBasics(stock),
    ["fomo-stock-basics", cacheVersion(), today, stock],
    { revalidate: REVALIDATE_S }
  );
  const p = load().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function GET(req: Request) {
  const stock = new URL(req.url).searchParams.get("stock")?.trim();
  if (!stock) {
    return withCors(NextResponse.json({ error: "stock required" }, { status: 400 }));
  }
  const payload = await getBasics(stock);
  return withCors(
    NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
    })
  );
}
