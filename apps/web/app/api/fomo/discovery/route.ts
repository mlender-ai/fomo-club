import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { withCors, kstDate, cacheVersion } from "../../../../lib/fomo";
import { buildDiscoveryResponse, type DiscoveryResponse } from "../../../../lib/discovery-supply";
import type { DiscoveryCountryScope } from "../../../../lib/market-source-types";
import { shouldUseTargetedMaterial, targetedMaterialLimitFor } from "../../../../lib/discovery-route-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REVALIDATE_S = 600;

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
    return withCors(
      NextResponse.json(await load(), {
        headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" },
      })
    );
  } catch (err) {
    console.warn("[fomo/discovery] failed", (err as Error)?.message);
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
        { headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
