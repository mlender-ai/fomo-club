import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { buildSectorMap } from "../../../../../lib/sector-map";
import { readSectorMap, writeSectorMap } from "../../../../../lib/sector-map-store";
import { fetchKrMarketRows } from "../../../../../lib/discovery-supply";
import { buildKrPickUniverse } from "../../../../../lib/pick-universe";
import { STOCK_VOCAB } from "@fomo/core";

/**
 * WO-RESET-08 §E-3 — 국내 업종 분류표 수집 크론.
 *
 * 업종은 자주 바뀌지 않는다(상장·폐지 때만). 하루 한 번이면 충분하다.
 * **커버리지를 응답에 싣는다** — 자금 흐름 카드가 성립하는지의 근거다(완료 확인 9).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return !secret || request.headers.get("authorization") === `Bearer ${secret}`;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  const startedAt = Date.now();
  try {
    const today = kstDate();
    const previous = await readSectorMap();
    const map = await buildSectorMap(today);

    const mapped = Object.keys(map.byCode).length;
    /** 빈 수집으로 기존 저장분을 덮지 않는다(§12). */
    const priorMapped = Object.keys(previous?.byCode ?? {}).length;
    if (mapped === 0 && priorMapped > 0) {
      return withCors(
        NextResponse.json(
          { ok: false, blocked: "분류 0종목 — 직전 저장분을 유지한다", keptPrior: priorMapped, errors: map.errors.slice(0, 5), ms: Date.now() - startedAt },
          { status: 503 }
        )
      );
    }
    await writeSectorMap(map);

    // 우리 유니버스 기준 커버리지 — 이게 흐름 카드의 성립 조건이다.
    const rows = await fetchKrMarketRows().catch(() => []);
    const universe = buildKrPickUniverse(rows, STOCK_VOCAB);
    const codes = universe.defs.map((d) => d.naverCode).filter((c): c is string => !!c);
    const covered = codes.filter((c) => map.byCode[c]).length;

    return withCors(
      NextResponse.json({
        ok: true,
        asOf: today,
        groups: map.groups.length,
        mapped,
        universe: codes.length,
        covered,
        coveragePct: codes.length > 0 ? Math.round((covered / codes.length) * 1000) / 10 : 0,
        // 3종목 미만 업종은 집계에 쓰기엔 얇다 — 몇 개인지 밝힌다.
        thinSectors: Object.values(map.counts).filter((n) => n < 3).length,
        errorCount: map.errors.length,
        errors: map.errors.slice(0, 5),
        ms: Date.now() - startedAt,
      })
    );
  } catch (error) {
    return withCors(
      NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error), ms: Date.now() - startedAt },
        { status: 500 }
      )
    );
  }
}
