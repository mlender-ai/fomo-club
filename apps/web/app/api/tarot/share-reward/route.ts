import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tarot/auth";
import { addCredit, getCreditBalance } from "@/lib/tarot/credits";
import { prisma } from "@/lib/tarot/prisma";

export const dynamic = "force-dynamic";

const REWARD_AMOUNT = 1;

interface ShareRewardBody {
  idempotencyKey?: string;
}

function errorJson(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = (await req.json().catch(() => ({}))) as ShareRewardBody;
  const idempotencyKey = body.idempotencyKey?.trim();
  if (!idempotencyKey) return errorJson("idempotencyKey is required", "MISSING_IDEMPOTENCY_KEY", 400);

  // 멱등성: 이미 처리된 공유 보상이면 현재 잔액만 반환
  const existing = await prisma.tarotCreditLedger.findFirst({
    where: { userId, referenceId: idempotencyKey, reason: "REWARD_SHARE" },
  });
  if (existing) {
    const credits = await getCreditBalance(userId);
    return NextResponse.json({ credits, rewarded: false, alreadyClaimed: true });
  }

  // 하루 1회 제한: 오늘(UTC) 이미 공유 보상을 받았는지 확인
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const todayReward = await prisma.tarotCreditLedger.findFirst({
    where: {
      userId,
      reason: "REWARD_SHARE",
      createdAt: { gte: todayStart },
    },
  });
  if (todayReward) {
    const credits = await getCreditBalance(userId);
    return NextResponse.json({ credits, rewarded: false, alreadyClaimed: true });
  }

  const credits = await addCredit(userId, REWARD_AMOUNT, "REWARD_SHARE", idempotencyKey);
  return NextResponse.json({ credits, rewarded: true, alreadyClaimed: false });
}
