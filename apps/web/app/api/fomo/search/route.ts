import { NextResponse } from "next/server";
import { withCors } from "../../../../lib/fomo";
import { searchSymbols, symbolIndexReady } from "../../../../lib/symbol-index";
import { getCachedDaily30Response } from "../../../../lib/daily-30";

/**
 * 검색 자동완성 (WO 검색 §2) — 캐시된 심볼 인덱스만 조회(<1초, 재구축·외부 fetch 0).
 * 상위 10개 + 오늘의 30장 포함 여부(todayCard) 반환.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

/** todayCard 뱃지는 best-effort — 캐시가 식었을 때 daily-30 풀빌드가 검색을 막지 않게 짧게 레이스. */
function daily30Quick(timeoutMs = 800): Promise<Awaited<ReturnType<typeof getCachedDaily30Response>> | null> {
  return Promise.race([
    getCachedDaily30Response().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return withCors(NextResponse.json({ results: [], indexReady: await symbolIndexReady() }));
  try {
    const [results, daily30] = await Promise.all([searchSymbols(q, 10), daily30Quick()]);
    const todayStocks = new Set((daily30?.stocks ?? []).map((s) => s.canonical));
    const todaySymbols = new Set((daily30?.stocks ?? []).map((s) => s.symbol?.toUpperCase()).filter(Boolean));
    return withCors(
      NextResponse.json(
        {
          indexReady: results.length > 0 || (await symbolIndexReady()),
          results: results.map((r) => ({
            canonical: r.canonical,
            ...(r.englishName && r.englishName !== r.canonical ? { englishName: r.englishName } : {}),
            symbol: r.symbol,
            market: r.market,
            country: r.country,
            ...(r.naverCode ? { naverCode: r.naverCode } : {}),
            ...(r.sector ? { sector: r.sector } : {}),
            todayCard: todayStocks.has(r.canonical) || todaySymbols.has(r.symbol.toUpperCase()),
          })),
        },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
      )
    );
  } catch (err) {
    console.warn("[fomo/search] failed", (err as Error)?.message);
    return withCors(NextResponse.json({ results: [], indexReady: false }, { status: 200 }));
  }
}
