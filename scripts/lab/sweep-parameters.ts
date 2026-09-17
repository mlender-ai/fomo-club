/**
 * LAB-06 PART E — 파라미터 선택.
 *
 * > **최적 파라미터를 찾는 게 목적이 아니라 전략이 작동하는지 보는 게 목적이다.**
 *
 * ## 규칙 (E-2)
 *
 *  - 조합은 **전략당 최대 10개.** 수백 개를 돌려 최고를 고르지 않는다
 *  - 후보는 `lab:measure` 로 **실측한 분포**에서 고른다. 감으로 정하지 않는다
 *  - 검증 구간(워크포워드 OOS) 성과로 고른다
 *  - **시도한 조합 수를 기록한다** — 다중 비교 계산에 들어가야 한다
 *
 * 결과를 `docs/lab/STRATEGY_PARAMS.md` 에 붙일 수 있는 표로 낸다.
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/lab/sweep-parameters.ts
 */
import { PrismaClient } from "@prisma/client";
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
  type StrategyDefinition,
} from "@fomo/lab";

const prisma = new PrismaClient();

/** LAB-06 §0 — 전략당 가상 자본. **실제 넣을 금액과 비슷하게 잡는다.** */
const INITIAL_CAPITAL = 10_000;
const SYMBOLS = ["BTC", "ETH", "SOL"] as const;

/** 1시간봉 기준. 학습 1년 / 검증 3개월. */
const IN_SAMPLE_BARS = 365 * 24;
const OUT_OF_SAMPLE_BARS = 90 * 24;

/** E-2 — **조합은 전략당 최대 10개.** */
const MAX_COMBOS = 10;

interface Combo {
  label: string;
  definition: StrategyDefinition;
}

interface Outcome extends Combo {
  cagr: number | null;
  mdd: number | null;
  cagrMdd: number | null;
  sharpe: number | null;
  winRate: number | null;
  trades: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 후보 — 실측 분포에서 고른다 (E-1)
// ─────────────────────────────────────────────────────────────────────────────

const UNIVERSE = { type: "list" as const, symbols: [...SYMBOLS] };
const SIZING = { type: "risk_pct" as const, risk_pct: 2 };

/**
 * 추세 스윙 (PART B). **익절이 없다** — 추세를 끝까지 따라간다.
 *
 * 실측: `ma_cross(20,60)` 골든이 0.96%(752건), `volume_ratio > 1.2` 가 26.97%.
 * 교차가 이미 드물어서 거래량 필터를 조이면 표본이 빠르게 준다.
 * 그래서 거래량은 지시서 기본값 주변 셋, 손절은 둘 — **6조합**.
 */
function trendCombos(): Combo[] {
  const combos: Combo[] = [];
  for (const minVolume of [1.2, 1.5, 2.0]) {
    for (const stop of [-8, -12]) {
      combos.push({
        label: `vol≥${minVolume} · stop${stop}`,
        definition: assertStrategyDefinition({
          market: "crypto",
          universe: UNIVERSE,
          entry: {
            all: [
              { indicator: "ma_cross", fast: 20, slow: 60, dir: "up" },
              { indicator: "volume_ratio", window: 20, min: minVolume },
            ],
          },
          exit: {
            stop_pct: stop,
            target_pct: null,
            max_hold_days: 30,
            any: [{ indicator: "ma_cross", fast: 20, slow: 60, dir: "down" }],
          },
          sizing: SIZING,
          leverage: 1,
          max_positions: 3,
        }),
      });
    }
  }
  return combos;
}

/**
 * 평균회귀 (PART C). **익절이 있다** — 되돌림을 먹고 나온다.
 *
 * 실측이 지시서 기본값을 못 쓰게 만들었다: `pct_from_ma(20) < −8%` 는
 * 78,672봉 중 **0.17%(137건)** 다. 1% 분위수가 −4.81% 라 −8% 는 1분위 바깥이고,
 * `rsi < 30`(11.18%)과 `all` 로 묶으면 거래가 거의 안 난다.
 *
 * 후보를 분위수 근처로 옮긴다 — `pct_from_ma` 는 −3%(3.93%)·−5%(0.89%),
 * `rsi` 는 25(6.28%)·30(11.18%)·35(18.25%). **6조합.**
 */
function meanReversionCombos(): Combo[] {
  const combos: Combo[] = [];
  for (const rsiMax of [25, 30, 35]) {
    for (const fromMa of [-3, -5]) {
      combos.push({
        label: `rsi<${rsiMax} · ma${fromMa}%`,
        definition: assertStrategyDefinition({
          market: "crypto",
          universe: UNIVERSE,
          entry: {
            all: [
              { indicator: "rsi", window: 14, max: rsiMax },
              { indicator: "pct_from_ma", window: 20, max: fromMa },
            ],
          },
          exit: {
            stop_pct: -6,
            target_pct: 8,
            max_hold_days: 10,
            any: [{ indicator: "rsi", window: 14, min: 55 }],
          },
          sizing: SIZING,
          leverage: 1,
          max_positions: 3,
        }),
      });
    }
  }
  return combos;
}

/**
 * 고래 추종 (PART D). **조합이 하나다.**
 *
 * 지시서가 "임계값은 실측 분포로 정한다. `min_usd` 5백만은 초안이다" 라고 했는데
 * **실측할 분포가 없다.** `WhalePosition` 에 스냅샷이 13건뿐이고 전부 같은 시각이다
 * (`LAB-03` 이 앞으로 쌓는 것이라 과거가 없다).
 *
 * 그래서 초안값을 그대로 쓰고 조합을 늘리지 않는다. **근거 없이 여러 값을 돌리면
 * 그중 하나가 우연히 좋아 보일 뿐이다.**
 */
function whaleCombos(): Combo[] {
  return [
    {
      label: "min_usd 5M (초안 · 실측 불가)",
      definition: assertStrategyDefinition({
        market: "crypto",
        universe: UNIVERSE,
        entry: {
          all: [
            { indicator: "whale_flow", window_hours: 24, min_usd: 5_000_000, dir: "long" },
          ],
        },
        exit: {
          stop_pct: -8,
          target_pct: null,
          max_hold_days: 14,
          any: [{ indicator: "whale_flow", window_hours: 24, dir: "short" }],
        },
        sizing: SIZING,
        leverage: 1,
        max_positions: 3,
      }),
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────

async function loadAll(): Promise<{
  bySymbol: Record<string, Bar[]>;
  gaps: Record<string, Gap[]>;
  funding: Record<string, Map<number, number>>;
  whaleNet: Record<string, Map<number, number>>;
}> {
  const bySymbol: Record<string, Bar[]> = {};
  const gaps: Record<string, Gap[]> = {};
  const funding: Record<string, Map<number, number>> = {};
  const whaleNet: Record<string, Map<number, number>> = {};

  for (const symbol of SYMBOLS) {
    const [candles, gapRows, fundingRows, whaleRows] = await Promise.all([
      prisma.candle.findMany({
        where: { symbol, interval: "H1" },
        orderBy: { at: "asc" },
        select: { at: true, open: true, high: true, low: true, close: true, volume: true },
      }),
      prisma.dataGap.findMany({ where: { symbol, interval: "H1" } }),
      prisma.funding.findMany({ where: { symbol }, select: { at: true, rate: true } }),
      prisma.whalePosition.findMany({ where: { symbol }, select: { at: true, side: true, size: true } }),
    ]);

    bySymbol[symbol] = candles.map((c) => ({
      at: c.at,
      open: c.open.toNumber(),
      high: c.high.toNumber(),
      low: c.low.toNumber(),
      close: c.close.toNumber(),
      volume: c.volume.toNumber(),
    }));
    gaps[symbol] = gapRows.map((g) => ({ fromAt: g.fromAt, toAt: g.toAt, missing: g.missing }));
    funding[symbol] = new Map(fundingRows.map((f) => [f.at.getTime(), f.rate.toNumber()]));

    // 고래 순포지션 = 롱 − 숏, 스냅샷 시각별 합계.
    const net = new Map<number, number>();
    for (const row of whaleRows) {
      const key = row.at.getTime();
      const signed = (row.side === "LONG" ? 1 : -1) * row.size.toNumber();
      net.set(key, (net.get(key) ?? 0) + signed);
    }
    whaleNet[symbol] = net;
  }

  return { bySymbol, gaps, funding, whaleNet };
}

type Data = Awaited<ReturnType<typeof loadAll>>;

/** 워크포워드 검증 구간만 돌린다. **학습 구간 성과는 쓰지 않는다.** */
function runWalkForward(
  definition: StrategyDefinition,
  data: Data
): { trades: ClosedTrade[]; equity: EquityPoint[] } {
  const reference = data.bySymbol[SYMBOLS[0]] ?? [];
  const folds = splitFolds(reference, {
    inSampleBars: IN_SAMPLE_BARS,
    outOfSampleBars: OUT_OF_SAMPLE_BARS,
  });

  const trades: ClosedTrade[] = [];
  const equity: EquityPoint[] = [];

  for (const fold of folds) {
    const from = fold.outOfSample.from.getTime();
    const to = fold.outOfSample.to.getTime();
    const slice: Record<string, Bar[]> = {};
    for (const symbol of SYMBOLS) {
      slice[symbol] = (data.bySymbol[symbol] ?? []).filter(
        (bar) => bar.at.getTime() >= from && bar.at.getTime() <= to
      );
    }
    const result = execute({
      definition,
      source: new MultiSymbolSource({
        bySymbol: slice,
        gaps: data.gaps,
        funding: data.funding,
        whaleNet: data.whaleNet,
      }),
      config: { ...DEFAULT_EXECUTOR, initialCapital: INITIAL_CAPITAL },
      gaps: data.gaps,
    });
    trades.push(...result.trades);
    equity.push(...result.equity);
  }

  return { trades, equity };
}

function evaluate(combo: Combo, data: Data): Outcome {
  const { trades, equity } = runWalkForward(combo.definition, data);
  const m = computeMetrics(trades, equity, INITIAL_CAPITAL);
  return {
    ...combo,
    cagr: m.cagr,
    mdd: m.mdd,
    cagrMdd: m.cagrMdd,
    sharpe: m.sharpe,
    winRate: m.winRate,
    trades: m.trades,
  };
}

function report(name: string, outcomes: readonly Outcome[]): Outcome | null {
  console.log(`\n## ${name} — 조합 ${outcomes.length}개\n`);
  console.log(
    `  ${"조합".padEnd(26)}${"CAGR".padStart(8)}${"MDD".padStart(9)}${"C/M".padStart(8)}${"샤프".padStart(8)}${"승률".padStart(8)}${"거래".padStart(7)}`
  );
  const sorted = [...outcomes].sort((a, b) => (b.cagrMdd ?? -Infinity) - (a.cagrMdd ?? -Infinity));
  for (const o of sorted) {
    console.log(
      `  ${o.label.padEnd(26)}` +
        `${(o.cagr?.toFixed(2) ?? "—").padStart(8)}` +
        `${(o.mdd?.toFixed(2) ?? "—").padStart(9)}` +
        `${(o.cagrMdd?.toFixed(3) ?? "—").padStart(8)}` +
        `${(o.sharpe?.toFixed(2) ?? "—").padStart(8)}` +
        `${(o.winRate?.toFixed(0) ?? "—").padStart(8)}` +
        `${String(o.trades).padStart(7)}`
    );
  }
  // 표본 30 미만은 고르지 않는다(LAB-00 §7). 전부 미달이면 **고르지 않는다.**
  const eligible = sorted.filter((o) => o.trades >= 30);
  const chosen = eligible[0] ?? null;
  console.log(
    chosen
      ? `  → 선택: ${chosen.label} (C/M ${chosen.cagrMdd?.toFixed(3)}, 거래 ${chosen.trades})`
      : `  → 선택 없음 — 표본 30건을 넘는 조합이 없다`
  );
  return chosen;
}

async function main(): Promise<void> {
  const data = await loadAll();
  const counts = SYMBOLS.map((s) => `${s} ${(data.bySymbol[s] ?? []).length.toLocaleString()}`).join(" · ");
  console.log(`봉: ${counts}`);
  console.log(`자본 $${INITIAL_CAPITAL.toLocaleString()} · 레버리지 1배 · 최대 동시 3\n`);

  const groups: [string, Combo[]][] = [
    ["추세 스윙", trendCombos()],
    ["평균회귀", meanReversionCombos()],
    ["고래 추종", whaleCombos()],
  ];

  let total = 0;
  for (const [name, combos] of groups) {
    if (combos.length > MAX_COMBOS) {
      throw new Error(`${name}: 조합 ${combos.length}개 — 상한 ${MAX_COMBOS}개를 넘는다(E-2)`);
    }
    total += combos.length;
    report(name, combos.map((combo) => evaluate(combo, data)));
  }

  console.log(`\n시도한 조합 총 ${total}개 (전략당 최대 ${MAX_COMBOS})`);
  console.log("이 수가 다중 비교 계산에 들어가야 한다 — 많이 돌릴수록 1위를 믿기 어려워진다.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
