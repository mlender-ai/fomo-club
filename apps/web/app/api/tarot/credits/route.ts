import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 크레딧 잔액 조회 — 실제 DB 연결은 Phase 2-2 (인증) 구현 후 Prisma로 교체
// 현재는 API 구조만 확립
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId")?.trim();

  if (!userId) {
    return NextResponse.json({ error: "userId is required", code: "MISSING_USER" }, { status: 400 });
  }

  // TODO: Phase 2-2에서 Prisma CreditLedger SUM으로 교체
  return NextResponse.json({ userId, credits: 0 });
}
