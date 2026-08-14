import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../lib/fomo";
import { getCachedDaily30Response, type Daily30Response } from "../../../../lib/daily-30";
import { readStaleSnapshot, staleMark, withDeadline, writeStaleSnapshot } from "../../../../lib/stale-serve";
import { logStageReport, runWithStageTimer } from "../../../../lib/stage-timer";

export const dynamic = "force-dynamic";
// 위원회·스냅샷 동시 부재 때 결정론 엔진 직생성까지 허용하는 최후 비상 경로.
export const maxDuration = 300;

/**
 * 빌드 마감 (WO-OPS-504 PHASE 3). `maxDuration` 300 안에서 잘리면 응답도 캐시도 못 남기므로
 * 그보다 먼저 포기하고 마지막 성공분을 준다. 실측(`#207`)에서 이 라우트는 301초에 잘렸다.
 */
const BUILD_DEADLINE_MS = 45_000;
const SNAPSHOT_KEY = "daily-30";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  // 계측(PHASE 2) — 로그는 항상, 응답 적재는 `?debug=timings` 일 때만.
  const wantTimings = new URL(request.url).searchParams.get("debug") === "timings";
  // 보고를 `try` 밖에 둔다 — 503 으로 떨어지는 순간이 가장 알아야 할 순간이다(discovery 와 동일).
  let reportTimings: (() => ReturnType<typeof logStageReport>) | null = null;
  try {
    const { result, report } = runWithStageTimer(getCachedDaily30Response);
    reportTimings = () => logStageReport("fomo/daily-30", report());
    const response = await withDeadline(result, BUILD_DEADLINE_MS);
    const timings = reportTimings();
    const debugHeaders = { "Cache-Control": "no-store" };
    if (response) {
      await writeStaleSnapshot(SNAPSHOT_KEY, response);
      if (wantTimings) {
        return withCors(
          NextResponse.json({ ...response, meta: { ...response.meta, timings } }, { headers: debugHeaders })
        );
      }
      const cacheControl = response.meta.stale
        ? "public, s-maxage=60, stale-while-revalidate=300"
        : "public, s-maxage=3600, stale-while-revalidate=86400";
      return withCors(
        NextResponse.json(response, {
          headers: { "Cache-Control": cacheControl },
        })
      );
    }

    // 마감 초과 — 504 대신 마지막 성공분. 오래된 것임을 meta 에 남긴다.
    const snapshot = await readStaleSnapshot<Daily30Response>(SNAPSHOT_KEY);
    if (snapshot) {
      console.warn("[fomo/daily-30] build deadline exceeded — serving stale", snapshot.savedAt);
      return withCors(
        NextResponse.json(
          {
            ...snapshot.row,
            meta: { ...snapshot.row.meta, ...staleMark(snapshot.savedAt), ...(wantTimings ? { timings } : {}) },
          },
          { headers: wantTimings ? debugHeaders : { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400" } }
        )
      );
    }
    throw new Error("build deadline exceeded and no snapshot");
  } catch (err) {
    console.warn("[fomo/daily-30] failed", (err as Error)?.message);
    // 실패 응답에도 계측을 싣는다 — 이 경로가 "무엇 때문에 못 만들었나" 의 답이다.
    const timings = reportTimings?.() ?? null;
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
            ...(wantTimings && timings ? { timings } : {}),
          },
        } satisfies Daily30Response,
        { status: 503, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
