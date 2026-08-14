import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { withCors, kstDate, cacheVersion } from "../../../../lib/fomo";
import { buildDiscoveryResponse, type DiscoveryResponse } from "../../../../lib/discovery-supply";
import type { DiscoveryCountryScope } from "../../../../lib/market-source-types";
import { shouldUseTargetedMaterial, targetedMaterialLimitFor } from "../../../../lib/discovery-route-policy";
import { readStaleSnapshot, staleMark, withDeadline, writeStaleSnapshot } from "../../../../lib/stale-serve";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REVALIDATE_S = 600;

/**
 * 빌드 마감 (WO-OPS-504 PHASE 3).
 *
 * `maxDuration` 이 60이라 그 안에서 잘리면 응답도 캐시도 못 남긴다 — 그래서 **그보다 먼저**
 * 포기하고 마지막 성공분을 준다. 25초는 남은 35초 동안 빌드가 끝나 캐시를 채울 여지를 남긴
 * 값이다(빌드를 취소하지 않는다).
 */
const BUILD_DEADLINE_MS = 25_000;

function discoveryCountry(value: string | null): DiscoveryCountryScope {
  return value === "US" || value === "all" ? value : "KR";
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
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
    const built = await withDeadline(load(), BUILD_DEADLINE_MS);
    if (built) {
      // 성공분은 다음 실패 때 줄 것이므로 저장한다. 저장 실패가 응답을 막지 않는다.
      await writeStaleSnapshot(snapshotKey, built);
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
          { ...snapshot.row, meta: { ...(snapshot.row as { meta?: unknown }).meta ?? {}, ...staleMark(snapshot.savedAt) } },
          { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400" } }
        )
      );
    }
    // 스냅샷도 없으면 빈 200 을 만들지 않는다 — 아래 503 경로와 같은 계약.
    throw new Error("build deadline exceeded and no snapshot");
  } catch (err) {
    console.warn("[fomo/discovery] failed", (err as Error)?.message);
    // 실패는 비200으로 — 200-빈덱을 성공으로 취급하면 재시도/폴백 경로가 빈 덱에서 멈춘다.
    return withCors(
      NextResponse.json(
        {
          asOf: kstDate(),
          stocks: [],
          cards: [],
          fronts: {},
          confidence: "L",
          source: "데이터 없음",
        } satisfies DiscoveryResponse,
        { status: 503, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
