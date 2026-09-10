import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { withCors, kstDate, cacheVersion } from "../../../../lib/fomo";
import { buildFeedArchiveResponse, buildFeedHubResponse, type FeedHubResponse } from "../../../../lib/feed-hub";

/**
 * 피드 집계 API (WO 피드 파이프라인 통합) — FeedView·PC 우측 컬럼의 단일 소스.
 * 모든 생산자(브리핑·버즈·회고·내러티브·섹터·지수·거시·고래·종목이슈·거시이슈)를 여기서만 소비한다.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REVALIDATE_S = 1800; // 30분 — 콘텐츠는 크론 주기로 갱신, revalidateTag 로 즉시 반영

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  try {
    // 아카이브 모드(무한 피드) — ?before=YYYY-MM-DD 커서로 지난 브리핑·버즈·회고를 페이지 단위 제공.
    // ⚠️ 서버 캐시(unstable_cache) 금지 — 배포 직후 콜드 DB 읽기 실패가 "빈 페이지"로 6h 박히는
    // 오염 실사고(2026-07-18, daily-30 KR 0장과 같은 계열). DB 점조회 3~4개라 캐시 없이도 싸다.
    // 빈 페이지는 CDN 도 no-store — 실패와 진짜 없음을 구분할 수 없으니 캐시하지 않는 게 정직.
    const before = new URL(request.url).searchParams.get("before")?.trim();
    if (before && /^\d{4}-\d{2}-\d{2}$/.test(before)) {
      const archive = await buildFeedArchiveResponse(before);
      return withCors(
        NextResponse.json(archive, {
          headers: {
            "Cache-Control": archive.items.length > 0 ? "public, s-maxage=3600, stale-while-revalidate=86400" : "no-store",
          },
        })
      );
    }

    const load = unstable_cache(
      () => buildFeedHubResponse(),
      ["fomo-feed-hub", cacheVersion(), kstDate()],
      { revalidate: REVALIDATE_S, tags: ["feed-hub", "daily-30"] }
    );
    const response = await load();
    return withCors(
      NextResponse.json(response, {
        headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400" },
      })
    );
  } catch (err) {
    console.warn("[fomo/feed-hub] failed", (err as Error)?.message);
    return withCors(
      NextResponse.json(
        {
          asOf: kstDate(),
          items: [],
          typeCounts: {},
          scopeCounts: { KR: 0, US: 0, GLOBAL: 0 },
          source: "feed-hub unavailable",
        } satisfies FeedHubResponse,
        { status: 503, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
