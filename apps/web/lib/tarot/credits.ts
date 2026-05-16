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
  const balance = await getCreditBalance(userId);
  if (balance < amount) return { ok: false, balance };

  const data: { userId: string; amount: number; reason: TarotCreditReason; referenceId?: string | null } = { userId, amount: -amount, reason };
  if (referenceId !== undefined) data.referenceId = referenceId;
  await prisma.tarotCreditLedger.create({ data });
  return { ok: true, balance: balance - amount };
}

export async function grantSignupBonus(userId: string): Promise<void> {
  await prisma.tarotCreditLedger.create({
    data: { userId, amount: SIGNUP_BONUS, reason: "SIGNUP_BONUS" },
  });
}
