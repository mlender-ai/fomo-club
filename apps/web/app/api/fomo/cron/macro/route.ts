import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { collectMacro } from "../../../../../lib/macro-collect";
import { readMacroCollection, writeMacroCollection, recordMacroRun } from "../../../../../lib/macro-store";
import { detectMacroMove, isMacroFresh, MACRO_INDICATORS, type MacroIndicatorId } from "@fomo/core/keyword-cards/macro-link";

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
      // 실패도 기록한다 — 2일 연속을 세려면 실패한 날이 남아야 한다(§B-4).
      const health = await recordMacroRun({ date: today, indicators: 0, errors: collection.errors.slice(0, 5) });
      return withCors(
        NextResponse.json(
          {
            ok: false,
            blocked: "지표 0종 — 직전 저장분을 유지한다",
            keptPrior: priorGot,
            failStreak: health.failStreak,
            alert: health.shouldAlert,
            errors: collection.errors.slice(0, 5),
            ms: Date.now() - startedAt,
          },
          { status: 503 }
        )
      );
    }
    await writeMacroCollection(collection);
    const health = await recordMacroRun({ date: today, indicators: got, errors: collection.errors.slice(0, 5) });

    /**
     * **오늘 카드가 될 만한 움직임이 있나** — 임계가 맞는지 보는 재료다.
     * 연결까지는 굽는 쪽이 판단하므로 여기서는 움직임만 센다.
     */
    const moves = MACRO_INDICATORS.map((indicator) => {
      const points = collection.series[indicator.id as MacroIndicatorId];
      if (!points) return null;
      const move = detectMacroMove({ id: indicator.id, points });
      if (!move) return null;
      return {
        id: indicator.id,
        kind: move.kind,
        streakDays: move.streakDays,
        changePct: Math.round(move.changePct * 100) / 100,
        asOf: move.asOf,
        /** 굽는 쪽이 이걸로 거른다 — 워크플로 요약에서 미리 보이게 같이 낸다(§B-3). */
        fresh: isMacroFresh(move.asOf, today),
      };
    }).filter(Boolean);

    /**
     * **묵은 지표를 세서 드러낸다**(§B-3). 수집은 성공했는데 소스가 늦어 전부 걸러지는
     * 날이 있을 수 있고, 그건 조용히 지나가면 안 된다.
     */
    const staleIndicators = Object.entries(collection.series)
      .filter(([, points]) => {
        const latest = points?.[points.length - 1];
        return !latest || !isMacroFresh(latest.date, today);
      })
      .map(([id]) => id);

    return withCors(
      NextResponse.json({
        ok: true,
        asOf: today,
        indicators: got,
        staleIndicators,
        failStreak: health.failStreak,
        alert: health.shouldAlert,
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
