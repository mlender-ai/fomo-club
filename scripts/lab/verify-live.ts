/**
 * LAB-08 완료확인 — 전광판·전략 상세를 **DB 앞에서** 확인한다.
 *
 * 지금 진짜 페이퍼는 2일째고 청산된 거래가 0건이라, 화면에서 확인할 수 없는 것이 많다:
 * 순위가 30건에서 열리는지, 정지된 전략이 남는지, 청산 조건이 새지 않는지.
 * **그것들은 데이터가 있어야 보인다.**
 *
 * 그래서 이 스크립트는 `__검증` 이라는 이름의 임시 전략을 DB 에 심고, 화면 데이터 계층을
 * 그대로 태운 뒤, **지운다.** 진짜 페이퍼 숫자는 건드리지 않는다.
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/lab/verify-live.ts
 *   npx tsx scripts/lab/verify-live.ts --keep    # 화면으로 보려고 남긴다
 *   npx tsx scripts/lab/verify-live.ts --clean   # 남긴 것을 지운다
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { findForbiddenKeys } from "@fomo/lab";

import { readLiveBoard, readPaperDetail } from "../../apps/web/lib/lab/live-board";

const prisma = new PrismaClient();

/** 임시 데이터의 이름 앞머리. 지울 때 이걸로 찾는다. */
const PREFIX = "__검증";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 손절선·목표가로 심을 값. **이 숫자가 화면 데이터에 나오면 실패다.** */
const SECRET_STOP = 91234.5678;
const SECRET_TARGET = 131234.5678;

const checks: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function clean(): Promise<void> {
  const strategies = await prisma.strategy.findMany({
    where: { name: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = strategies.map((s) => s.id);
  if (ids.length === 0) return;
  // Run 을 지우면 Trade·Equity·Metric·PaperState 는 onDelete: Cascade 로 같이 간다.
  await prisma.run.deleteMany({ where: { strategyId: { in: ids } } });
  await prisma.strategy.deleteMany({ where: { id: { in: ids } } });
}

interface SeedOptions {
  name: string;
  /** 청산된 거래 수. 30 이상이면 순위가 열린다. */
  trades: number;
  startedDaysAgo: number;
  stopped?: string;
  /** 자산곡선 중간을 몇 시간 비울까. 페이퍼가 멈췄던 구간을 만든다. */
  holeHours?: number;
}

async function seed(options: SeedOptions, now: Date): Promise<string> {
  const strategy = await prisma.strategy.create({
    data: {
      name: `${PREFIX} ${options.name}`,
      version: 1,
      market: "CRYPTO",
      definition: {
        universe: { market: "crypto", symbols: ["BTC"] },
        entries: [{ indicator: "ma_cross", op: "up", params: { fast: 10, slow: 30 } }],
        exits: { stop_pct: 8, target_pct: null, max_hold_days: 30 },
        sizing: { risk_pct: 2, max_positions: 3 },
        leverage: 1,
      },
      status: options.stopped ? "STOPPED" : "RUNNING",
      ...(options.stopped ? { stoppedAt: now, stopReason: options.stopped } : {}),
    },
  });

  const start = new Date(now.getTime() - options.startedDaysAgo * DAY);
  const run = await prisma.run.create({
    data: {
      strategyId: strategy.id,
      kind: "PAPER",
      periodStart: start,
      initialCapital: new Prisma.Decimal(10_000),
      dataVersion: "verify",
      paramsVersion: "verify:combos1",
    },
  });

  // 자산곡선 — 200시간, 가운데를 비워 **멈췄던 구간**을 만든다.
  const points: Prisma.EquityCreateManyInput[] = [];
  let equity = 10_000;
  let peak = 10_000;
  for (let i = 200; i >= 0; i -= 1) {
    if (options.holeHours && i < 120 && i > 120 - options.holeHours) continue;
    const at = new Date(now.getTime() - i * HOUR);
    if (at < start) continue;
    equity *= 1 + Math.sin(i / 9) * 0.004;
    peak = Math.max(peak, equity);
    points.push({
      runId: run.id,
      at,
      equity: new Prisma.Decimal(equity),
      cash: new Prisma.Decimal(equity * 0.7),
      unrealized: new Prisma.Decimal(equity * 0.3),
      drawdown: ((equity - peak) / peak) * 100,
    });
  }
  await prisma.equity.createMany({ data: points, skipDuplicates: true });

  // 청산된 거래.
  const trades: Prisma.TradeCreateManyInput[] = [];
  const reasons = ["STOP", "TARGET", "TIME", "SIGNAL"] as const;
  for (let i = 0; i < options.trades; i += 1) {
    const entryAt = new Date(now.getTime() - (options.trades - i) * 4 * HOUR);
    const exitAt = new Date(entryAt.getTime() + 3 * HOUR);
    const win = i % 3 !== 0;
    trades.push({
      runId: run.id,
      symbol: i % 2 === 0 ? "BTC" : "ETH",
      side: "LONG",
      entryAt,
      entryPrice: new Prisma.Decimal(100_000 + i),
      entryReason: "ma_cross up",
      exitAt,
      exitPrice: new Prisma.Decimal(100_000 + i + (win ? 900 : -600)),
      exitReason: reasons[i % reasons.length],
      qty: new Prisma.Decimal(0.01),
      fee: new Prisma.Decimal(1),
      slippage: new Prisma.Decimal(0.2),
      funding: new Prisma.Decimal(0.35),
      pnl: new Prisma.Decimal(win ? 9 : -6),
      pnlPct: win ? 0.9 : -0.6,
    });
  }
  if (trades.length > 0) await prisma.trade.createMany({ data: trades });

  const wins = trades.filter((t) => (t.pnlPct as number) > 0).length;
  await prisma.metric.create({
    data: {
      runId: run.id,
      cagr: 12.5,
      totalReturn: ((equity - 10_000) / 10_000) * 100,
      mdd: -6.2,
      cagrMdd: 12.5 / 6.2,
      sharpe: 1.1,
      sortino: 1.4,
      trades: options.trades,
      winRate: options.trades > 0 ? (wins / options.trades) * 100 : null,
      profitFactor: 1.35,
      avgHoldHours: 3,
    },
  });

  // 보유 포지션 — **실행기가 저장하는 그대로**, 손절선·목표가를 달고 넣는다.
  // 이 숫자가 화면 데이터로 새어나가는지가 이 검증의 핵심이다.
  await prisma.paperState.create({
    data: {
      runId: run.id,
      lastBarAt: new Date(now.getTime() - HOUR),
      state: {
        cash: 7000,
        peakEquity: peak,
        open: [
          {
            symbol: "BTC",
            side: "LONG",
            entryAt: new Date(now.getTime() - 30 * HOUR).toISOString(),
            entryPrice: 100_000,
            entryReason: "ma_cross up",
            qty: 0.02,
            stopPrice: SECRET_STOP,
            targetPrice: SECRET_TARGET,
            entryCost: 2,
            funding: 0.4,
            maxHoldBars: 720,
            barsHeld: 30,
            exitSignalPending: false,
          },
        ],
        pending: [],
        lastExit: {},
        windows: {},
        whaleHistory: {},
        lastPrice: { BTC: 104_000 },
        barMs: HOUR,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return strategy.id;
}

async function main(): Promise<void> {
  const keep = process.argv.includes("--keep");
  const cleanOnly = process.argv.includes("--clean");

  await clean();
  if (cleanOnly) {
    console.log("임시 데이터를 지웠다.");
    return;
  }

  const now = new Date();
  // 오래 돈 전략(백테스트 대비가 열린다) · 갓 시작한 전략 · 정지된 전략.
  const rankedId = await seed({ name: "오래", trades: 35, startedDaysAgo: 60, holeHours: 5 }, now);
  const youngId = await seed({ name: "신생", trades: 29, startedDaysAgo: 2 }, now);
  await seed({ name: "정지", trades: 40, startedDaysAgo: 40, stopped: "자동 정지 — MDD 한도 초과" }, now);

  const board = await readLiveBoard(now);
  const json = JSON.stringify(board);

  console.log("\nPART A — 전광판");
  check(
    "표본 30건 이상이면 **순위가 매겨진다**",
    board.ranked.some((r) => r.strategyId === rankedId),
    `순위권 ${board.ranked.length}개`
  );
  check(
    "**표본 30건 미만은 순위에서 빠진다**(LAB-00 §7)",
    board.unranked.some((r) => r.strategyId === youngId) &&
      !board.ranked.some((r) => r.strategyId === youngId),
    `표본 부족 ${board.unranked.length}개`
  );
  check(
    "**정지된 전략이 표에 남는다** — 사유와 함께",
    board.stopped.some((r) => r.label.includes("정지") && (r.stopReason ?? "").length > 0),
    board.stopped.map((r) => r.label).join(", ")
  );
  check(
    "**벤치마크가 항상 있다**",
    board.benchmark.returnPct !== null,
    `${board.benchmark.label} ${board.benchmark.returnPct?.toFixed(2)}%`
  );
  check(
    "순위는 **수익/낙폭** 순이다 — 수익률 순이 아니다",
    board.ranked.every(
      (row, i) => i === 0 || (board.ranked[i - 1]?.cagrMdd ?? -Infinity) >= (row.cagrMdd ?? -Infinity)
    )
  );
  check("**페이퍼 한계 문구가 나간다**", board.caveat.length > 0);
  check(
    "페이퍼가 멈췄던 구간이 **경고로 나온다** — 메우지 않는다",
    board.warnings.some((w) => w.kind === "paper" && w.text.includes("멈췄던")),
    board.warnings.map((w) => w.kind).join(", ")
  );
  check(
    "운용 일수를 **Run 시작 기준**으로 센다 — 워밍업 재생분을 보태지 않는다",
    board.days !== null && Math.round(board.days) === 60,
    `${board.days?.toFixed(1)}일`
  );

  console.log("\nPART B-2 — 청산 조건이 화면 밖으로 나가지 않는다");
  const leaked = findForbiddenKeys(board);
  check("금지된 칸 이름이 응답에 없다", leaked.length === 0, leaked.join(", ") || "없음");
  check(
    "**손절가 숫자가 응답 어디에도 없다**",
    !json.includes(String(SECRET_STOP)) && !json.includes("91234"),
    `${SECRET_STOP} 를 심고 확인`
  );
  check(
    "**목표가 숫자가 응답 어디에도 없다**",
    !json.includes(String(SECRET_TARGET)) && !json.includes("131234")
  );

  const position = [...board.ranked, ...board.unranked].flatMap((r) => r.positions)[0];
  check(
    "보유 포지션의 진입가·평가손익·보유 기간은 **보여준다**",
    position !== undefined &&
      position.entryPrice === 100_000 &&
      position.pnlPct !== null &&
      position.heldHours > 0,
    position ? `${position.symbol} ${position.pnlPct?.toFixed(2)}% · ${position.heldHours.toFixed(0)}시간` : "없음"
  );

  console.log("\nPART B-1 — 백테스트 대비");
  const oldDetail = await readPaperDetail(rankedId, now);
  const youngDetail = await readPaperDetail(youngId, now);
  check(
    "**30일이 안 되면 숫자를 내지 않는다**",
    youngDetail?.comparison.enough === false,
    `${youngDetail?.days.toFixed(1)}일`
  );
  check(
    "30일이 지나면 연환산해 나란히 놓는다",
    oldDetail?.comparison.enough === true,
    oldDetail?.comparison.enough
      ? `페이퍼 ${oldDetail.comparison.paperAnnualized?.toFixed(1)}%`
      : "—"
  );
  check(
    "상세의 최근 거래에 **청산 사유**가 있다 — 청산 조건이 아니라 결과다",
    (oldDetail?.recent.length ?? 0) > 0 && oldDetail?.recent.every((t) => t.exitReason !== null) === true,
    `${oldDetail?.recent.length}건`
  );
  check(
    "상세 응답에도 금지된 칸이 없다",
    findForbiddenKeys(oldDetail).length === 0 &&
      !JSON.stringify(oldDetail).includes("91234")
  );
  check(
    "누적 펀딩비를 센다",
    (oldDetail?.metrics.funding ?? 0) > 0,
    `$${oldDetail?.metrics.funding.toFixed(2)}`
  );

  if (keep) {
    console.log("\n임시 데이터를 **남겼다**. 화면으로 확인한 뒤 지운다:");
    console.log("  npx tsx scripts/lab/verify-live.ts --clean");
  } else {
    await clean();
    const left = await prisma.strategy.count({ where: { name: { startsWith: PREFIX } } });
    check("임시 데이터를 **지웠다** — 진짜 숫자에 섞이지 않는다", left === 0);
  }

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
