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
  MultiSymbolSource,
  assertStrategyDefinition,
  computeMetrics,
  execute,
  splitFolds,
  type Bar,
  type ClosedTrade,
  type EquityPoint,
  type Gap,
} from "@fomo/lab";

import { STOCK_BENCHMARKS, STOCK_UNIVERSE } from "./collect/stock-universe";

const prisma = new PrismaClient();

/**
 * 이 종목과 비교할 지수. 유니버스에 없는 심볼(크립토)은 null 이다.
 *
 * 시장마다 다른 지수를 쓴다(PART C-2) — 코스닥 종목을 코스피와 비교하면
 * "시장 역행" 이 다른 시장을 가리키게 된다.
 */
function indexSymbolFor(symbol: string): string | null {
  const def = STOCK_UNIVERSE.find((d) => d.yahoo === symbol);
  if (!def) return null;
  const benchmark = STOCK_BENCHMARKS.find((b) => (b.markets as readonly string[]).includes(def.market));
  return benchmark?.symbol ?? null;
}

/** 엔진 버전. 같은 정의라도 엔진이 바뀌면 결과가 다르다 — `Run.paramsVersion` 에 박힌다. */
const ENGINE_VERSION = "lab06-1";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const WALKFORWARD = !process.argv.includes("--no-walkforward");

/**
 * 이 전략의 파라미터를 고르며 **시도한 조합 수**(LAB-06 PART E-2).
 *
 * `paramsVersion` 에 박아둔다. 화면의 다중 비교 계산이 이 수를 읽는다 —
 * **조합을 돌린 사실을 반영하지 않으면 1위를 실제보다 믿게 된다.**
 * 최종 전략 수만 세면 6조합 중 최고를 고른 것이 "전략 하나" 로 계산된다.
 */
const COMBOS = Math.max(1, Number(arg("combos") ?? "1") || 1);

/**
 * 워크포워드 구간 — **학습 1년 · 검증 3개월**. 봉 수는 주기마다 다르다.
 *
 * 주식은 일봉이고 장중만 열리므로 1년이 약 252거래일이다. 달력일(365)로 자르면
 * 학습 구간이 **실제로는 1년 5개월**이 된다 — 구간이 길어지면 폴드 수가 줄고,
 * 검증 표본이 조용히 적어진다.
 */
const FOLD_BARS = {
  H1: { inSampleBars: 365 * 24, outOfSampleBars: 90 * 24 },
  D1: { inSampleBars: 252, outOfSampleBars: 63 },
} as const;

/**
 * 검증 구간 **앞에서** 지표를 데우는 봉 수 (LAB-09).
 *
 * 종전에는 워밍업이 없었다 — 검증 구간 안의 봉만 실행기에 넣었다. 1시간봉은 검증
 * 3개월이 2,160봉이라 `ma(60)` 이 넉넉해 안 보였는데, **일봉은 63봉**이라
 * 61봉짜리 지표가 통째로 죽었다(89종목 21년에 거래 3건).
 *
 * 검증 구간 이전의 봉을 주는 것은 과거를 보는 것이라 look-ahead 가 아니다.
 * ⚠️ 이 변경으로 **크립토 백테스트 숫자도 조금 달라진다** — 각 폴드 앞머리에서
 * 예전에는 못 하던 진입이 생긴다. 예전 숫자가 틀렸던 것이다.
 */
const WARMUP_BARS = { H1: 500, D1: 252 } as const;

/**
 * 시장이 봉 주기를 정한다. 크립토는 1시간봉, 주식은 일봉(LAB-09 PART C-1).
 *
 * 전략 정의가 아니라 **시장**에서 끌어오는 이유: 정의에 적게 하면 주식 전략에
 * `H1` 이라고 적는 실수를 막을 방법이 없고, 그러면 **봉이 0개**라 거래 0건으로
 * 조용히 끝난다.
 */
function intervalFor(market: string): "H1" | "D1" {
  return market === "CRYPTO" ? "H1" : "D1";
}

async function loadBars(symbol: string, interval: "H1" | "D1"): Promise<Bar[]> {
  const rows = await prisma.candle.findMany({
    where: { symbol, interval },
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

async function loadGaps(symbol: string, interval: "H1" | "D1"): Promise<Gap[]> {
  const rows = await prisma.dataGap.findMany({
    where: { symbol, interval },
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

/** 고래 순포지션 = 롱 − 숏, 스냅샷 시각별 합계. */
async function loadWhaleNet(symbol: string): Promise<Map<number, number>> {
  const rows = await prisma.whalePosition.findMany({
    where: { symbol },
    select: { at: true, side: true, size: true },
  });
  const net = new Map<number, number>();
  for (const row of rows) {
    const key = row.at.getTime();
    const signed = (row.side === "LONG" ? 1 : -1) * row.size.toNumber();
    net.set(key, (net.get(key) ?? 0) + signed);
  }
  return net;
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
  const symbols = definition.universe.symbols;
  if (symbols.length === 0) throw new Error("유니버스가 비었다");

  const interval = intervalFor(strategy.market);

  const bySymbol: Record<string, Bar[]> = {};
  const gaps: Record<string, Gap[]> = {};
  const funding: Record<string, Map<number, number>> = {};
  const whaleNet: Record<string, Map<number, number>> = {};
  /** 참조 계열(LAB-09) — 종목이 속한 시장의 지수. 크립토는 없다. */
  const reference: Record<string, Bar[]> = {};
  const indexCache = new Map<string, Bar[]>();

  for (const symbol of symbols) {
    bySymbol[symbol] = await loadBars(symbol, interval);
    gaps[symbol] = await loadGaps(symbol, interval);
    funding[symbol] = await loadFunding(symbol);
    whaleNet[symbol] = await loadWhaleNet(symbol);

    const indexSymbol = indexSymbolFor(symbol);
    if (indexSymbol) {
      let series = indexCache.get(indexSymbol);
      if (!series) {
        series = await loadBars(indexSymbol, interval);
        indexCache.set(indexSymbol, series);
      }
      // **지수가 없으면 붙이지 않는다.** 빈 배열을 넣으면 `market_divergence` 가
      // null 이 아니라 "판정했는데 아니다" 가 되고, 지수를 못 받은 사실이 사라진다.
      if (series.length > 0) reference[symbol] = series;
    }
  }
  // 워크포워드 분할 기준은 첫 종목의 봉이다. 종목마다 기간이 조금씩 다를 수 있는데
  // **구간을 종목별로 다르게 자르면 폴드가 어긋나** 비교가 안 된다.
  const bars = bySymbol[symbols[0] as string] ?? [];
  if (bars.length === 0) {
    console.error(
      `${symbols[0]} 의 ${interval} 봉이 없다. 먼저 ` +
        (interval === "D1" ? "npm run lab:stock-candles -- --backfill" : "npm run lab:candles -- --backfill")
    );
    process.exit(1);
  }

  const initialCapital = 10_000;
  const started = Date.now();

  const folds = WALKFORWARD ? splitFolds(bars, FOLD_BARS[interval]) : [];

  const allTrades: ClosedTrade[] = [];
  const allEquity: EquityPoint[] = [];
  let totalBars = 0;
  const blocked: Record<string, number> = {};

  /** 검증 구간만 돌린다. 학습 구간은 **돌리지도 저장하지도 않는다.** */
  const windows =
    folds.length > 0
      ? folds.map((f) => ({ from: f.outOfSample.from.getTime(), to: f.outOfSample.to.getTime() }))
      : [{ from: -Infinity, to: Infinity }];

  for (const window of windows) {
    const slice: Record<string, Bar[]> = {};
    for (const symbol of symbols) {
      const bars = bySymbol[symbol] ?? [];
      const inWindow = bars.filter(
        (bar) => bar.at.getTime() >= window.from && bar.at.getTime() <= window.to
      );
      const before = bars
        .filter((bar) => bar.at.getTime() < window.from)
        .slice(-WARMUP_BARS[interval]);
      slice[symbol] = [...before, ...inWindow];
    }
    const result = execute({
      definition,
      source: new MultiSymbolSource({ bySymbol: slice, gaps, funding, whaleNet, reference }),
      config: { ...DEFAULT_EXECUTOR, initialCapital },
      gaps,
      ...(Number.isFinite(window.from) ? { warmupUntil: new Date(window.from) } : {}),
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
      dataVersion: `candles:${symbols.length}종목:${interval}:${bars.length}`,
      paramsVersion:
        (WALKFORWARD ? `${ENGINE_VERSION}:wf${folds.length}` : `${ENGINE_VERSION}:single`) +
        `:combos${COMBOS}`,
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
  console.log(`  시도 조합  ${COMBOS}`);
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
