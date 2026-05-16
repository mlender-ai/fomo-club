import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tarot/auth";
import { addCredit, getCreditBalance } from "@/lib/tarot/credits";
import { prisma } from "@/lib/tarot/prisma";

export const dynamic = "force-dynamic";

const REWARD_AMOUNT = 1;
const REWARD_COOLDOWN_MS = 30 * 60 * 1000; // 30분

interface RewardBody {
  idempotencyKey?: string;
}

function errorJson(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = (await req.json().catch(() => ({}))) as RewardBody;
  const idempotencyKey = body.idempotencyKey?.trim();
  if (!idempotencyKey) return errorJson("idempotencyKey is required", "MISSING_IDEMPOTENCY_KEY", 400);

  // 멱등성: 이미 처리된 리워드면 현재 잔액만 반환
  const existing = await prisma.tarotCreditLedger.findFirst({
    where: { userId, referenceId: idempotencyKey, reason: "REWARD_AD" },
  });
  if (existing) {
    const credits = await getCreditBalance(userId);
    return NextResponse.json({ credits, duplicate: true });
  }

  // 쿨다운: 최근 30분 내 리워드 수령 여부 확인
  const recentReward = await prisma.tarotCreditLedger.findFirst({
    where: {
      userId,
      reason: "REWARD_AD",
      createdAt: { gte: new Date(Date.now() - REWARD_COOLDOWN_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recentReward) {
    const nextAvailableMs = recentReward.createdAt.getTime() + REWARD_COOLDOWN_MS;
    return errorJson("쿨다운 중입니다", "REWARD_COOLDOWN", 429);
  }

  const credits = await addCredit(userId, REWARD_AMOUNT, "REWARD_AD", idempotencyKey);
  return NextResponse.json({ credits, rewarded: REWARD_AMOUNT });
}
