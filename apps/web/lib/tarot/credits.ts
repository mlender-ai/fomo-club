import { prisma } from "./prisma";
import type { TarotCreditReason } from "@prisma/client";

const SIGNUP_BONUS = 3;

export async function getCreditBalance(userId: string): Promise<number> {
  const result = await prisma.tarotCreditLedger.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

export async function addCredit(
  userId: string,
  amount: number,
  reason: TarotCreditReason,
  referenceId?: string
): Promise<number> {
  const data: { userId: string; amount: number; reason: TarotCreditReason; referenceId?: string | null } = { userId, amount, reason };
  if (referenceId !== undefined) data.referenceId = referenceId;
  await prisma.tarotCreditLedger.create({ data });
  return getCreditBalance(userId);
}

export async function deductCredit(
  userId: string,
  amount: number,
  reason: TarotCreditReason,
  referenceId?: string
): Promise<{ ok: boolean; balance: number }> {
  // P1-3: 동시 차감 race(이중지출) 방지. ledger 합산 모델은 잠글 행이 없어
  // (잔액=SUM) 단순 read→check→insert 가 write-skew에 취약하다. 트랜잭션 안에서
  // userId 단위 advisory lock 으로 직렬화 → 잔액 1에 동시 N요청이 와도 1건만 통과.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;

    const agg = await tx.tarotCreditLedger.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    const balance = agg._sum.amount ?? 0;
    if (balance < amount) return { ok: false, balance };

    const data: { userId: string; amount: number; reason: TarotCreditReason; referenceId?: string | null } = { userId, amount: -amount, reason };
    if (referenceId !== undefined) data.referenceId = referenceId;
    await tx.tarotCreditLedger.create({ data });
    return { ok: true, balance: balance - amount };
  });
}

export async function grantSignupBonus(userId: string): Promise<void> {
  await prisma.tarotCreditLedger.create({
    data: { userId, amount: SIGNUP_BONUS, reason: "SIGNUP_BONUS" },
  });
}
