import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifyToken } from "@/lib/auth/jwt";
import { readSubjectTimeline, userLedgerActor } from "@/lib/judgment-ledger";
import { corsJson, withCors } from "@/lib/fomo";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const canonical = req.nextUrl.searchParams.get("canonical")?.trim() ?? "";
  if (!canonical || canonical.length > 100) return corsJson({ error: "canonical 필요" }, { status: 400 });
  const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim() ?? "";
  const userId = verifyToken(extractBearerToken(req.headers.get("authorization")) ?? "");
  const actors = [userLedgerActor({ userId }), userLedgerActor({ sessionId })].filter(
    (actor): actor is `user:${string}` => !!actor
  );
  try {
    const entries = await readSubjectTimeline(canonical, 80, actors);
    return corsJson({ canonical, entries }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.warn("[ledger/timeline] read failed", error);
    return corsJson({ error: "신호 이력 조회 실패" }, { status: 500 });
  }
}
