/**
 * LAB-07 PART B-2 — 중복 실행 방지 잠금.
 *
 * > 같은 시각에 두 번 실행되면 안 된다.
 *
 * 같은 봉으로 두 번 체결하면 거래가 두 배로 쌓이고 자산이 거짓이 된다.
 *
 * ## 임대(lease) 방식인 이유
 *
 * 단순 플래그로 막으면 **한 번 죽은 실행이 영원히 다음 실행을 막는다.**
 * 크론은 프로세스가 죽었는지 모르고, 사람이 알아채기 전까지 페이퍼가 통째로 멈춘다.
 * 그래서 만료 시각을 두고, 지나면 죽은 잠금으로 보고 뺏는다.
 *
 * ## 왜 표인가
 *
 * 프로세스 기억은 재배포마다 초기화된다. 러너가 여러 곳에서 뜰 수도 있다
 * (GitHub Actions 재시도, 수동 실행). **표가 유일하게 공유되는 자리다.**
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/** 잠금 임대 기간. 실행이 이보다 오래 걸리면 다른 실행이 끼어들 수 있다. */
export const LEASE_MS = 10 * 60 * 1000;

export interface Lock {
  job: string;
  holder: string;
  release(): Promise<void>;
}

/**
 * 잠금을 잡는다. 이미 살아 있는 잠금이 있으면 **null** 이다 — 던지지 않는다.
 * 중복 실행은 오류가 아니라 정상적인 경쟁 결과다. 호출자가 조용히 끝내면 된다.
 */
export async function acquireLock(
  prisma: PrismaClient,
  job: string,
  leaseMs = LEASE_MS
): Promise<Lock | null> {
  const holder = `${process.env.GITHUB_RUN_ID ?? "local"}-${randomUUID().slice(0, 8)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseMs);

  // 만료된 잠금은 먼저 치운다. 그래야 아래 create 가 성공한다.
  await prisma.jobLock.deleteMany({ where: { job, expiresAt: { lt: now } } });

  try {
    await prisma.jobLock.create({ data: { job, holder, expiresAt } });
  } catch {
    // 유니크 충돌 — 살아 있는 잠금이 있다.
    return null;
  }

  return {
    job,
    holder,
    async release() {
      // **내 잠금만** 푼다. 만료 뒤 남이 잡았을 수 있는데 그걸 풀면 안 된다.
      await prisma.jobLock.deleteMany({ where: { job, holder } });
    },
  };
}

/** 잠금을 잡고 실행한다. 못 잡으면 `fn` 을 돌리지 않고 null 을 준다. */
export async function withLock<T>(
  prisma: PrismaClient,
  job: string,
  fn: () => Promise<T>
): Promise<T | null> {
  const lock = await acquireLock(prisma, job);
  if (!lock) return null;
  try {
    return await fn();
  } finally {
    await lock.release();
  }
}
