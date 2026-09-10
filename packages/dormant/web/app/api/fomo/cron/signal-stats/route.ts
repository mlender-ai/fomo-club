import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import {
  BACKTESTABLE_TYPES,
  isBacktestableType,
  runSignalStatsChunk,
  type ChunkResult,
} from "../../../../../lib/signal-backtest-job";
import { readAllBacktestStats } from "../../../../../lib/signal-stats";

/**
 * 신호 성적 백테스트 크론 — WO-P2 §1. 월 1회 갱신(워크플로가 done 까지 반복 호출).
 *
 * GET /api/fomo/cron/signal-stats?type=insider_cluster[&limit=24][&reset=1]
 *   type 생략 시 아직 끝나지 않은 유형을 순서대로 하나 처리한다(워크플로 루프 단순화).
 * 외부 소스(openinsider·Nasdaq·네이버) 호출이 필요해 **Vercel 런타임에서만** 제대로 돈다
 * (GH Actions 러너는 시세 egress 미확보 — 원장 백필 워크플로 주석과 동일한 이유).
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
    return withCors(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
  }
  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type")?.trim() ?? "";
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const reset = url.searchParams.get("reset") === "1";
  const startedAt = Date.now();

  try {
    // 대상 유형 결정 — 명시 없으면 미완료 유형 중 첫 번째(없으면 첫 유형을 reset 으로 재산출).
    let target = isBacktestableType(typeParam) ? typeParam : null;
    if (!target) {
      const stats = await readAllBacktestStats();
      target = BACKTESTABLE_TYPES.find((t) => !stats[t]) ?? BACKTESTABLE_TYPES[0];
    }

    const result: ChunkResult = await runSignalStatsChunk(target, {
      ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      reset,
    });

    return withCors(
      NextResponse.json(
        { ok: true, date: kstDate(), elapsedMs: Date.now() - startedAt, ...result },
        { headers: { "Cache-Control": "no-store" } }
      )
    );
  } catch (err) {
    console.warn("[fomo/cron/signal-stats] failed", (err as Error)?.message);
    return withCors(
      NextResponse.json(
        { ok: false, date: kstDate(), error: (err as Error)?.message ?? "signal-stats failed" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
