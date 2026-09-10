import { NextResponse } from "next/server";
import { corsJson, withCors } from "@/lib/fomo";
import { getCachedTrackRecord } from "@/lib/ledger-track-record";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    return corsJson(await getCachedTrackRecord(), { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } });
  } catch (error) {
    console.warn("[track-record] read failed", error);
    return corsJson({ error: "성과 원장 조회 실패" }, { status: 500 });
  }
}
