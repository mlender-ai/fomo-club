/**
 * LAB-05 — 백테스트 전광판 데이터.
 *
 * 화면은 판단만 하고 **계산은 여기서 끝낸다.** 판정 규칙(표본 30·다중 비교)은
 * `@fomo/lab` 의 순수 함수가 갖는다 — 이 파일은 DB 에서 재료를 꺼내 넘길 뿐이다.
 */
import {
  MIN_SAMPLE,
  assertStrategyDefinition,
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

/**
 * 거래가 0인 이유. **셋을 구분한다**(LAB-FIX2 PART B-3).
 *
 * 종전에는 셋이 전부 `종료` 로 나왔다. `종료` 는 **사람이 끈 것**이고, 안 돈 것과는
 * 다른 사실이다 — 하나로 뭉치면 "왜 거래가 0인가" 를 화면에서 물을 수 없다.
 */
export type HaltKind =
  /** 정상. 거래가 있다. */
  | "none"
  /** 사람이 껐다. 사유가 같이 온다. */
  | "stopped"
  /** 지표가 요구하는 자료가 그 구간에 없다. 전략 탓이 아니다. */
  | "no_data"
  /** 자료는 있는데 조건이 한 번도 맞지 않았다. */
  | "no_signal";

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
  profitFactor: number | null;
  avgHoldHours: number | null;
  maxConsecutiveLoss: number;
  trades: number;
  /** 표본이 `MIN_SAMPLE` 미만이면 순위가 없다. */
  ranked: boolean;
  /**
   * **벤치마크 C/M 을 넘었나**(PART A-1).
   *
   * 못 넘었으면 순위 번호 대신 `기준 미달` 이 붙는다. 벤치마크에 지는 전략에
   * 1위를 주면 화면이 "이게 제일 낫다" 고 말하는 셈인데, 실제로는
   * **아무것도 안 하는 편이 낫다.**
   */
  beatsBenchmark: boolean;
  /** 순위 번호. 못 받으면 null 이고 `note` 가 이유를 말한다. */
  rank: number | null;
  /** 순위를 못 받은 이유 — `기준 미달` · `표본 부족` · `데이터 없음` 등. */
  note: string | null;
  halt: HaltKind;
  haltDetail: string | null;
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

/** 이 확률 이상이면 **순위를 아예 매기지 않는다**(PART A-2). */
export const CHANCE_LIMIT = 0.5;

export interface DataSpan {
  from: Date | null;
  to: Date | null;
  /** 가장 긴 종목의 봉 수. */
  bars: number;
  years: number;
}

export interface Board {
  period: PeriodKey;
  from: Date | null;
  to: Date | null;
  /**
   * 표에 설 전략 전부. **순위 유무와 무관하게 한 배열**이다 —
   * 셋으로 나눠 두면 화면이 "순위권" 을 따로 강조하게 된다.
   * `rank` 가 번호를, `note` 가 번호를 못 받은 이유를 갖는다.
   */
  rows: BoardRow[];
  benchmark: BenchmarkRow;
  comparison: MultipleComparison;
  /**
   * 순위를 매길 수 있는가. 우연 확률이 `CHANCE_LIMIT` 이상이면 false 고,
   * 그러면 **번호를 아무에게도 주지 않는다**(PART A-2).
   */
  rankable: boolean;
  /** 벤치마크를 이긴 전략 수. **0 이면 강조색을 쓰지 않는다**(PART A-3). */
  beatCount: number;
  /** DB 에 실제로 있는 데이터 기간 — 검증 구간과 다르다(PART G). */
  dataSpan: DataSpan;
  /**
   * **실제로 채점한 구간.** 자산곡선 점이 있는 범위다.
   *
   * 데이터 기간과 다르다 — 워크포워드가 앞 1년을 학습에 쓰고, 학습 구간은
   * 애초에 저장하지 않는다. 둘을 같이 적어야 "3년 받았는데 왜 2년이냐" 가 풀린다.
   */
  testSpan: { from: Date | null; to: Date | null };
  /** 다중 비교에 들어간 후보 수(전략 + 파라미터 조합). */
  candidateCount: number;
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
 * 지표별로 **봉 말고 따로 필요한 자료**. 여기 없는 지표는 봉만으로 돈다.
 *
 * 거래가 0일 때 "자료가 없어서" 인지 "조건이 안 맞아서" 인지 가르는 데 쓴다.
 * 둘은 고치는 사람이 다르다 — 전자는 수집, 후자는 전략이다.
 */
const EXTERNAL_DATA: Record<string, { label: string; count: (from: Date, to: Date) => Promise<number> }> = {
  whale_flow: {
    label: "고래 스냅샷",
    count: (from, to) => prisma.whalePosition.count({ where: { at: { gte: from, lte: to } } }),
  },
};

/** 정의가 참조하는 지표 이름 전부. */
function indicatorsOf(definition: unknown): string[] {
  const names = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    if (typeof record.indicator === "string") names.add(record.indicator);
    for (const value of Object.values(record)) walk(value);
  };
  walk(definition);
  return [...names];
}

/**
 * 거래가 0인 이유를 가른다 (PART B-3).
 *
 * **`종료` 를 기본값으로 쓰지 않는다.** 사람이 끈 것만 `종료` 다.
 */
async function explainHalt(
  strategy: { status: string; stopReason: string | null; definition: unknown },
  run: { periodStart: Date; periodEnd: Date | null },
  trades: number
): Promise<{ halt: HaltKind; detail: string | null }> {
  if (trades > 0) return { halt: "none", detail: null };

  const to = run.periodEnd ?? new Date();
  for (const name of indicatorsOf(strategy.definition)) {
    const need = EXTERNAL_DATA[name];
    if (!need) continue;
    const have = await need.count(run.periodStart, to);
    // 표본 하한보다 적으면 "자료가 없다" 고 본다. 몇 건 있는 것과 쓸 만큼
    // 있는 것은 다르고, **몇 건으로 낸 0거래를 전략 탓으로 돌리면 안 된다.**
    if (have < MIN_SAMPLE) {
      return {
        halt: "no_data",
        detail: `${need.label}이 이 구간에 ${have}건뿐이다 (필요 ${MIN_SAMPLE}건)`,
      };
    }
  }

  if (strategy.status === "STOPPED" && strategy.stopReason) {
    return { halt: "stopped", detail: strategy.stopReason };
  }
  return { halt: "no_signal", detail: "진입 조건이 한 번도 맞지 않았다" };
}

/** 연속 손실 최대 횟수. `Metric` 에 없는 값이라 거래에서 센다. */
async function maxConsecutiveLoss(runId: string): Promise<number> {
  const rows = await prisma.trade.findMany({
    where: { runId },
    orderBy: { entryAt: "asc" },
    select: { pnl: true },
  });
  let streak = 0;
  let worst = 0;
  for (const row of rows) {
    if ((row.pnl?.toNumber() ?? 0) < 0) {
      streak += 1;
      worst = Math.max(worst, streak);
    } else {
      streak = 0;
    }
  }
  return worst;
}

/**
 * DB 에 실제로 있는 데이터 기간 (PART G).
 *
 * **검증 구간과 다르다.** 워크포워드가 앞 1년을 학습에 쓰므로 화면의 곡선은
 * 데이터보다 1년 짧다. 그 차이를 화면에 적지 않으면 "2년치밖에 없다" 로 읽힌다.
 */
async function readDataSpan(): Promise<DataSpan> {
  const grouped = await prisma.candle.groupBy({
    by: ["symbol", "interval"],
    _count: { _all: true },
    _min: { at: true },
    _max: { at: true },
  });
  let best: { bars: number; from: Date | null; to: Date | null } = { bars: 0, from: null, to: null };
  for (const row of grouped) {
    if (row._count._all > best.bars) {
      best = { bars: row._count._all, from: row._min.at, to: row._max.at };
    }
  }
  const years =
    best.from && best.to ? (best.to.getTime() - best.from.getTime()) / (365 * 24 * 60 * 60 * 1000) : 0;
  return { ...best, years };
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

  const benchmark = await readBenchmark(from, null);
  const dataSpan = await readDataSpan();

  const rows: BoardRow[] = await Promise.all(
    [...latest.values()].map(async (run) => {
      // **기간을 바꾸면 결과가 바뀐다**(LAB-05 완료확인 10).
      //
      // 저장된 `Metric` 은 Run 전체 구간의 값이다. 그걸 그대로 보여주면 기간 단추를
      // 눌러도 숫자가 안 바뀌어 "기간을 바꾸면 순위가 바뀐다"가 거짓이 된다.
      const metric = from === null ? run.metric : null;
      const computed = metric ? null : await computeWindowMetrics(run.id, from, null);
      const trades = metric?.trades ?? computed?.trades ?? 0;
      const cagrMdd = metric?.cagrMdd ?? computed?.cagrMdd ?? null;

      let definition: unknown = run.strategy.definition;
      try {
        definition = assertStrategyDefinition(run.strategy.definition);
      } catch {
        // 정의가 스키마를 못 지나도 **표에서 지우지 않는다.** 지표 이름만 훑는 용도다.
      }
      const { halt, detail } = await explainHalt(
        { status: run.strategy.status, stopReason: run.strategy.stopReason, definition },
        run,
        trades
      );

      return {
        runId: run.id,
        strategyId: run.strategyId,
        label: `${run.strategy.name} v${run.strategy.version}`,
        cagr: metric?.cagr ?? computed?.cagr ?? null,
        mdd: metric?.mdd ?? computed?.mdd ?? null,
        cagrMdd,
        sharpe: metric?.sharpe ?? computed?.sharpe ?? null,
        winRate: metric?.winRate ?? computed?.winRate ?? null,
        profitFactor: metric?.profitFactor ?? computed?.profitFactor ?? null,
        avgHoldHours: metric?.avgHoldHours ?? computed?.avgHoldHours ?? null,
        maxConsecutiveLoss: trades > 0 ? await maxConsecutiveLoss(run.id) : 0,
        trades,
        ranked: trades >= MIN_SAMPLE,
        // 벤치마크가 없으면(시세 미수집) 이긴 것으로 치지 않는다 —
        // **모르는 것을 통과로 만들지 않는다.**
        beatsBenchmark:
          cagrMdd !== null && benchmark.cagrMdd !== null && cagrMdd > benchmark.cagrMdd,
        rank: null as number | null,
        note: null as string | null,
        halt,
        haltDetail: detail,
        stopped: run.strategy.status === "STOPPED",
        stopReason: run.strategy.stopReason,
      };
    })
  );

  // ── 다중 비교 — **순위를 매기기 전에** 먼저 판정한다 ──────────────────────
  //
  // 순위를 매겨 놓고 "그런데 우연일 수 있다" 를 덧붙이면 사람은 순위를 먼저 읽는다.
  // 우연 확률이 높으면 **번호 자체를 주지 않는다**(PART A-2).
  const candidates = rows
    .filter((row) => row.ranked)
    .flatMap((row) => {
      const run = latest.get(row.strategyId);
      if (!run) return [];
      const years = yearsBetween(run.periodStart, run.periodEnd);
      const tried = combosTried(run.paramsVersion);
      // 고른 조합은 실제 성적으로, 나머지는 **같은 검정 대상이었다는 사실만** 넣는다.
      return Array.from({ length: tried }, (_, i) => ({
        id: `${row.runId}#${i}`,
        label: row.label,
        sharpe: i === 0 ? row.sharpe : 0,
        years,
        trades: row.trades,
      }));
    });
  const comparison = multipleComparison(candidates);
  const rankable = comparison.familyP === null || comparison.familyP < CHANCE_LIMIT;
  const beatCount = rows.filter((row) => row.beatsBenchmark).length;

  // ── 줄 세우기 ────────────────────────────────────────────────────────────
  //
  // 순서는 C/M 내림차순 하나다. **번호는 따로 준다** — 벤치마크를 넘고,
  // 표본이 차고, 우연 확률이 낮을 때만.
  rows.sort((a, b) => (b.cagrMdd ?? -Infinity) - (a.cagrMdd ?? -Infinity));

  let next = 1;
  for (const row of rows) {
    if (row.halt === "no_data") {
      row.note = "데이터 없음";
    } else if (row.halt === "no_signal") {
      row.note = "신호 없음";
    } else if (row.halt === "stopped") {
      row.note = "종료";
    } else if (!row.ranked) {
      row.note = `표본 부족 (${row.trades}건)`;
    } else if (!row.beatsBenchmark) {
      // **이 줄이 이 배치의 핵심이다.** 벤치마크에 지면 번호가 없다.
      row.note = "기준 미달";
    } else if (!rankable) {
      row.note = "판단 불가";
    } else {
      row.rank = next;
      next += 1;
    }
  }

  const to = runs[0]?.periodEnd ?? null;

  const runIds = rows.map((row) => row.runId);
  const [firstPoint, lastPoint] = runIds.length
    ? await Promise.all([
        prisma.equity.findFirst({
          where: { runId: { in: runIds }, ...(from ? { at: { gte: from } } : {}) },
          orderBy: { at: "asc" },
          select: { at: true },
        }),
        prisma.equity.findFirst({
          where: { runId: { in: runIds } },
          orderBy: { at: "desc" },
          select: { at: true },
        }),
      ])
    : [null, null];

  return {
    period,
    from,
    to,
    testSpan: { from: firstPoint?.at ?? null, to: lastPoint?.at ?? null },
    rows,
    benchmark,
    comparison,
    rankable,
    beatCount,
    dataSpan,
    candidateCount: candidates.length,
  };
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
