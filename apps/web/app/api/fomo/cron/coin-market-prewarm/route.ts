import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { withCors } from "../../../../../lib/fomo";
import { fetchUpbitCoinSnapshots, writeCoinMarketSnapshots } from "../../../../../lib/coin-market-source";

/**
 * 코인 시세·캔들 프리웜 크론 (WO Phase C) — us-market-prewarm 패턴.
 * Upbit KRW 마켓(유의 제외·거래대금 하한·상위 60) 일봉 260 + 시세를 캐시에 쓴다.
 * 요청 경로는 캐시만 읽으므로(504 원칙) 이 크론이 유일한 외부 fetch 지점.
 * 코인은 24/7 — GH Actions 시간당 1회 트리거.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  const startedAt = Date.now();
  try {
    const snapshots = await fetchUpbitCoinSnapshots();
    const stats = await writeCoinMarketSnapshots(snapshots);
    revalidateTag("daily-30", { expire: 0 });
    revalidateTag("feed-hub", { expire: 0 });
    return withCors(
      NextResponse.json(
        {
          ok: true,
          universe: snapshots.length,
          written: stats.rows,
          withCandles: stats.rowsWithCandles,
          elapsedMs: Date.now() - startedAt,
        },
        { headers: { "Cache-Control": "no-store" } }
      )
    );
  } catch (err) {
    console.warn("[fomo/cron/coin-market-prewarm] failed", (err as Error)?.message);
    return withCors(
      NextResponse.json(
        { ok: false, error: (err as Error)?.message ?? "coin prewarm failed", elapsedMs: Date.now() - startedAt },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
