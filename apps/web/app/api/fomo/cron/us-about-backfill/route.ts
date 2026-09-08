import { NextResponse } from "next/server";
import { withCors } from "../../../../../lib/fomo";
import { backfillUsCompanyAbout } from "../../../../../lib/us-company-about";
import { US_DISCOVERY_SYMBOLS } from "../../../../../lib/us-symbols";

/**
 * LAUNCH-P2 §C — **미국 회사 설명 백필.**
 *
 * `GET /api/fomo/cron/us-about-backfill?limit=25`
 *
 * 요청 경로(상세 열기)에서 번역하면 9초 예산과 레이트리밋에 막혀 확보율이 0% 였다.
 * 여기서는 시간이 넉넉하고 429 를 기다릴 수 있다. 심볼당 한 번 성공하면 **영구 캐시**라
 * 다시 하지 않는다 — 며칠에 걸쳐 채워진다.
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
    const url = new URL(request.url);
    const raw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 60) : 25;
    const symbols = US_DISCOVERY_SYMBOLS.map((item) => ({ symbol: item.symbol, name: item.canonical }));
    const result = await backfillUsCompanyAbout(symbols, {
      limit,
      // 라우트 예산(300s)보다 먼저 끝낸다 — 잘리면 이번에 채운 것까지는 남는다(캐시 쓰기가 건별이다).
      deadline: startedAt + 260_000,
    });
    const total = symbols.length;
    const have = result.cached + result.filled;
    return withCors(
      NextResponse.json({
        ok: true,
        universe: total,
        /** 확보율 — 이 숫자가 §E 목표(70%)의 근거다. */
        coverage: total > 0 ? Math.round((have / total) * 1000) / 10 : 0,
        ...result,
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
