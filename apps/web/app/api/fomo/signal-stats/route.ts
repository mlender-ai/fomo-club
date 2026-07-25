import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../lib/fomo";
import { readSignalStatsForCards } from "../../../../lib/signal-stats";

/**
 * 신호 성적 조회 — WO-P2 §1 산출물 확인용(운영·워크플로 증빙). 읽기 전용.
 * 유형별로 (원장 n≥30 ? 실전 성적 : 백테스트)가 병합돼 나온다. 없는 유형은 아예 키가 없다(정직).
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  const date = kstDate();
  try {
    const stats = await readSignalStatsForCards(date);
    return withCors(
      NextResponse.json(
        { date, stats },
        { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
      )
    );
  } catch (err) {
    console.warn("[fomo/signal-stats] failed", (err as Error)?.message);
    return withCors(NextResponse.json({ date, stats: {} }, { headers: { "Cache-Control": "no-store" } }));
  }
}
