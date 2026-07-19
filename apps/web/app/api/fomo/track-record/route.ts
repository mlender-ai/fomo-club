import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { cacheVersion, corsJson, withCors } from "@/lib/fomo";
import { readTrackRecord } from "@/lib/ledger-track-record";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    const load = unstable_cache(readTrackRecord, ["judgment-ledger-track-record", cacheVersion()], {
      revalidate: 60 * 30,
      tags: ["judgment-ledger"],
    });
    return corsJson(await load(), { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
  } catch (error) {
    console.warn("[track-record] read failed", error);
    return corsJson({ error: "성과 원장 조회 실패" }, { status: 500 });
  }
}
