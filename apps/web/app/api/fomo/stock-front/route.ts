import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { withCors, kstDate, cacheVersion } from "../../../../lib/fomo";
import { assembleStockFront, fetchMarketCapRankMap, type StockFrontData } from "../../../../lib/stock-front";

/**
 * 카드 앞면 FOMO 신호 — PHASE0 rev2 후속. baseline(가격·52주) + 라이브 수급 streak + 시총순위 + 스파크라인.
 * 덱이 도달 종목에 lazy 로 부른다(비용 방어). 응축은 buildCardFrontHook(@fomo/core)가 클라에서.
 * 순수 데이터(LLM 0) — 네이버 금융 + 수급 누적 테이블. 일 단위 캐시(가격은 장중 갱신 위해 짧게).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

const REVALIDATE_S = 600; // 10분 — 가격·수급은 자주 안 변함, 캐시로 비용 방어

/** 시총 순위 맵 — 하루 1회만 새로(랭킹은 장중 거의 불변, 무거운 페치). */
async function getRankMap(): Promise<Record<string, { market: string; rank: number }>> {
  const load = unstable_cache(async () => fetchMarketCapRankMap(), ["fomo-marketcap-rank", cacheVersion(), kstDate()], {
    revalidate: 60 * 60 * 12,
  });
  return load();
}

async function getFront(stock: string): Promise<StockFrontData> {
  const today = kstDate();
  const load = unstable_cache(
    async () => {
      const rankMap = await getRankMap().catch(() => ({}));
      return assembleStockFront(stock, rankMap);
    },
    ["fomo-stock-front", cacheVersion(), today, stock],
    { revalidate: REVALIDATE_S }
  );
  return load();
}

export async function GET(req: Request) {
  const stock = new URL(req.url).searchParams.get("stock")?.trim();
  if (!stock) {
    return withCors(NextResponse.json({ error: "stock required" }, { status: 400 }));
  }
  try {
    const data = await getFront(stock);
    return withCors(
      NextResponse.json(data, {
        headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" },
      })
    );
  } catch (err) {
    console.warn("[stock-front] failed", stock, (err as Error)?.message);
    // 정직한 폴백 — 신호 없이도 카드는 잠잠으로 뜬다.
    return withCors(NextResponse.json({ signals: {}, sparkline: [] } satisfies StockFrontData));
  }
}
