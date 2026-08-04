import { NextResponse } from "next/server";
import { corsJson, withCors } from "../../../../lib/fomo";
import { buildLiveDeckSlots } from "../../../../lib/card-slots/payload";

/**
 * 카드 3슬롯 페이로드 — WO-SUB-08.
 *
 * GET /api/fomo/card-slots
 *
 * **저장된 레코드만 읽는다.** 팩트시트·사업 실체는 배치가 만든 것을 읽고, 여기서 외부 소스를
 * 두들기지 않는다(`fundamentals/coverage` 와 같은 패턴, INV-14 경계).
 *
 * 오늘 덱(10장 안팎)만 조립한다 — 365일 유니버스 332종목을 매 요청마다 조립하면 못 쓸 만큼 느려진다.
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    const payload = await buildLiveDeckSlots();
    // 덱은 하루 한 번 바뀐다. 커버리지 라우트와 같은 캐시 정책.
    return corsJson(payload, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
  } catch (error) {
    return corsJson(
      { date: null, slots: {}, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
