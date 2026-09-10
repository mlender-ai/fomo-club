import { NextResponse } from "next/server";
import { corsJson, withCors } from "../../../../lib/fomo";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

/**
 * Retired by WO-M1. TasteSignal lacked priceAt and was mutable, so accepting new writes would create a
 * second historical source. Current clients use /ledger/actions; 410 makes stale clients fail explicitly.
 */
export async function POST() {
  return corsJson(
    { error: "판단 기록 API가 변경되었습니다.", code: "JUDGMENT_LEDGER_REQUIRED" },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
