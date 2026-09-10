import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifyToken } from "@/lib/auth/jwt";
import { corsJson, withCors } from "@/lib/fomo";
import { userLedgerActor } from "@/lib/judgment-ledger";
import { readJudgmentReview } from "@/lib/judgment-review";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim() ?? "";
  if (sessionId.length > 128) return corsJson({ error: "입력이 너무 깁니다" }, { status: 400 });
  const userId = verifyToken(extractBearerToken(req.headers.get("authorization")) ?? "");
  const actors = [userLedgerActor({ userId }), userLedgerActor({ sessionId })]
    .filter((actor): actor is `user:${string}` => !!actor);
  try {
    const review = await readJudgmentReview([...new Set(actors)]);
    return corsJson(review, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.warn("[ledger/review] read failed", error);
    return corsJson({ error: "판단 복기 조회 실패" }, { status: 500 });
  }
}
