import { NextResponse } from "next/server";
import { corsJson, withCors } from "../../../../../lib/fomo";
import { buildBusinessContextCoverage } from "../../../../../lib/business-context/coverage";

/**
 * 합성 커버리지 대시보드 — WO-SUB-03 §7.
 * **저장된 레코드만 읽는다.** 소스 재조회·LLM 호출 없음(§3 규칙 7).
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    return corsJson(await buildBusinessContextCoverage(), {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.warn("[fomo/business-context/coverage] failed", (error as Error)?.message);
    return corsJson({ error: "합성 커버리지 조회 실패" }, { status: 500 });
  }
}
