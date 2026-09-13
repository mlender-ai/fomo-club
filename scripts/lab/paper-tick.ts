/**
 * LAB-07 — 페이퍼 실행기. **1시간마다 서버에서 한 번 돈다.**
 *
 * ## 실행기를 새로 만들지 않았다 (PART A · 하지 말 것 1)
 *
 * `@fomo/lab` 의 `execute()` — 백테스트가 쓰는 **바로 그 함수**를 부른다.
 * 다른 것은 `DataSource` 에 넣는 봉뿐이다: 백테스트는 과거 전부, 페이퍼는
 * **지난 실행 이후 새로 닫힌 봉**.
 *
 * 같다는 것은 주장이 아니라 검사다 — `engine-resume.test.ts` 가
 * "한 번에 돌린 것 == 조각내 이어 돌린 것" 을 거래·자산 지문까지 비교한다.
 *
 * ## 한 번 실행이 하는 일 (PART B)
 *
 *   1. 잠금을 잡는다 (B-2 — 같은 시각 두 번 실행 금지)
 *   2. 시세가 stale 인가 → 그러면 **신규 진입 중단** (PART C)
 *   3. 전략마다: 상태를 읽고 → 새 봉으로 `execute()` → 거래·자산 적재 → 상태 저장
 *   4. 리스크 한도 확인 → 넘으면 **자동 정지 + 사유 + 알림** (PART E)
 *
 *   npm run lab:paper
 *   npm run lab:paper -- --dry     # 쓰지 않고 무엇이 일어날지만 본다
 */
import { Prisma, PrismaClient } from "@prisma/client";
import {
  DEFAULT_EXECUTOR,
  MultiSymbolSource,
  assertStrategyDefinition,
  computeMetrics,
  execute,
  feedStatus,
  reviveState,
  type Bar,
  type ExecutorState,
  type Gap,
} from "@fomo/lab";

import { STALE_AFTER_MS } from "./collect/config";
import { alert, runJob } from "./collect/job";
import { withLock } from "./collect/lock";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");

/** LAB-07 §0 — 전략당 시작 자본. */
const INITIAL_CAPITAL = 10_000;

/**
 * PART E-2 — 리스크 한도. 넘으면 **자동 정지**한다.
 *
 * 환경변수로 덮을 수 있다. 검증 스크립트가 **실제 경로를 그대로 타기 위해** 쓴다 —
 * 지표를 가짜로 써넣어 검사하면 그 검사는 코드가 아니라 가짜 데이터를 본다.
 */
export const MDD_LIMIT_PCT = Number(process.env.LAB_MDD_LIMIT_PCT ?? "-25");
export const MAX_CONSECUTIVE_LOSSES = Number(process.env.LAB_MAX_CONSECUTIVE_LOSSES ?? "8");

interface TickReport {
  strategy: string;
  bars: number;
  newTrades: number;
  equity: number | null;
  stopped: string | null;
}

/** 페이퍼 Run 을 찾거나 만든다. 전략당 하나다. */
async function ensurePaperRun(strategyId: string, symbols: readonly string[]) {
  const existing = await prisma.run.findFirst({
    where: { strategyId, kind: "PAPER" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  return prisma.run.create({
    data: {
      strategyId,
      kind: "PAPER",
      periodStart: new Date(),
      // **페이퍼는 진행중이라 periodEnd 가 null 이다**(LAB-02 PART A-2).
      initialCapital: new Prisma.Decimal(INITIAL_CAPITAL),
      dataVersion: `live:${symbols.join("+")}:H1`,
      paramsVersion: "lab07-1:combos1",
    },
  });
}

async function loadNewBars(
  symbols: readonly string[],
  after: Date | null
): Promise<{ bySymbol: Record<string, Bar[]>; gaps: Record<string, Gap[]> }> {
  const bySymbol: Record<string, Bar[]> = {};
  const gaps: Record<string, Gap[]> = {};
  for (const symbol of symbols) {
    const rows = await prisma.candle.findMany({
      where: { symbol, interval: "H1", ...(after ? { at: { gt: after } } : {}) },
      orderBy: { at: "asc" },
      select: { at: true, open: true, high: true, low: true, close: true, volume: true },
    });
    bySymbol[symbol] = rows.map((r) => ({
      at: r.at,
      open: r.open.toNumber(),
      high: r.high.toNumber(),
      low: r.low.toNumber(),
      close: r.close.toNumber(),
      volume: r.volume.toNumber(),
    }));
    const gapRows = await prisma.dataGap.findMany({ where: { symbol, interval: "H1" } });
    gaps[symbol] = gapRows.map((g) => ({ fromAt: g.fromAt, toAt: g.toAt, missing: g.missing }));
  }
  return { bySymbol, gaps };
}

/**
 * 첫 실행이면 워밍업이 필요하다. 지표가 값을 내려면 봉이 쌓여 있어야 하는데
 * 상태가 비어 있으면 앞쪽 봉에서 조건이 전부 null 이 된다.
 *
 * **워밍업 구간의 거래는 버리지 않는다** — 그 구간도 실제로 돈 것이다.
 * 대신 시작 시각을 뒤로 잡아 워밍업이 끝난 뒤부터 시작한다.
 */
const WARMUP_BARS = 200;

async function tickStrategy(
  strategy: { id: string; name: string; version: number; definition: Prisma.JsonValue },
  feedOk: boolean
): Promise<TickReport> {
  const definition = assertStrategyDefinition(strategy.definition);
  const symbols = definition.universe.symbols;
  const label = `${strategy.name} v${strategy.version}`;

  const run = await ensurePaperRun(strategy.id, symbols);
  const saved = await prisma.paperState.findUnique({ where: { runId: run.id } });
  const state: ExecutorState | undefined = saved ? (reviveState(saved.state) ?? undefined) : undefined;

  let after = saved?.lastBarAt ?? null;
  if (!after) {
    // 첫 실행 — 워밍업만큼 거슬러 올라간 지점부터 본다.
    const firstSymbol = symbols[0];
    if (!firstSymbol) throw new Error("유니버스가 비었다");
    const first = await prisma.candle.findFirst({
      where: { symbol: firstSymbol, interval: "H1" },
      orderBy: { at: "desc" },
      skip: WARMUP_BARS,
      select: { at: true },
    });
    after = first?.at ?? null;
  }

  const { bySymbol, gaps } = await loadNewBars(symbols, after);
  const barCount = Object.values(bySymbol).reduce((n, bars) => n + bars.length, 0);

  // **새 봉이 없어도 리스크 한도는 본다**(PART E).
  //
  // 처음엔 여기서 조기 반환했는데, 그러면 시세가 멈춘 동안 한도를 넘긴 전략이
  // **영원히 안 멈춘다.** 봉이 안 와서 안 멈춘다는 것은 이유가 되지 않는다 —
  // 오히려 그때가 더 위험하다. verify-paper 가 그걸 잡았다.
  if (barCount === 0) {
    const stopped = await reviewRiskOnly(strategy.id, run.id, label);
    return { strategy: label, bars: 0, newTrades: 0, equity: null, stopped };
  }

  const result = execute({
    definition,
    source: new MultiSymbolSource({ bySymbol, gaps }),
    config: { ...DEFAULT_EXECUTOR, initialCapital: INITIAL_CAPITAL },
    // **시세가 끊기면 신규 진입을 막는다**(PART C). 보유는 유지되고 청산은 그대로 평가된다.
    blockNewEntries: !feedOk,
    gaps,
    ...(state ? { state } : {}),
  });

  const lastBarAt = Object.values(bySymbol)
    .flat()
    .reduce<Date | null>((latest, bar) => (!latest || bar.at > latest ? bar.at : latest), null);

  if (DRY) {
    return {
      strategy: label,
      bars: result.bars,
      newTrades: result.trades.length,
      equity: result.equity[result.equity.length - 1]?.equity ?? null,
      stopped: null,
    };
  }

  // ── 적재 ────────────────────────────────────────────────────────────────
  if (result.trades.length > 0) {
    await prisma.trade.createMany({
      data: result.trades.map((t) => ({
        runId: run.id,
        symbol: t.symbol,
        side: t.side,
        entryAt: t.entryAt,
        entryPrice: new Prisma.Decimal(t.entryPrice),
        entryReason: t.entryReason,
        exitAt: t.exitAt,
        exitPrice: new Prisma.Decimal(t.exitPrice),
        exitReason: t.exitReason,
        qty: new Prisma.Decimal(t.qty),
        fee: new Prisma.Decimal(t.fee),
        slippage: new Prisma.Decimal(t.slippage),
        funding: new Prisma.Decimal(t.funding),
        pnl: new Prisma.Decimal(t.pnl),
        pnlPct: t.pnlPct,
      })),
    });
  }

  if (result.equity.length > 0) {
    // **구멍을 메우지 않는다**(PART C). 받은 봉의 시각에만 점을 찍는다 —
    // 끊긴 구간은 `Equity` 에 점이 없고, 화면이 그 자리에서 선을 끊는다.
    await prisma.equity.createMany({
      data: result.equity.map((p) => ({
        runId: run.id,
        at: p.at,
        equity: new Prisma.Decimal(p.equity),
        cash: new Prisma.Decimal(p.cash),
        unrealized: new Prisma.Decimal(p.unrealized),
        drawdown: p.drawdown,
      })),
      skipDuplicates: true,
    });
  }

  await prisma.paperState.upsert({
    where: { runId: run.id },
    create: {
      runId: run.id,
      state: result.state as unknown as Prisma.InputJsonValue,
      lastBarAt,
    },
    update: { state: result.state as unknown as Prisma.InputJsonValue, lastBarAt },
  });

  // ── 지표 갱신 ───────────────────────────────────────────────────────────
  const metrics = (await recomputeMetrics(run.id)) ?? computeMetrics([], [], INITIAL_CAPITAL);

  await prisma.metric.upsert({
    where: { runId: run.id },
    create: { runId: run.id, ...metricFields(metrics) },
    update: { ...metricFields(metrics), computedAt: new Date() },
  });

  // ── 리스크 한도 (PART E) ────────────────────────────────────────────────
  const stopped = await enforceRiskLimits(strategy.id, label, metrics);

  return {
    strategy: label,
    bars: result.bars,
    newTrades: result.trades.length,
    equity: result.equity[result.equity.length - 1]?.equity ?? null,
    stopped,
  };
}


/**
 * 새 봉이 없을 때도 **이미 쌓인 것으로 한도를 본다.**
 *
 * 지표를 다시 재는 비용이 아깝지만, 안 보는 비용이 더 크다 —
 * 한도를 넘긴 전략이 돌고 있는 상태가 눈에 안 띄는 것이 이 프로젝트의 반복 실패다.
 */
async function reviewRiskOnly(
  strategyId: string,
  runId: string,
  label: string
): Promise<string | null> {
  const metrics = await recomputeMetrics(runId);
  if (!metrics) return null;
  if (!DRY) {
    await prisma.metric.upsert({
      where: { runId },
      create: { runId, ...metricFields(metrics) },
      update: { ...metricFields(metrics), computedAt: new Date() },
    });
  }
  return DRY ? null : enforceRiskLimits(strategyId, label, metrics);
}

/** 적재된 거래·자산으로 지표를 다시 잰다. */
async function recomputeMetrics(runId: string) {
  const [allTrades, allEquity] = await Promise.all([
    prisma.trade.findMany({ where: { runId }, orderBy: { entryAt: "asc" } }),
    prisma.equity.findMany({ where: { runId }, orderBy: { at: "asc" } }),
  ]);
  if (allEquity.length === 0) return null;
  return computeMetrics(
    allTrades.flatMap((t) =>
      t.exitAt && t.exitPrice && t.pnl
        ? [{
            symbol: t.symbol,
            side: t.side,
            entryAt: t.entryAt,
            entryPrice: t.entryPrice.toNumber(),
            entryReason: t.entryReason,
            exitAt: t.exitAt,
            exitPrice: t.exitPrice.toNumber(),
            exitReason: t.exitReason ?? "MANUAL",
            qty: t.qty.toNumber(),
            fee: t.fee.toNumber(),
            slippage: t.slippage.toNumber(),
            funding: t.funding.toNumber(),
            pnl: t.pnl.toNumber(),
            pnlPct: t.pnlPct ?? 0,
            barsHeld: 0,
          }]
        : []
    ),
    allEquity.map((p) => ({
      at: p.at,
      equity: p.equity.toNumber(),
      cash: p.cash.toNumber(),
      unrealized: p.unrealized.toNumber(),
      drawdown: p.drawdown,
    })),
    INITIAL_CAPITAL
  );
}

function metricFields(m: ReturnType<typeof computeMetrics>) {
  return {
    cagr: m.cagr,
    totalReturn: m.totalReturn,
    mdd: m.mdd,
    cagrMdd: m.cagrMdd,
    sharpe: m.sharpe,
    sortino: m.sortino,
    trades: m.trades,
    winRate: m.winRate,
    profitFactor: m.profitFactor,
    avgHoldHours: m.avgHoldHours,
  };
}

/**
 * PART E — 한도를 넘으면 **자동 정지 + 사유 + 알림.**
 *
 * **정지된 전략은 표에 남는다. 지우지 않는다**(하지 말 것 5).
 */
async function enforceRiskLimits(
  strategyId: string,
  label: string,
  metrics: ReturnType<typeof computeMetrics>
): Promise<string | null> {
  const reasons: string[] = [];
  if (metrics.mdd !== null && metrics.mdd <= MDD_LIMIT_PCT) {
    reasons.push(`MDD ${metrics.mdd.toFixed(1)}% 가 한도 ${MDD_LIMIT_PCT}% 를 넘었다`);
  }
  if (metrics.maxConsecutiveLoss >= MAX_CONSECUTIVE_LOSSES) {
    reasons.push(
      `연속 손실 ${metrics.maxConsecutiveLoss}회가 한도 ${MAX_CONSECUTIVE_LOSSES}회를 넘었다`
    );
  }
  if (reasons.length === 0) return null;

  const current = await prisma.strategy.findUnique({
    where: { id: strategyId },
    select: { status: true },
  });
  // 이미 멈춘 것을 다시 멈추지 않는다 — 알림이 매 시각 울면 아무도 안 본다.
  if (current?.status === "STOPPED") return null;

  const stopReason = `자동 정지: ${reasons.join(" · ")}`;
  await prisma.strategy.update({
    where: { id: strategyId },
    data: { status: "STOPPED", stoppedAt: new Date(), stopReason },
  });
  await alert(`전략 자동 정지 — ${label}\n${stopReason}`);
  return stopReason;
}

async function main(): Promise<void> {
  // PART B-2 — 같은 시각에 두 번 돌지 않는다.
  const outcome = await withLock(prisma, "paper-tick", async () => {
    return runJob(prisma, "paper-tick", async () => {
      // PART C — 시세가 stale 이면 신규 진입을 막는다.
      const prices = await prisma.latestPrice.findMany({
        select: { symbol: true, fetchedAt: true },
      });
      const feed = feedStatus(
        prices.map((p) => ({ symbol: p.symbol, fetchedAt: p.fetchedAt })),
        new Date(),
        STALE_AFTER_MS
      );
      if (!feed.ok) {
        console.log(`⚠️  시세 끊김 — 신규 진입 중단 (${feed.blocked.join(", ") || "수신 없음"})`);
      }

      const strategies = await prisma.strategy.findMany({
        where: { status: { in: ["RUNNING", "DRAFT"] } },
        select: { id: true, name: true, version: true, definition: true },
      });

      const reports: TickReport[] = [];
      for (const strategy of strategies) {
        reports.push(await tickStrategy(strategy, feed.ok));
      }

      for (const report of reports) {
        console.log(
          `  ${report.strategy.padEnd(16)} 봉 ${String(report.bars).padStart(4)} · ` +
            `신규거래 ${String(report.newTrades).padStart(3)} · ` +
            `자산 ${report.equity?.toFixed(2) ?? "—"}` +
            (report.stopped ? `\n     🛑 ${report.stopped}` : "")
        );
      }

      return {
        rows: reports.reduce((n, r) => n + r.newTrades, 0),
        detail: {
          전략: reports.length,
          시세: feed.ok ? "정상" : `끊김(${feed.blocked.join(",")})`,
          신규거래: reports.reduce((n, r) => n + r.newTrades, 0),
          정지: reports.filter((r) => r.stopped).length,
        },
      };
    });
  });

  if (outcome === null) {
    console.log("다른 실행이 돌고 있다 — 건너뛴다 (중복 실행 방지)");
    await prisma.$disconnect();
    process.exit(0);
  }

  await prisma.$disconnect();
  process.exit(outcome.ok ? 0 : 1);
}

void main();
