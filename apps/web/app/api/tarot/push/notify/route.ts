import { NextRequest, NextResponse } from "next/server";
import { notifyFavoriteChanges, notifyDailyCardPair } from "@/lib/tarot/pushNotifier";

export const dynamic = "force-dynamic";

/**
 * POST /api/tarot/push/notify
 * 관심 종목 변동 알림 발송 (cron 또는 수동 트리거)
 * TAROT_API_SECRET 헤더로 보호
 *
 * ?type=daily — 데일리 "종목+카드" 페어 카피 발송
 * ?type=change (기본) — 변동률 ±3% 이상 알림
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-api-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || secret !== process.env["TAROT_API_SECRET"]) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get("type") ?? "change";

  if (type === "daily") {
    const result = await notifyDailyCardPair();
    return NextResponse.json(result);
  }

  const result = await notifyFavoriteChanges();
  return NextResponse.json(result);
}
