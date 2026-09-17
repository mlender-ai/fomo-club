/**
 * LAB-03 완료확인 10 — **실패 알림이 오는지 테스트했다.**
 *
 * "알림 코드를 썼다"는 확인이 아니다. 확인해야 하는 것은 셋이다:
 *   1. **1회 실패로는 안 온다** — 잡음에 알림이 울면 아무도 안 본다
 *   2. **2회 연속이면 온다**
 *   3. 성공하면 연속 카운트가 **0으로 리셋**된다
 *
 * 그리고 판정이 **프로세스 기억이 아니라 표**에서 나오는지도 본다. 기억이면
 * 재배포마다 초기화돼 영원히 "1회째" 가 되고, 알림이 안 오는 감시는 없는 감시다.
 * 그래서 각 단계를 **새 PrismaClient·새 runJob 호출**로 돌린다.
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/lab/verify-alert.ts
 */
import { PrismaClient } from "@prisma/client";

import { ALERT_AFTER_CONSECUTIVE_FAILURES } from "./collect/config";
import { runJob } from "./collect/job";

const JOB = "__alert-verify";
const prisma = new PrismaClient();

const checks: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** 알림이 실제로 나갔는지 세려고 웹훅을 로컬 서버로 받는다. */
async function withWebhook<T>(fn: (received: string[]) => Promise<T>): Promise<T> {
  const received: string[] = [];
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push(body);
      res.writeHead(200).end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  process.env.LAB_ALERT_WEBHOOK = `http://127.0.0.1:${port}/`;
  try {
    return await fn(received);
  } finally {
    process.env.LAB_ALERT_WEBHOOK = "";
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const fail = async (): Promise<never> => {
  throw new Error("의도된 실패 — 알림 검증");
};
const succeed = async () => ({ rows: 1 });

async function main(): Promise<void> {
  await prisma.collectionRun.deleteMany({ where: { job: JOB } });

  await withWebhook(async (received) => {
    console.log(`임계: ${ALERT_AFTER_CONSECUTIVE_FAILURES}회 연속\n`);

    const first = await runJob(prisma, JOB, fail);
    check("1회 실패 — 연속 1", first.consecutiveFailures === 1);
    check("1회 실패로는 알림이 안 간다", !first.alerted && received.length === 0);

    const second = await runJob(prisma, JOB, fail);
    check("2회 실패 — 연속 2", second.consecutiveFailures === 2);
    check("2회 연속이면 알림이 간다", second.alerted);
    check("웹훅이 실제로 받았다", received.length === 1, `${received.length}건`);
    check(
      "알림 본문에 잡 이름과 사유가 있다",
      received[0]?.includes(JOB) === true && received[0]?.includes("의도된 실패") === true
    );

    const third = await runJob(prisma, JOB, succeed);
    check("성공하면 연속이 0으로 리셋된다", third.consecutiveFailures === 0 && !third.alerted);

    const fourth = await runJob(prisma, JOB, fail);
    check("리셋 후 다시 1회째다 — 알림 없음", fourth.consecutiveFailures === 1 && !fourth.alerted);

    // 판정이 표에서 나오는지: 기억을 통째로 버리고(새 클라이언트) 한 번 더 실패시킨다.
    const fresh = new PrismaClient();
    const fifth = await runJob(fresh, JOB, fail);
    await fresh.$disconnect();
    check(
      "새 프로세스에서도 이어서 센다 — 판정이 표에 있다",
      fifth.consecutiveFailures === 2 && fifth.alerted,
      `연속 ${fifth.consecutiveFailures}`
    );
    check("리셋 후 알림이 한 번 더 갔다", received.length === 2, `${received.length}건`);

    return null;
  });

  await prisma.collectionRun.deleteMany({ where: { job: JOB } });

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} 통과`);
  if (failed.length > 0) {
    console.error("실패:", failed.map((c) => c.name).join(", "));
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
