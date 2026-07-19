import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, verifyToken } from "@/lib/auth/jwt";
import { readUserHistory, userLedgerActor } from "@/lib/judgment-ledger";
import { corsJson, withCors } from "@/lib/fomo";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim() ?? "";
  if (sessionId.length > 128) return corsJson({ error: "입력이 너무 깁니다" }, { status: 400 });
  const userId = verifyToken(extractBearerToken(req.headers.get("authorization")) ?? "");
  const actors = [
    userLedgerActor({ userId }),
    userLedgerActor({ sessionId }),
  ].filter((actor): actor is `user:${string}` => !!actor);
  if (actors.length === 0) return corsJson({ items: [] }, { headers: { "Cache-Control": "no-store" } });
  try {
    const items = await readUserHistory([...new Set(actors)]);
    return corsJson({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.warn("[ledger/history] read failed", error);
    return corsJson({ error: "판단 기록 조회 실패" }, { status: 500 });
  }
}
