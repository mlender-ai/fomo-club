import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { withCors, corsJson, cacheVersion, kstDate } from "../../../../lib/fomo";
import { readFeedContent } from "../../../../lib/feed-content-store";
import type { QuietPickResponse } from "../../../../lib/quiet-pick";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const ACTIVE_ID = "quiet-pick:active";

async function resolveQuietPicks(): Promise<QuietPickResponse | null> {
  return readFeedContent<QuietPickResponse>(ACTIVE_ID);
}

const getCachedQuietPicks = unstable_cache(
  resolveQuietPicks,
  ["fomo-quiet-picks", cacheVersion(), kstDate()],
  { revalidate: 300, tags: ["quiet-pick"] }
);

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    const response = await getCachedQuietPicks();
    // 아직 발행 전(스냅샷 부재) — 빈 응답을 200으로 캐시하면 굳는다. 503 no-store 로 재시도 유도.
    if (!response) {
      return withCors(
        NextResponse.json(
          { asOf: new Date().toISOString(), date: kstDate(), picks: [], qualification: null, source: "quiet-pick-engine" },
          { status: 503, headers: { "Cache-Control": "no-store" } }
        )
      );
    }
    // 발행됐지만 0장 — 정직한 상태("오늘은 조용한 돈이 없어요"). 짧은 캐시로 200.
    const cacheControl = response.picks.length > 0
      ? "public, s-maxage=3600, stale-while-revalidate=86400"
      : "public, s-maxage=300, stale-while-revalidate=1800";
    return corsJson(response, { headers: { "Cache-Control": cacheControl } });
  } catch (error) {
    return withCors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : "quiet-picks failed", picks: [] },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
