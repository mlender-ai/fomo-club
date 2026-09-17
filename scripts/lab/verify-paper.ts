/**
 * LAB-07 완료확인 3·4·10 — 페이퍼 실행기를 DB 앞에서 확인한다.
 *
 *  3  **재시작해도 포지션이 유지된다**
 *  4  **중복 실행이 막힌다**
 * 10  **알림이 실제로 오는지 테스트했다** — 걸어만 두고 안 오는 경우가 여러 번 있었다
 *
 * 단위 테스트(`engine-resume.test.ts`)는 상태가 이어지는 것을 순수 함수로 본다.
 * 여기서 보는 것은 **DB·잠금·알림이 실제로 동작하는가** 다.
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/lab/verify-paper.ts
 */
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";

import { acquireLock, withLock } from "./collect/lock";

const prisma = new PrismaClient();
const JOB = "__paper-verify";

const execFileAsync = promisify(execFile);

/** 자식 프로세스를 **비동기로** 돌린다 — 부모의 웹훅 서버가 계속 응답해야 한다. */
async function run(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await execFileAsync("npx", args, { encoding: "utf8", env });
}

const checks: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main(): Promise<void> {
  await prisma.jobLock.deleteMany({ where: { job: { startsWith: "__" } } });

  // ── 완료확인 4 — 중복 실행 방지 ──────────────────────────────────────────
  console.log("완료확인 4 — 중복 실행이 막힌다");

  const first = await acquireLock(prisma, JOB);
  check("잠금을 잡는다", first !== null);

  const second = await acquireLock(prisma, JOB);
  check("**두 번째 실행은 잠금을 못 잡는다**", second === null);

  await first?.release();
  const third = await acquireLock(prisma, JOB);
  check("풀면 다시 잡힌다", third !== null);
  await third?.release();

  // 남의 잠금을 풀지 않는다.
  const mine = await acquireLock(prisma, JOB);
  const rows = await prisma.jobLock.findMany({ where: { job: JOB } });
  check("잠금이 한 행이다", rows.length === 1);
  await mine?.release();

  // 임대 만료 — 죽은 실행이 영원히 막지 않는다.
  const expired = await acquireLock(prisma, JOB, -1000);
  const afterExpired = await acquireLock(prisma, JOB);
  check(
    "**만료된 잠금은 뺏긴다** — 죽은 실행이 영원히 막지 않는다",
    afterExpired !== null,
    "임대 −1초로 만든 뒤 재획득"
  );
  await afterExpired?.release();
  await expired?.release();

  let ran = 0;
  const skipped = await withLock(prisma, JOB, async () => {
    ran += 1;
    // 안에서 같은 잠금을 다시 잡으려 하면 실패해야 한다.
    return withLock(prisma, JOB, async () => {
      ran += 1;
      return "inner";
    });
  });
  check("잠금 안에서 같은 잠금을 다시 못 잡는다", skipped === null && ran === 1, `실행 ${ran}회`);

  // ── 완료확인 3 — 재시작 안전 ─────────────────────────────────────────────
  console.log("\n완료확인 3 — 재시작해도 포지션이 유지된다");

  const paperRuns = await prisma.run.findMany({
    where: { kind: "PAPER" },
    include: { paper: true, strategy: true },
  });
  check("페이퍼 Run 이 있다", paperRuns.length > 0, `${paperRuns.length}개`);

  const withState = paperRuns.filter((r) => r.paper !== null);
  check("상태가 DB 에 저장돼 있다", withState.length > 0, `${withState.length}개`);

  const openCounts = withState.map((r) => {
    const state = r.paper?.state as { open?: unknown[] } | null;
    return Array.isArray(state?.open) ? state.open.length : 0;
  });
  check(
    "상태에 보유 포지션이 들어 있다",
    openCounts.some((n) => n > 0),
    `보유 ${openCounts.join(",")}`
  );

  check(
    "마지막 처리 봉 시각이 기록돼 있다",
    withState.every((r) => r.paper?.lastBarAt !== null),
    withState[0]?.paper?.lastBarAt?.toISOString().slice(0, 16) ?? "—"
  );

  check(
    "**페이퍼 Run 은 periodEnd 가 null 이다** — 진행중이다",
    paperRuns.every((r) => r.periodEnd === null)
  );

  // ── 완료확인 10 — 알림 ──────────────────────────────────────────────────
  console.log("\n완료확인 10 — 알림이 실제로 오는지");

  const received: string[] = [];
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
  const previous = process.env.LAB_ALERT_WEBHOOK;
  process.env.LAB_ALERT_WEBHOOK = `http://127.0.0.1:${port}/`;

  try {
    // 자동 정지 알림 경로를 그대로 탄다 — 한도를 넘긴 전략을 하나 만든다.
    const target = paperRuns[0];
    if (!target) {
      check("자동 정지 알림", false, "페이퍼 Run 이 없다");
    } else {
      await prisma.strategy.update({
        where: { id: target.strategyId },
        data: { status: "RUNNING", stoppedAt: null, stopReason: null },
      });

      // **지표를 조작하지 않는다.** 가짜 값을 써넣으면 실행기가 다시 재면서 덮어써서
      // 그 검사는 아무것도 검사하지 않게 된다(실제로 그렇게 짰다가 통과 못 했다).
      //
      // 대신 **한 번 돌려 지표를 실측시키고, 그 값 아래로 한도를 낮춰** 진짜 경로를 탄다.
      //
      // `execFileSync` 를 쓰면 안 된다. 부모의 이벤트 루프가 멈춰서 **위 웹훅 서버가
      // 자식의 요청에 응답하지 못하고**, 자식은 영원히 기다리며 잠금을 쥔 채 멈춘다.
      // 실제로 그렇게 짰다가 검증이 걸려 있었다.
      await run(["tsx", "scripts/lab/paper-tick.ts"], process.env);

      const current = await prisma.metric.findUnique({
        where: { runId: target.id },
        select: { mdd: true },
      });
      const realMdd = current?.mdd ?? 0;
      if (!(realMdd < 0)) {
        check("자동 정지 시험", false, `실측 MDD 가 ${realMdd} — 낙폭이 없어 한도를 시험할 수 없다`);
        return;
      }
      const limit = realMdd / 2;
      console.log(`    (실측 MDD ${realMdd.toFixed(3)}% · 한도를 ${limit.toFixed(3)}% 로 낮춰 시험)`);

      await run(["tsx", "scripts/lab/paper-tick.ts"], {
        ...process.env,
        LAB_MDD_LIMIT_PCT: String(limit),
      });

      const after = await prisma.strategy.findUnique({
        where: { id: target.strategyId },
        select: { status: true, stopReason: true },
      });
      check("MDD 한도를 넘기면 **자동 정지**된다", after?.status === "STOPPED", after?.stopReason ?? "—");
      check(
        "**정지 사유가 기록된다**",
        (after?.stopReason ?? "").includes("자동 정지") && (after?.stopReason ?? "").includes("MDD")
      );
      check("**알림이 실제로 왔다**", received.length > 0, `${received.length}건`);
      check(
        "알림 본문에 전략 이름과 사유가 있다",
        received.some((body) => body.includes("자동 정지") && body.includes("MDD"))
      );
      check(
        "**정지된 전략을 지우지 않았다** — 표에 남는다",
        (await prisma.strategy.count({ where: { id: target.strategyId } })) === 1
      );
    }
  } finally {
    if (previous === undefined) delete process.env.LAB_ALERT_WEBHOOK;
    else process.env.LAB_ALERT_WEBHOOK = previous;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  await prisma.jobLock.deleteMany({ where: { job: { startsWith: "__" } } });

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
