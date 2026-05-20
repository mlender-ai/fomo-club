import { prisma } from "./prisma";
import { addCredit } from "./credits";

const STREAK_REWARD_DAYS = 7;
const STREAK_REWARD_CREDITS = 3;

// KST(UTC+9) 기준 날짜 문자열 "YYYY-MM-DD"
function toKSTDateString(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export async function processLoginStreak(
  userId: string
): Promise<{ streakCount: number; rewardGiven: boolean; rewardCredits: number }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { streakCount: true, streakLastDate: true },
  });

  const todayKST = toKSTDateString(new Date());
  const lastDateKST = user.streakLastDate ? toKSTDateString(user.streakLastDate) : null;

  // 오늘 이미 로그인한 경우 — 변경 없음
  if (lastDateKST === todayKST) {
    return { streakCount: user.streakCount, rewardGiven: false, rewardCredits: 0 };
  }

  const yesterdayKST = toKSTDateString(new Date(Date.now() - 86_400_000));
  const newStreak = lastDateKST === yesterdayKST ? user.streakCount + 1 : 1;

  await prisma.user.update({
    where: { id: userId },
    data: { streakCount: newStreak, streakLastDate: new Date() },
  });

  // 7의 배수 달성 시 보상 (멱등성: referenceId로 중복 방지)
  if (newStreak % STREAK_REWARD_DAYS === 0) {
    const referenceId = `streak_${STREAK_REWARD_DAYS}_${todayKST}_${userId}`;
    const existing = await prisma.tarotCreditLedger.findFirst({
      where: { userId, referenceId, reason: "STREAK_REWARD" },
    });
    if (!existing) {
      await addCredit(userId, STREAK_REWARD_CREDITS, "STREAK_REWARD", referenceId);
      return { streakCount: newStreak, rewardGiven: true, rewardCredits: STREAK_REWARD_CREDITS };
    }
  }

  return { streakCount: newStreak, rewardGiven: false, rewardCredits: 0 };
}
