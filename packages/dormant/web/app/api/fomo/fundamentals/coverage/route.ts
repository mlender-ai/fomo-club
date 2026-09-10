import { NextResponse } from "next/server";
import { corsJson, withCors } from "../../../../../lib/fomo";
import { buildCoverageReport } from "../../../../../lib/fundamentals/coverage";

/**
 * 커버리지 대시보드 데이터 — WO-SUB-01 §9, 완료 조건 7.
 *
 * **저장된 팩트시트만 읽는다.** 여기서 SEC·Nasdaq·네이버를 조회하지 않는다
 * (요청 시점 계산 금지 — §4 규칙 5). 갱신은 `/api/fomo/cron/fundamentals` 가 한다.
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    return corsJson(await buildCoverageReport(), {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.warn("[fomo/fundamentals/coverage] failed", (error as Error)?.message);
    return corsJson({ error: "커버리지 리포트 조회 실패" }, { status: 500 });
  }
}
