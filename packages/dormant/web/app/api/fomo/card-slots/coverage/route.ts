import { NextResponse } from "next/server";
import { corsJson, withCors } from "../../../../../lib/fomo";
import { buildCardSlotCoverage } from "../../../../../lib/card-slots/coverage";

/**
 * 3슬롯 커버리지 대시보드 — WO-SUB-08 AC#8.
 *
 * GET /api/fomo/card-slots/coverage
 *
 * 08 §4-1: "②③이 모두 없으면 카드는 지금과 동일한 모습이 된다. 그런 카드의 비율을 계측하고
 * 대시보드에 노출한다. **이 비율이 곧 이 배치의 진척도다.**"
 *
 * 실측(2026-08-04): `①만` 128/332(38.6%) — UNCLASSIFIED 95 + BANK 19 + MATURE_INCOME 9 가
 * 슬롯 ③ 축을 못 만든다. **이 카드들이 지금과 동일하게 보이는 것이 정상이고 억지로 채우지
 * 않는다.** 슬롯 ③ 커버리지가 올라갈 때 이 숫자가 줄어드는 것이 여기서 보여야 한다.
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    const report = await buildCardSlotCoverage();
    // 종목별 행은 대시보드에 필요 없다 — 응답만 커진다. 집계만 낸다.
    const { rows: _rows, ...summary } = report;
    return corsJson(summary, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
  } catch (error) {
    return corsJson({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
