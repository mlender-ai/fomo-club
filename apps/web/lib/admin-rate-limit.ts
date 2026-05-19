import { prisma } from "./prisma";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export async function checkLoginRateLimit(ip: string): Promise<{
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

  const recentFailures = await prisma.adminLoginAttempt.count({
    where: {
      ip,
      success: false,
      createdAt: { gte: windowStart },
    },
  });

  if (recentFailures >= MAX_ATTEMPTS) {
    // 가장 오래된 실패 시각 기준으로 잠금 해제까지 남은 시간 계산
    const oldest = await prisma.adminLoginAttempt.findFirst({
      where: { ip, success: false, createdAt: { gte: windowStart } },
      orderBy: { createdAt: "asc" },
    });
    const unlockAt = oldest
      ? oldest.createdAt.getTime() + WINDOW_MINUTES * 60 * 1000
      : Date.now() + WINDOW_MINUTES * 60 * 1000;
    const retryAfterSeconds = Math.ceil((unlockAt - Date.now()) / 1000);

    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - recentFailures - 1,
    retryAfterSeconds: 0,
  };
}

export async function recordLoginAttempt(
  ip: string,
  success: boolean
): Promise<void> {
  await prisma.adminLoginAttempt.create({ data: { ip, success } });

  // 성공 시 해당 IP의 실패 기록 정리
  if (success) {
    await prisma.adminLoginAttempt.deleteMany({
      where: { ip, success: false },
    });
  }

  // 오래된 기록 정리 (24시간 이상)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.adminLoginAttempt.deleteMany({
    where: { createdAt: { lt: cutoff } },
  }).catch(() => {}); // fire-and-forget, 실패해도 무시
}

export function getClientIp(request: Request): string {
  const forwarded = (request.headers as Headers).get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return "unknown";
}
