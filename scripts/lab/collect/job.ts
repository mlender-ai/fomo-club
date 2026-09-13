/**
 * LAB-03 PART E-1 — 수집 잡 래퍼.
 *
 * 모든 수집은 이걸 통과한다. 두 가지를 한다:
 *  1. `CollectionRun` 에 결과를 남긴다 — 성공이든 실패든.
 *  2. **2회 연속 실패하면 알린다.** 판정을 사람 기억이 아니라 그 표에서 한다.
 *
 * ## 왜 표에서 판정하나
 *
 * 프로세스가 기억하면 배포·재시작 때마다 초기화된다. 그러면 매번 실패하는 잡이
 * 영원히 "1회째" 로 보여서 알림이 안 온다. **알림이 안 오는 감시는 없는 감시다.**
 */
import { PrismaClient } from "@prisma/client";

import { ALERT_AFTER_CONSECUTIVE_FAILURES } from "./config";

export interface JobResult {
  rows: number;
  detail?: Record<string, unknown>;
}

export interface JobOutcome extends JobResult {
  job: string;
  ok: boolean;
  ms: number;
  error?: string;
  /** 이번 실행까지 연속 실패 횟수. 성공이면 0. */
  consecutiveFailures: number;
  alerted: boolean;
}

/**
 * 알림 한 줄. 웹훅이 설정돼 있으면 보내고, 없으면 **stderr 에 찍는다.**
 *
 * 조용히 넘어가지 않는다 — 알림 경로가 없다는 사실 자체가 로그에 남아야 한다.
 */
async function alert(text: string): Promise<boolean> {
  const url = process.env.LAB_ALERT_WEBHOOK;
  if (!url) {
    console.error(`[ALERT · 웹훅 없음] ${text}`);
    return false;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      console.error(`[ALERT 전송 실패 ${response.status}] ${text}`);
      return false;
    }
    console.error(`[ALERT 전송] ${text}`);
    return true;
  } catch (error) {
    console.error(`[ALERT 전송 오류] ${text} — ${String(error)}`);
    return false;
  }
}

/** 직전 실행들에서 연속 실패가 몇 번인지 센다(이번 실행 제외). */
async function previousConsecutiveFailures(
  prisma: PrismaClient,
  job: string
): Promise<number> {
  const recent = await prisma.collectionRun.findMany({
    where: { job },
    orderBy: { finishedAt: "desc" },
    take: ALERT_AFTER_CONSECUTIVE_FAILURES + 2,
    select: { ok: true },
  });
  let n = 0;
  for (const run of recent) {
    if (run.ok) break;
    n += 1;
  }
  return n;
}

/**
 * 잡 하나를 돌리고 결과를 남긴다.
 *
 * 실패해도 **던지지 않는다** — 기록과 알림이 먼저다. 호출자가 `ok` 를 보고
 * 종료 코드를 정한다.
 */
export async function runJob(
  prisma: PrismaClient,
  job: string,
  fn: () => Promise<JobResult>
): Promise<JobOutcome> {
  const startedAt = new Date();
  let result: JobResult | null = null;
  let error: string | null = null;

  try {
    result = await fn();
  } catch (caught) {
    error = caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught);
  }

  const ok = error === null;
  const ms = Date.now() - startedAt.getTime();
  const before = await previousConsecutiveFailures(prisma, job);
  const consecutiveFailures = ok ? 0 : before + 1;

  await prisma.collectionRun.create({
    data: {
      job,
      ok,
      startedAt,
      rows: result?.rows ?? 0,
      error,
      detail: (result?.detail ?? null) as never,
    },
  });

  let alerted = false;
  if (!ok && consecutiveFailures >= ALERT_AFTER_CONSECUTIVE_FAILURES) {
    alerted = await alert(
      `수집 실패 ${consecutiveFailures}회 연속 — job=${job}\n${error}`
    );
  }

  const outcome: JobOutcome = {
    job,
    ok,
    ms,
    rows: result?.rows ?? 0,
    consecutiveFailures,
    alerted,
    ...(result?.detail === undefined ? {} : { detail: result.detail }),
    ...(error === null ? {} : { error }),
  };

  const tag = ok ? "✅" : "❌";
  console.log(
    `${tag} ${job} — ${outcome.rows}행 · ${(ms / 1000).toFixed(1)}s` +
      (ok ? "" : ` · 연속실패 ${consecutiveFailures}${alerted ? " · 알림 전송" : ""}`)
  );
  if (!ok) console.error(`   ${error}`);
  if (outcome.detail) {
    for (const [key, value] of Object.entries(outcome.detail)) {
      console.log(`   ${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
    }
  }

  return outcome;
}

/** 스크립트 마무리 — 실패면 종료 코드 1. 크론이 실패를 알아야 한다. */
export async function finish(prisma: PrismaClient, outcome: JobOutcome): Promise<never> {
  await prisma.$disconnect();
  process.exit(outcome.ok ? 0 : 1);
}
