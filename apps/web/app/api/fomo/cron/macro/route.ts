import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { collectMacro } from "../../../../../lib/macro-collect";
import { readMacroCollection, writeMacroCollection } from "../../../../../lib/macro-store";
import { detectMacroMove, MACRO_INDICATORS, type MacroIndicatorId } from "@fomo/core/keyword-cards/macro-link";

/**
 * WO-RESET-09 §A-3 — 거시 지표 수집 크론.
 *
 * FRED 는 공개 도메인이고 키가 없어도 되지만, 라우트로 두는 이유는 저장 위치가
 * `FeedContentCache` 라서다 — 워크플로에서 직접 DB 를 쓰지 않는다(다른 수집과 같은 규약).
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
    const previous = await readMacroCollection();
    const collection = await collectMacro(today);

    const got = Object.keys(collection.series).length;
    /** 빈 수집으로 기존 저장분을 덮지 않는다(§12). */
    const priorGot = Object.keys(previous?.series ?? {}).length;
    if (got === 0 && priorGot > 0) {
      return withCors(
        NextResponse.json(
          { ok: false, blocked: "지표 0종 — 직전 저장분을 유지한다", keptPrior: priorGot, errors: collection.errors.slice(0, 5), ms: Date.now() - startedAt },
          { status: 503 }
        )
      );
    }
    await writeMacroCollection(collection);

    /**
     * **오늘 카드가 될 만한 움직임이 있나** — 임계가 맞는지 보는 재료다.
     * 연결까지는 굽는 쪽이 판단하므로 여기서는 움직임만 센다.
     */
    const moves = MACRO_INDICATORS.map((indicator) => {
      const points = collection.series[indicator.id as MacroIndicatorId];
      if (!points) return null;
      const move = detectMacroMove({ id: indicator.id, points });
      return move
        ? { id: indicator.id, streakDays: move.streakDays, changePct: Math.round(move.changePct * 100) / 100, asOf: move.asOf }
        : null;
    }).filter(Boolean);

    return withCors(
      NextResponse.json({
        ok: true,
        asOf: today,
        indicators: got,
        detail: Object.fromEntries(
          Object.entries(collection.series).map(([id, points]) => [
            id,
            { points: points?.length ?? 0, latest: points?.[points.length - 1] },
          ])
        ),
        moves,
        errorCount: collection.errors.length,
        errors: collection.errors.slice(0, 5),
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
