/**
 * LAB-04 — 백테스트 실행 · 적재.
 *
 * 완료확인 12 — 결과가 `Run`·`Trade`·`Equity`·`Metric` 에 쌓인다.
 *
 * ## 워크포워드로 돈다 (PART E)
 *
 * > **단순 백테스트는 믿을 수 없다.**
 *
 * 구간을 나눠 돌리고 **검증 구간 성과만 적재한다.** 학습 구간 성과는 화면에 내지
 * 않는다(하지 말 것 4) — 그래서 아예 저장하지 않는다. 저장하면 언젠가 화면에 나온다.
 *
 *   npm run lab:backtest -- --strategy <id>
 *   npm run lab:backtest -- --strategy <id> --no-walkforward   # 단일 구간 (참고용)
 */
import { PrismaClient, Prisma } from "@prisma/client";
import {
  DEFAULT_EXECUTOR,
  HistoricalSource,
  assertStrategyDefinition,
  computeMetrics,
  execute,
  splitFolds,
  type Bar,
  type ClosedTrade,
  type EquityPoint,
  type Gap,
} from "@fomo/lab";

const prisma = new PrismaClient();

/** 엔진 버전. 같은 정의라도 엔진이 바뀌면 결과가 다르다 — `Run.paramsVersion` 에 박힌다. */
const ENGINE_VERSION = "lab04-1";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const WALKFORWARD = !process.argv.includes("--no-walkforward");

/** 1시간봉 기준 기본 구간 — 학습 1년, 검증 3개월. */
const IN_SAMPLE_BARS = 365 * 24;
const OUT_OF_SAMPLE_BARS = 90 * 24;

async function loadBars(symbol: string): Promise<Bar[]> {
  const rows = await prisma.candle.findMany({
    where: { symbol, interval: "H1" },
    orderBy: { at: "asc" },
    select: { at: true, open: true, high: true, low: true, close: true, volume: true },
  });
  return rows.map((r) => ({
    at: r.at,
    open: r.open.toNumber(),
    high: r.high.toNumber(),
    low: r.low.toNumber(),
    close: r.close.toNumber(),
    volume: r.volume.toNumber(),
  }));
}

async function loadGaps(symbol: string): Promise<Gap[]> {
  const rows = await prisma.dataGap.findMany({
    where: { symbol, interval: "H1" },
    select: { fromAt: true, toAt: true, missing: true },
  });
  return rows.map((r) => ({ fromAt: r.fromAt, toAt: r.toAt, missing: r.missing }));
}

async function loadFunding(symbol: string): Promise<Map<number, number>> {
  const rows = await prisma.funding.findMany({
    where: { symbol },
    select: { at: true, rate: true },
  });
  return new Map(rows.map((r) => [r.at.getTime(), r.rate.toNumber()]));
}

export interface BacktestOutcome {
  runId: string;
  trades: number;
  bars: number;
  ms: number;
  folds: number;
  blocked: Record<string, number>;
}

async function main(): Promise<void> {
  const strategyId = arg("strategy");
  if (!strategyId) {
    console.error("--strategy <id> 가 필요하다.");
    process.exit(1);
  }

  const strategy = await prisma.strategy.findUnique({ where: { id: strategyId } });
  if (!strategy) {
    console.error(`전략을 못 찾았다: ${strategyId}`);
    process.exit(1);
  }

  // 저장된 정의라도 다시 검증한다. 스키마가 바뀌었을 수 있고,
  // **검증을 안 지난 정의로 돈 백테스트는 무엇을 잰 것인지 알 수 없다.**
  const definition = assertStrategyDefinition(strategy.definition);
  const symbol = definition.universe.symbols[0];
  if (!symbol) throw new Error("유니버스가 비었다");

  const [bars, gaps, funding] = await Promise.all([
    loadBars(symbol),
    loadGaps(symbol),
    loadFunding(symbol),
  ]);
  if (bars.length === 0) {
    console.error(`${symbol} 봉이 없다. 먼저 npm run lab:candles -- --backfill`);
    process.exit(1);
  }

  const initialCapital = 10_000;
  const started = Date.now();

  const folds = WALKFORWARD
    ? splitFolds(bars, { inSampleBars: IN_SAMPLE_BARS, outOfSampleBars: OUT_OF_SAMPLE_BARS })
    : [];

  const allTrades: ClosedTrade[] = [];
  const allEquity: EquityPoint[] = [];
  let totalBars = 0;
  const blocked: Record<string, number> = {};

  /** 검증 구간만 돌린다. 학습 구간은 **돌리지도 저장하지도 않는다.** */
  const segments =
    folds.length > 0 ? folds.map((f) => f.outOfSample.bars) : [bars];

  for (const segment of segments) {
    const result = execute({
      definition,
      source: new HistoricalSource({
        symbol,
        bars: segment,
        gaps,
        funding,
      }),
      config: { ...DEFAULT_EXECUTOR, initialCapital, maxPositions: definition.max_positions },
      gaps: { [symbol]: gaps },
    });
    allTrades.push(...result.trades);
    allEquity.push(...result.equity);
    totalBars += result.bars;
    for (const [key, value] of Object.entries(result.blocked)) {
      blocked[key] = (blocked[key] ?? 0) + value;
    }
  }

  const ms = Date.now() - started;
  const metrics = computeMetrics(allTrades, allEquity, initialCapital);

  const periodStart = allEquity[0]?.at ?? bars[0]?.at ?? new Date();
  const periodEnd = allEquity[allEquity.length - 1]?.at ?? bars[bars.length - 1]?.at ?? new Date();

  const run = await prisma.run.create({
    data: {
      strategyId: strategy.id,
      kind: "BACKTEST",
      periodStart,
      periodEnd,
      initialCapital: new Prisma.Decimal(initialCapital),
      dataVersion: `candles:${symbol}:H1:${bars.length}`,
      paramsVersion: WALKFORWARD ? `${ENGINE_VERSION}:wf${folds.length}` : `${ENGINE_VERSION}:single`,
    },
  });

  for (let i = 0; i < allTrades.length; i += 500) {
    await prisma.trade.createMany({
      data: allTrades.slice(i, i + 500).map((t) => ({
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

  // 자산곡선은 구간마다 다시 시작하므로 시각이 겹칠 수 있다. 겹치면 건너뛴다.
  for (let i = 0; i < allEquity.length; i += 1000) {
    await prisma.equity.createMany({
      data: allEquity.slice(i, i + 1000).map((p) => ({
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

  await prisma.metric.create({
    data: {
      runId: run.id,
      cagr: metrics.cagr,
      totalReturn: metrics.totalReturn,
      mdd: metrics.mdd,
      cagrMdd: metrics.cagrMdd,
      sharpe: metrics.sharpe,
      sortino: metrics.sortino,
      trades: metrics.trades,
      winRate: metrics.winRate,
      profitFactor: metrics.profitFactor,
      avgHoldHours: metrics.avgHoldHours,
    },
  });

  console.log(`Run ${run.id}`);
  console.log(`  전략      ${strategy.name} v${strategy.version}`);
  console.log(`  구간      ${WALKFORWARD ? `워크포워드 ${folds.length}폴드 (검증 구간만)` : "단일"}`);
  console.log(`  봉        ${totalBars.toLocaleString()}`);
  console.log(`  소요      ${(ms / 1000).toFixed(2)}초`);
  console.log(`  거래      ${metrics.trades}`);
  console.log(`  총수익    ${metrics.totalReturn?.toFixed(2) ?? "—"}%`);
  console.log(`  CAGR      ${metrics.cagr?.toFixed(2) ?? "—"}%`);
  console.log(`  MDD       ${metrics.mdd?.toFixed(2) ?? "—"}%`);
  console.log(`  수익/낙폭 ${metrics.cagrMdd?.toFixed(3) ?? "—"}`);
  console.log(`  승률      ${metrics.winRate?.toFixed(1) ?? "—"}%`);
  console.log(`  연속손실  ${metrics.maxConsecutiveLoss}`);
  if (Object.keys(blocked).length > 0) {
    console.log(`  막힘      ${JSON.stringify(blocked)}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
