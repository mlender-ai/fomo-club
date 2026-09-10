import { NextResponse } from "next/server";
import { computeFomoIndex, scoreToColor, scoreToDescription } from "@fomo/core";
import { prisma } from "../../../../lib/prisma";
import { kstDate, computeLiveFomoIndex, corsJson, withCors } from "../../../../lib/fomo";
import { createLogger } from "../../../../lib/logger";

const log = createLogger("fomo/index");

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// GET /api/fomo/index — 오늘의 FOMO Index.
// 스냅샷이 있으면 그대로, 없으면 당일 투표로 라이브 계산(market/community/whale 중립 폴백).
export async function GET() {
  const date = kstDate();
  try {
    let snap: Awaited<ReturnType<typeof prisma.fomoIndexSnapshot.findUnique>> = null;
    try {
      snap = await prisma.fomoIndexSnapshot.findUnique({ where: { date } });
    } catch (err) {
      log.warn("snapshot lookup failed — using live fallback", {
        date,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    if (snap) {
      return corsJson({
        date: snap.date,
        score: snap.score,
        state: snap.state,
        zoneColor: scoreToColor(snap.score),
        zoneDescription: scoreToDescription(snap.score),
        components: {
          market:    snap.marketHeat,
          community: snap.communityHeat,
          emotion:   snap.emotionHeat,
          whale:     snap.whaleHeat,
        },
        aiSummary:    snap.aiSummary,
        prevDayDelta: snap.prevDayDelta,
        avg30Delta:   snap.avg30Delta,
        live: false,
      });
    }

    // 스냅샷 미생성 시(파이프라인 실행 전) — 당일 투표 기반 라이브 계산
    log.info("snapshot not found — computing live", { date });
    const idx = await computeLiveFomoIndex(date);
    const comp = (k: string) => idx.components.find((c) => c.key === k)?.score ?? 0;
    return corsJson({
      date:             idx.date,
      score:            idx.score,
      state:            idx.state,
      zoneColor:        scoreToColor(idx.score),
      zoneDescription:  scoreToDescription(idx.score),
      components: {
        market:    comp("market"),
        community: comp("community"),
        emotion:   comp("emotion"),
        whale:     comp("whale"),
      },
      aiSummary:    "",
      prevDayDelta: 0,
      avg30Delta:   0,
      live: true,
    });
  } catch (err) {
    log.error("FOMO Index live fallback failed — returning neutral index", {
      date,
      err: err instanceof Error ? err.message : String(err),
    });
    const idx = computeFomoIndex({}, date);
    const comp = (k: string) => idx.components.find((c) => c.key === k)?.score ?? 0;
    return corsJson({
      date:             idx.date,
      score:            idx.score,
      state:            idx.state,
      zoneColor:        scoreToColor(idx.score),
      zoneDescription:  scoreToDescription(idx.score),
      components: {
        market:    comp("market"),
        community: comp("community"),
        emotion:   comp("emotion"),
        whale:     comp("whale"),
      },
      aiSummary:    "",
      prevDayDelta: 0,
      avg30Delta:   0,
      live: true,
      fallback: true,
    });
  }
}
