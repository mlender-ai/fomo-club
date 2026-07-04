import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../lib/fomo";
import { getCachedDaily30Response, type Daily30Response } from "../../../../lib/daily-30";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    return withCors(
      NextResponse.json(await getCachedDaily30Response(), {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      })
    );
  } catch (err) {
    console.warn("[fomo/daily-30] failed", (err as Error)?.message);
    // 실패는 반드시 비200으로 — 200-빈덱을 성공으로 캐시/렌더하면 클라 재시도가 멈춘다(빈 덱 stuck).
    return withCors(
      NextResponse.json(
        {
          asOf: kstDate(),
          country: "all",
          stocks: [],
          cards: [],
          fronts: {},
          confidence: "L",
          source: "데이터 없음",
          meta: {
            targetCount: 30,
            cards: [],
            assetCounts: { "kr-stock": 0, "us-stock": 0, coin: 0, macro: 0 },
          },
        } satisfies Daily30Response,
        { status: 503, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
