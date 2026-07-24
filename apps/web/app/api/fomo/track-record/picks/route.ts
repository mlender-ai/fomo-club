import { NextResponse } from "next/server";
import { corsJson, withCors } from "../../../../../lib/fomo";
import { getCachedScorecardPicks } from "../../../../../lib/ledger-track-record";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    return corsJson(await getCachedScorecardPicks(), {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.warn("[track-record/picks] read failed", error);
    return corsJson({ error: "성적표 픽 조회 실패", picks: [] }, { status: 500 });
  }
}
