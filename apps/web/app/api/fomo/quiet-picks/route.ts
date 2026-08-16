import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { withCors, corsJson, cacheVersion, kstDate } from "../../../../lib/fomo";
import { readFeedContentStrict } from "../../../../lib/feed-content-store";
import type { QuietPickResponse } from "../../../../lib/quiet-pick";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const ACTIVE_ID = "quiet-pick:active";

/**
 * 읽기 실패를 삼키지 않는다 — 예외는 GET 의 catch 로 올라가 `reason: "store-read-failed"` 가 된다.
 * 던지면 `unstable_cache` 가 그 결과를 캐시하지 않는다는 점도 중요하다: 일시적 DB 오류를 null 로
 * 바꿔 돌려주면 그 null 이 300초 동안 "발행 전" 으로 굳는다.
 */
async function resolveQuietPicks(): Promise<QuietPickResponse | null> {
  return readFeedContentStrict<QuietPickResponse>(ACTIVE_ID);
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
          { asOf: new Date().toISOString(), date: kstDate(), picks: [], qualification: null, source: "quiet-pick-engine", reason: "not-published" },
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
    // 스냅샷 부재와 같은 503 이지만 원인이 다르다. 바깥에서 구분되지 않으면 장애가 "발행 전" 으로 위장된다.
    console.error("[fomo/quiet-picks] store read failed", error instanceof Error ? error.message : error);
    return withCors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : "quiet-picks failed", picks: [], reason: "store-read-failed" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
