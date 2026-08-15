import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { withCors, kstDate, cacheVersion } from "../../../../lib/fomo";
import { buildDiscoveryResponse, type DiscoveryResponse } from "../../../../lib/discovery-supply";
import type { DiscoveryCountryScope } from "../../../../lib/market-source-types";
import { shouldUseTargetedMaterial, targetedMaterialLimitFor } from "../../../../lib/discovery-route-policy";
import { readStaleSnapshot, staleMark, withDeadline, writeStaleSnapshot } from "../../../../lib/stale-serve";
import { logStageReport, runWithStageTimer } from "../../../../lib/stage-timer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REVALIDATE_S = 600;

/**
 * 빌드 마감 (WO-OPS-504 PHASE 3, PHASE 2 실측으로 45초로 조정).
 *
 * `maxDuration` 이 60이라 그 안에서 잘리면 응답도 캐시도 못 남긴다 — 그래서 **그보다 먼저**
 * 포기하고 마지막 성공분을 준다.
 *
 * 처음엔 25초로 잡았다. 프리뷰 실측(2026-08-15)에서 그 값은 **틀린 것으로 드러났다** —
 * 콜드 빌드가 US 28초 이상 / KR 25초 이상이라 25초 마감은 **빌드를 한 번도 끝내지 못하고**,
 * 끝나지 않으니 `unstable_cache` 도 스냅샷도 영원히 안 채워진다. 즉 마감 자체가 콜드
 * 데드락을 고착시켰다. 45초는 남은 15초에 응답·스냅샷 저장을 마칠 여지를 남긴 값이다.
 */
const BUILD_DEADLINE_MS = 45_000;

function discoveryCountry(value: string | null): DiscoveryCountryScope {
  return value === "US" || value === "all" ? value : "KR";
}

/** `meta` 를 보존하며 덧붙인다 — 스테일 표식·계측이 기존 meta 를 지우지 않게. */
function withMeta<T>(row: T, extra: Record<string, unknown>): T {
  const meta = (row as { meta?: Record<string, unknown> }).meta ?? {};
  return { ...row, meta: { ...meta, ...extra } };
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  // 계측(PHASE 2) — 응답에 싣는 것은 `?debug=timings` 일 때만. 로그는 항상 남긴다.
  const wantTimings = url.searchParams.get("debug") === "timings";
  /**
   * 계측 보고를 `try` 밖에 둔다 — **503 으로 떨어지는 순간이 가장 알아야 할 순간**이다.
   * 마감 초과에 스냅샷도 없으면 아래 catch 로 가는데, 거기서 계측이 사라지면 이 사고 전과
   * 똑같이 "왜 못 만들었는지" 를 모르는 상태로 돌아간다.
   */
  let reportTimings: (() => ReturnType<typeof logStageReport>) | null = null;
  try {
    const fast = url.searchParams.get("fast") === "1";
    const country = discoveryCountry(url.searchParams.get("country"));
    const targetedMaterial = shouldUseTargetedMaterial(country, fast);
    const targetedMaterialLimit = targetedMaterialLimitFor(country, fast);
    const load = unstable_cache(
      async () =>
        buildDiscoveryResponse({
          targetedMaterial,
          country,
          ...(typeof targetedMaterialLimit === "number" ? { targetedMaterialLimit } : {}),
        }),
      ["fomo-discovery", cacheVersion(), kstDate(), country, fast ? "fast" : "full", String(targetedMaterialLimit ?? "default")],
      { revalidate: REVALIDATE_S }
    );
    const snapshotKey = `discovery:${country}:${fast ? "fast" : "full"}`;
    const { result, report } = runWithStageTimer(load);
    const label = `fomo/discovery country=${country}${fast ? " fast" : ""}`;
    reportTimings = () => logStageReport(label, report());
    const built = await withDeadline(result, BUILD_DEADLINE_MS);
    const timings = reportTimings();
    // 디버그 응답은 캐시하지 않는다 — 계측값이 정규 응답에 섞이면 안 된다.
    const debugHeaders = { "Cache-Control": "no-store" };
    if (built) {
      // 성공분은 다음 실패 때 줄 것이므로 저장한다. 저장 실패가 응답을 막지 않는다.
      await writeStaleSnapshot(snapshotKey, built);
      if (wantTimings) {
        return withCors(NextResponse.json(withMeta(built, { timings }), { headers: debugHeaders }));
      }
      return withCors(
        NextResponse.json(built, {
          headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" },
        })
      );
    }

    // 마감 초과 — 504 로 죽는 대신 마지막 성공분을 준다. **오래된 것임을 반드시 표기한다.**
    const snapshot = await readStaleSnapshot<DiscoveryResponse>(snapshotKey);
    if (snapshot) {
      console.warn("[fomo/discovery] build deadline exceeded — serving stale", snapshot.savedAt);
      return withCors(
        NextResponse.json(
          withMeta(snapshot.row, { ...staleMark(snapshot.savedAt), ...(wantTimings ? { timings } : {}) }),
          { headers: wantTimings ? debugHeaders : { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400" } }
        )
      );
    }
    // 스냅샷도 없으면 빈 200 을 만들지 않는다 — 아래 503 경로와 같은 계약.
    throw new Error("build deadline exceeded and no snapshot");
  } catch (err) {
    console.warn("[fomo/discovery] failed", (err as Error)?.message);
    // 실패 응답에도 계측을 싣는다 — 이 경로가 곧 "무엇 때문에 못 만들었나" 의 답이다.
    const timings = reportTimings?.() ?? null;
    const empty = {
      asOf: kstDate(),
      stocks: [],
      cards: [],
      fronts: {},
      confidence: "L",
      source: "데이터 없음",
    } satisfies DiscoveryResponse;
    // 실패는 비200으로 — 200-빈덱을 성공으로 취급하면 재시도/폴백 경로가 빈 덱에서 멈춘다.
    return withCors(
      NextResponse.json(wantTimings && timings ? withMeta(empty, { timings }) : empty, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      })
    );
  }
}
