import { NextResponse } from "next/server";
import { withCors } from "../../../../lib/fomo";
import { readInvalidationSummary } from "../../../../lib/ledger/invalidation-summary";

/**
 * 무효 조건 성적 (WO-SUB-07 §8).
 *
 * 원장의 저장 레코드만 읽는다 — 외부 소스·LLM 없음(INV-14).
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  try {
    const summary = await readInvalidationSummary();
    return withCors(
      NextResponse.json(summary, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } })
    );
  } catch (error) {
    console.warn("[fomo/invalidation-summary] failed", (error as Error)?.message);
    return withCors(NextResponse.json({ error: "invalidation summary unavailable" }, { status: 500 }));
  }
}
