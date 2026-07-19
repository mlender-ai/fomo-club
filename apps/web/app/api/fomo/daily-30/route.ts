import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../lib/fomo";
import { getCachedDaily30Response, type Daily30Response } from "../../../../lib/daily-30";

export const dynamic = "force-dynamic";
// 위원회·스냅샷 동시 부재 때 결정론 엔진 직생성까지 허용하는 최후 비상 경로.
export const maxDuration = 300;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    const response = await getCachedDaily30Response();
    const cacheControl = response.meta.stale
      ? "public, s-maxage=60, stale-while-revalidate=300"
      : "public, s-maxage=3600, stale-while-revalidate=86400";
    return withCors(
      NextResponse.json(response, {
        headers: { "Cache-Control": cacheControl },
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
