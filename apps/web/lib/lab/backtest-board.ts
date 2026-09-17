/**
 * LAB-05 — 백테스트 전광판 데이터.
 *
 * 화면은 판단만 하고 **계산은 여기서 끝낸다.** 판정 규칙(표본 30·다중 비교)은
 * `@fomo/lab` 의 순수 함수가 갖는다 — 이 파일은 DB 에서 재료를 꺼내 넘길 뿐이다.
 */
import {
  MIN_SAMPLE,
  computeMetrics,
  multipleComparison,
  splitCurveSegments,
  type ClosedTrade,
  type CurvePoint,
  type EquityPoint,
  type MultipleComparison,
} from "@fomo/lab";

import { prisma } from "../prisma";

/** PART E — 기간 선택. */
export type PeriodKey = "all" | "3y" | "1y";

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  all: "전체",
  "3y": "최근 3년",
  "1y": "최근 1년",
};

export function periodStart(period: PeriodKey, now = new Date()): Date | null {
  if (period === "all") return null;
  const years = period === "3y" ? 3 : 1;
  return new Date(now.getTime() - years * 365 * 24 * 60 * 60 * 1000);
}

export interface BoardRow {
  runId: string;
  strategyId: string;
  label: string;
  cagr: number | null;
  mdd: number | null;
  /** CAGR ÷ |MDD|. **순위 기준.** */
  cagrMdd: number | null;
  sharpe: number | null;
  winRate: number | null;
  trades: number;
  /** 표본이 `MIN_SAMPLE` 미만이면 순위가 없다. */
  ranked: boolean;
  /** 종료된 전략은 회색으로 남는다(PART B-3). **지우지 않는다.** */
  stopped: boolean;
  stopReason: string | null;
}

export interface BenchmarkRow {
  label: string;
  cagr: number | null;
  mdd: number | null;
  cagrMdd: number | null;
  from: Date | null;
  to: Date | null;
}

export interface Board {
  period: PeriodKey;
  from: Date | null;
  to: Date | null;
  /** 순위가 매겨진 전략. `cagrMdd` 내림차순. */
  ranked: BoardRow[];
  /** 표본 부족. 순위 없이 표시한다. */
  unranked: BoardRow[];
  /** 종료된 전략. 회색, 순위 없이, 맨 아래(PART B-3). */
  stopped: BoardRow[];
  benchmark: BenchmarkRow;
  comparison: MultipleComparison;
}


/**
 * `paramsVersion` 에 박힌 시도 조합 수(LAB-06 PART E-2).
 *
 * 없으면 1 이다 — 옛 Run 은 이 정보가 없고, **모르면 1 로 보는 쪽이 보수적이지 않다.**
 * 그래도 없는 값을 지어내는 것보다는 낫다. 새 Run 은 전부 이 값을 단다.
 */
function combosTried(paramsVersion: string): number {
  const match = /:combos(\d+)/.exec(paramsVersion);
  const value = match?.[1] ? Number(match[1]) : 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** 연 단위 기간. 지표의 t 통계량이 이걸 쓴다. */
function yearsBetween(from: Date | null, to: Date | null): number {
  if (!from || !to) return 0;
  return (to.getTime() - from.getTime()) / (365 * 24 * 60 * 60 * 1000);
}

/**
 * 벤치마크 — **BTC 보유.** 같은 기간의 `Benchmark` 시세로 직접 계산한다.
 *
 * 가짜 `Strategy` 행을 만들지 않는다. 벤치마크는 전략이 아니고,
 * 전략 표에 섞이면 언젠가 순위에 낀다.
 */
async function readBenchmark(from: Date | null, to: Date | null): Promise<BenchmarkRow> {
  const rows = await prisma.benchmark.findMany({
    where: {
      symbol: "BTC",
      ...(from || to ? { at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: { at: "asc" },
    select: { at: true, price: true },
  });

  if (rows.length < 2) {
    return { label: "BTC 보유", cagr: null, mdd: null, cagrMdd: null, from: null, to: null };
  }

  const first = rows[0] as { at: Date; price: { toNumber(): number } };
  const last = rows[rows.length - 1] as { at: Date; price: { toNumber(): number } };
  const start = first.price.toNumber();
  const end = last.price.toNumber();
  const years = yearsBetween(first.at, last.at);

  let peak = start;
  let mdd = 0;
  for (const row of rows) {
    const price = row.price.toNumber();
    peak = Math.max(peak, price);
    mdd = Math.min(mdd, ((price - peak) / peak) * 100);
  }

  const cagr = years > 0 && start > 0 && end > 0 ? ((end / start) ** (1 / years) - 1) * 100 : null;
  return {
    label: "BTC 보유",
    cagr,
    mdd,
    cagrMdd: cagr !== null && mdd < 0 ? cagr / Math.abs(mdd) : null,
    from: first.at,
    to: last.at,
  };
}


/**
 * 구간 안의 거래·자산으로 지표를 다시 잰다.
 *
 * 기준 자본은 Run 의 초기 자본이 아니라 **구간 첫 자산값**이다 — 구간을 잘랐으면
 * 그 시점의 자산에서 시작한 것으로 봐야 수익률이 맞는다.
 */
async function computeWindowMetrics(
  runId: string,
  from: Date | null,
  to: Date | null
): Promise<ReturnType<typeof computeMetrics> | null> {
  const range = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;

  const [equityRows, tradeRows] = await Promise.all([
    prisma.equity.findMany({
      where: { runId, ...(range ? { at: range } : {}) },
      orderBy: { at: "asc" },
      select: { at: true, equity: true, cash: true, unrealized: true, drawdown: true },
    }),
    prisma.trade.findMany({
      where: { runId, ...(range ? { entryAt: range } : {}) },
      orderBy: { entryAt: "asc" },
    }),
  ]);

  const first = equityRows[0];
  if (!first) return null;
  const base = first.equity.toNumber();
  if (!(base > 0)) return null;

  // 낙폭은 구간 안에서 다시 잰다. 저장된 값은 Run 전체 고점 기준이라
  // 구간을 좁히면 그 구간에 없던 고점이 낙폭을 만든다.
  let peak = base;
  const equity: EquityPoint[] = equityRows.map((row) => {
    const value = row.equity.toNumber();
    peak = Math.max(peak, value);
    return {
      at: row.at,
      equity: value,
      cash: row.cash.toNumber(),
      unrealized: row.unrealized.toNumber(),
      drawdown: ((value - peak) / peak) * 100,
    };
  });

  const trades: ClosedTrade[] = tradeRows.flatMap((row) =>
    row.exitAt && row.exitPrice && row.pnl
      ? [
          {
            symbol: row.symbol,
            side: row.side,
            entryAt: row.entryAt,
            entryPrice: row.entryPrice.toNumber(),
            entryReason: row.entryReason,
            exitAt: row.exitAt,
            exitPrice: row.exitPrice.toNumber(),
            exitReason: row.exitReason ?? "MANUAL",
            qty: row.qty.toNumber(),
            fee: row.fee.toNumber(),
            slippage: row.slippage.toNumber(),
            funding: row.funding.toNumber(),
            pnl: row.pnl.toNumber(),
            pnlPct: row.pnlPct ?? 0,
            barsHeld: 0,
          },
        ]
      : []
  );

  return computeMetrics(trades, equity, base);
}

/**
 * 전광판을 만든다.
 *
 * 전략 하나에 `Run` 이 여럿일 수 있다(다시 돌렸을 때). **가장 최근 것만** 쓴다 —
 * 여러 개를 다 보여주면 같은 전략이 표에 여러 줄이 되고 순위가 무의미해진다.
 */
export async function readBoard(period: PeriodKey = "all", now = new Date()): Promise<Board> {
  const from = periodStart(period, now);

  const runs = await prisma.run.findMany({
    where: {
      kind: "BACKTEST",
      ...(from ? { periodEnd: { gte: from } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      strategy: true,
      metric: true,
    },
  });

  // 전략당 최신 Run 하나.
  const latest = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latest.has(run.strategyId)) latest.set(run.strategyId, run);
  }

  const rows: BoardRow[] = await Promise.all(
    [...latest.values()].map(async (run) => {
      // **기간을 바꾸면 결과가 바뀐다**(완료확인 10).
      //
      // 저장된 `Metric` 은 Run 전체 구간의 값이다. 그걸 그대로 보여주면 기간 단추를
      // 눌러도 숫자가 안 바뀌어 "기간을 바꾸면 순위가 바뀐다"(PART E)가 거짓이 된다.
      // 전체 기간일 때만 저장값을 쓰고, 구간을 좁히면 그 구간의 거래·자산으로 다시 잰다.
      const metric = from === null ? run.metric : null;
      const computed = metric ? null : await computeWindowMetrics(run.id, from, null);
      const trades = metric?.trades ?? computed?.trades ?? 0;

      return {
        runId: run.id,
        strategyId: run.strategyId,
        label: `${run.strategy.name} v${run.strategy.version}`,
        cagr: metric?.cagr ?? computed?.cagr ?? null,
        mdd: metric?.mdd ?? computed?.mdd ?? null,
        cagrMdd: metric?.cagrMdd ?? computed?.cagrMdd ?? null,
        sharpe: metric?.sharpe ?? computed?.sharpe ?? null,
        winRate: metric?.winRate ?? computed?.winRate ?? null,
        trades,
        ranked: trades >= MIN_SAMPLE,
        stopped: run.strategy.status === "STOPPED",
        stopReason: run.strategy.stopReason,
      };
    })
  );

  const live = rows.filter((r) => !r.stopped);
  const ranked = live
    .filter((r) => r.ranked)
    .sort((a, b) => (b.cagrMdd ?? -Infinity) - (a.cagrMdd ?? -Infinity));
  const unranked = live.filter((r) => !r.ranked);
  const stopped = rows.filter((r) => r.stopped);

  const to = runs[0]?.periodEnd ?? null;
  const benchmark = await readBenchmark(from, null);

  // **시도한 조합 수를 N 으로 쓴다**(PART E-2). 최종 전략만 세면
  // 6조합 중 최고를 고른 것이 "전략 하나" 로 계산돼 1위를 실제보다 믿게 된다.
  const candidates = ranked.flatMap((row) => {
    const run = latest.get(row.strategyId);
    if (!run) return [];
    const years = yearsBetween(run.periodStart, run.periodEnd);
    const tried = combosTried(run.paramsVersion);
    // 고른 조합은 실제 성적으로, 나머지는 **같은 검정 대상이었다는 사실만** 넣는다.
    // 그 조합들의 샤프는 여기서 알 수 없지만, 무능 가설에서 세는 것은 개수다.
    return Array.from({ length: tried }, (_, i) => ({
      id: `${row.runId}#${i}`,
      label: row.label,
      sharpe: i === 0 ? row.sharpe : 0,
      years,
      trades: row.trades,
    }));
  });
  const comparison = multipleComparison(candidates);

  return { period, from, to, ranked, unranked, stopped, benchmark, comparison };
}

export type { CurvePoint };

export interface Curve {
  /**
   * **끊긴 구간마다 조각이 나뉜다**(PART C).
   *
   * 두 가지 이유로 끊긴다:
   *  - 워크포워드 폴드 사이 — 학습 구간은 **그리지 않는다**(하지 말 것 4)
   *  - 데이터 구멍 — **잇지 않는다**(LAB-00 §7)
   */
  segments: CurvePoint[][];
  min: number;
  max: number;
  from: Date | null;
  to: Date | null;
}

/** 자산곡선. **검증 구간만** — 학습 구간은 애초에 저장되지 않는다. */
export async function readCurve(runId: string, from: Date | null = null): Promise<Curve> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: { initialCapital: true },
  });
  const rows = await prisma.equity.findMany({
    where: { runId, ...(from ? { at: { gte: from } } : {}) },
    orderBy: { at: "asc" },
    select: { at: true, equity: true },
  });
  // 구간을 좁히면 **그 구간 첫 자산**이 기준이다. Run 초기 자본으로 재면
  // 구간 앞에서 난 손익이 구간 안의 수익률에 섞인다.
  const initial = from ? (rows[0]?.equity.toNumber() ?? 0) : (run?.initialCapital.toNumber() ?? 0);
  if (!(initial > 0) || rows.length === 0) {
    return { segments: [], min: 0, max: 0, from: null, to: null };
  }

  const points: CurvePoint[] = rows.map((r) => ({
    at: r.at,
    pct: ((r.equity.toNumber() - initial) / initial) * 100,
  }));

  const values = points.map((p) => p.pct);
  return {
    segments: splitCurveSegments(points),
    min: Math.min(...values),
    max: Math.max(...values),
    from: points[0]?.at ?? null,
    to: points[points.length - 1]?.at ?? null,
  };
}

/** 같은 기간 벤치마크 곡선. 표와 같은 기준으로 잘라야 비교가 된다. */
export async function readBenchmarkCurve(from: Date | null, to: Date | null): Promise<Curve> {
  const rows = await prisma.benchmark.findMany({
    where: {
      symbol: "BTC",
      ...(from || to ? { at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: { at: "asc" },
    select: { at: true, price: true },
  });
  if (rows.length < 2) return { segments: [], min: 0, max: 0, from: null, to: null };

  const base = (rows[0] as { price: { toNumber(): number } }).price.toNumber();
  const points: CurvePoint[] = rows.map((r) => ({
    at: r.at,
    pct: ((r.price.toNumber() - base) / base) * 100,
  }));
  const values = points.map((p) => p.pct);
  return {
    segments: splitCurveSegments(points),
    min: Math.min(...values),
    max: Math.max(...values),
    from: points[0]?.at ?? null,
    to: points[points.length - 1]?.at ?? null,
  };
}

export interface StrategyDetail {
  runId: string;
  label: string;
  stopped: boolean;
  stopReason: string | null;
  metrics: {
    cagr: number | null;
    mdd: number | null;
    sharpe: number | null;
    profitFactor: number | null;
    trades: number;
    winRate: number | null;
    avgHoldHours: number | null;
    maxConsecutiveLoss: number;
  };
  trades: {
    entryAt: Date;
    exitAt: Date | null;
    pnlPct: number | null;
    exitReason: string | null;
    holdHours: number | null;
  }[];
}

/** PART F — 전략 상세. 지표 8개 + 거래 이력. */
export async function readStrategyDetail(
  strategyId: string,
  limit = 50
): Promise<StrategyDetail | null> {
  const run = await prisma.run.findFirst({
    where: { strategyId, kind: "BACKTEST" },
    orderBy: { createdAt: "desc" },
    include: { strategy: true, metric: true },
  });
  if (!run) return null;

  const trades = await prisma.trade.findMany({
    where: { runId: run.id },
    orderBy: { entryAt: "desc" },
    take: limit,
    select: { entryAt: true, exitAt: true, pnlPct: true, exitReason: true },
  });

  // `maxConsecutiveLoss` 는 Metric 테이블에 없다(LAB-02 스키마). 거래에서 센다.
  const all = await prisma.trade.findMany({
    where: { runId: run.id },
    orderBy: { entryAt: "asc" },
    select: { pnl: true },
  });
  let streak = 0;
  let maxStreak = 0;
  for (const trade of all) {
    if ((trade.pnl?.toNumber() ?? 0) < 0) {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else streak = 0;
  }

  return {
    runId: run.id,
    label: `${run.strategy.name} v${run.strategy.version}`,
    stopped: run.strategy.status === "STOPPED",
    stopReason: run.strategy.stopReason,
    metrics: {
      cagr: run.metric?.cagr ?? null,
      mdd: run.metric?.mdd ?? null,
      sharpe: run.metric?.sharpe ?? null,
      profitFactor: run.metric?.profitFactor ?? null,
      trades: run.metric?.trades ?? 0,
      winRate: run.metric?.winRate ?? null,
      avgHoldHours: run.metric?.avgHoldHours ?? null,
      maxConsecutiveLoss: maxStreak,
    },
    trades: trades.map((t) => ({
      entryAt: t.entryAt,
      exitAt: t.exitAt,
      pnlPct: t.pnlPct,
      exitReason: t.exitReason,
      holdHours: t.exitAt ? (t.exitAt.getTime() - t.entryAt.getTime()) / 3_600_000 : null,
    })),
  };
}
