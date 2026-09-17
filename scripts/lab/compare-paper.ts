/**
 * LAB-07 PART G — **백테스트 대비 검증.**
 *
 * > 이 비교가 실매매 전 마지막 관문이다.
 *
 * | 차이 | 의미 |
 * |---|---|
 * | 비슷함 | 백테스트가 믿을 만함 |
 * | 페이퍼가 훨씬 나쁨 | **체결 가정이 낙관적이었음** |
 * | 페이퍼가 훨씬 좋음 | 우연 또는 계산 오류 |
 *
 * 판정은 사람이 한다. 이 스크립트는 **숫자를 나란히 놓기만** 한다 —
 * "비슷함" 의 기준을 코드가 정하면 그 기준이 곧 자기 채점이 된다.
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/lab/compare-paper.ts
 */
import { PrismaClient } from "@prisma/client";
import { MIN_SAMPLE } from "@fomo/lab";

const prisma = new PrismaClient();

function cell(value: number | null, digits = 2, suffix = ""): string {
  return (value === null ? "—" : value.toFixed(digits) + suffix).padStart(10);
}

async function main(): Promise<void> {
  const strategies = await prisma.strategy.findMany({
    include: {
      runs: { include: { metric: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { name: "asc" },
  });

  console.log("백테스트 대비 페이퍼 (PART G)\n");
  console.log(
    `  ${"전략".padEnd(16)}${"지표".padEnd(10)}${"백테스트".padStart(10)}${"페이퍼".padStart(10)}${"차이".padStart(10)}`
  );

  let compared = 0;
  for (const strategy of strategies) {
    const backtest = strategy.runs.find((r) => r.kind === "BACKTEST")?.metric ?? null;
    const paperRun = strategy.runs.find((r) => r.kind === "PAPER") ?? null;
    const paper = paperRun?.metric ?? null;
    const label = `${strategy.name} v${strategy.version}`;

    if (!backtest || !paper) {
      console.log(`\n  ${label} — ${!backtest ? "백테스트 없음" : "페이퍼 없음"}`);
      continue;
    }

    compared += 1;
    console.log("");
    const rows: [string, number | null, number | null, string][] = [
      ["CAGR", backtest.cagr, paper.cagr, "%"],
      ["MDD", backtest.mdd, paper.mdd, "%"],
      ["C/M", backtest.cagrMdd, paper.cagrMdd, ""],
      ["샤프", backtest.sharpe, paper.sharpe, ""],
      ["승률", backtest.winRate, paper.winRate, "%"],
      ["거래", backtest.trades, paper.trades, ""],
    ];
    for (const [name, b, p, suffix] of rows) {
      const diff = b !== null && p !== null ? p - b : null;
      console.log(
        `  ${(name === "CAGR" ? label : "").padEnd(16)}${name.padEnd(10)}` +
          `${cell(b, name === "거래" ? 0 : 2, suffix)}${cell(p, name === "거래" ? 0 : 2, suffix)}` +
          `${cell(diff, name === "거래" ? 0 : 2, suffix)}`
      );
    }

    // **표본이 모자라면 비교하지 말라고 말한다**(LAB-00 §7).
    if (paper.trades < MIN_SAMPLE) {
      console.log(
        `  ${"".padEnd(16)}⚠️  페이퍼 표본 ${paper.trades}건 — ${MIN_SAMPLE}건 미만이라 비교를 믿을 수 없다`
      );
    }
    if (paperRun && paperRun.periodStart) {
      const days = (Date.now() - paperRun.periodStart.getTime()) / 86_400_000;
      console.log(`  ${"".padEnd(16)}페이퍼 가동 ${days.toFixed(1)}일`);
    }
  }

  if (compared === 0) {
    console.log("\n비교할 짝이 없다. 백테스트와 페이퍼가 둘 다 있는 전략이 필요하다.");
  }

  // 데이터 끊김 구간 — 페이퍼가 돌지 못한 시간(PART C-1 · 보고할 것).
  const failures = await prisma.collectionRun.findMany({
    where: { job: "paper-tick", ok: false },
    orderBy: { finishedAt: "desc" },
    take: 10,
    select: { finishedAt: true, error: true },
  });
  const total = await prisma.collectionRun.count({ where: { job: "paper-tick" } });
  const okCount = await prisma.collectionRun.count({ where: { job: "paper-tick", ok: true } });
  console.log(
    `\n페이퍼 실행 ${okCount}/${total} 성공` +
      (total > 0 ? ` (${((okCount / total) * 100).toFixed(1)}%)` : "")
  );
  for (const failure of failures) {
    console.log(`  ❌ ${failure.finishedAt.toISOString().slice(0, 16)} ${failure.error ?? ""}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
