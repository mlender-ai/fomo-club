import { NextResponse } from "next/server";
import { corsJson, withCors } from "../../../../../lib/fomo";
import { buildRiskCoverage } from "../../../../../lib/risk/coverage";

/**
 * 종목 고유 리스크 확보 현황 — WO-SUB-FILL PART 2-3.
 * **저장된 레코드만 읽는다.** 소스 재조회·LLM 호출 없음(INV-14).
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    return corsJson(await buildRiskCoverage(), {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.warn("[fomo/risk/coverage] failed", (error as Error)?.message);
    return corsJson({ error: "리스크 커버리지 조회 실패" }, { status: 500 });
  }
}
