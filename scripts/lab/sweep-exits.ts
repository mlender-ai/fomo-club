/**
 * LAB-09 PART B — **청산 규칙을 실측으로 정한다.**
 *
 * > 52%가 나온 진짜 이유는 청산이 없어서다.
 * >
 * > 있었음   임원 4명이 8일 새 샀다        ← 진입
 * > 없었음   그래서 언제 파나              ← 청산
 *
 * 그래서 이 스크립트가 재는 것은 **하나**다:
 * 같은 진입 신호에 청산 규칙을 붙이면 성적이 달라지는가.
 *
 * ## 기준선 — 판단 원장이 쓰던 방식
 *
 * 원장은 발행 시점 가격 대비 **T+7/30/90 고정 창**으로 채점했다(`docs/ledger/METHODOLOGY.md`).
 * 손절도 익절도 없다. 그것을 이 엔진에서 그대로 재현한 것이 `기준선(T+30)` 이다 —
 * 손절 −99%(사실상 안 걸림) · 목표 없음 · 30일 시간청산.
 *
 * ⚠️ **이것은 원장 숫자와의 비교가 아니다.** 원장 데이터(프로덕션 DB)에 닿지 못했다.
 * 재현한 것은 원장의 **채점 방식**이고, 그 방식을 우리 신호에 적용한 결과다.
 * "원장의 52%" 와 나란히 놓으려면 원장 행이 있어야 한다(PART D 미완).
 *
 * ## 조합은 10개다 (B-2 · 하지 말 것 2)
 *
 * 지시서의 후보는 손절 5 × 익절 5 = **25조합**이다. 상한이 10이므로 25를 다 돌리고
 * 최고를 고르면 상한을 어기는 것이다. **미리 10개를 정해 놓고** 그것만 돌린다 —
 * 돌린 뒤에 고르면 고른 행위 자체가 과최적화다.
 *
 * 고른 10개는 격자를 **넓게 훑도록** 짰다: 손절만 넷(강→약), 익절만 둘, 둘 다 넷.
 *
 *   npx tsx scripts/lab/sweep-exits.ts --signal volume-awakening
 *   npx tsx scripts/lab/sweep-exits.ts --signal counter-market --json out.json
 */
import { readFileSync } from "node:fs";
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

import { STOCK_BENCHMARKS, STOCK_UNIVERSE } from "./collect/stock-universe";

const prisma = new PrismaClient();

const INITIAL_CAPITAL = 10_000;

/** 일봉 기준 워크포워드 — 학습 1년(252거래일) · 검증 3개월(63거래일). */
const FOLD = { inSampleBars: 252, outOfSampleBars: 63 };

/**
 * 검증 구간 **앞에서** 지표를 데우는 봉 수.
 *
 * 없으면 63봉 검증 구간에서 61봉짜리 지표(`volume_awakening`)가 거의 값을 못 낸다 —
 * 처음 돌렸을 때 89종목 21년에 거래가 **3건** 나왔고, 신호가 드문 게 아니라
 * 지표가 돌지 못한 것이었다. 252는 1거래년이고 지금 가장 긴 지표(61)의 네 배다.
 */
const WARMUP_BARS = 252;

/** **손절 없음**을 정의로 표현하는 값. */
const NO_STOP = -99;

interface ExitCombo {
  label: string;
  stopPct: number;
  targetPct: number | null;
  holdDays: number;
}

/**
 * 미리 정한 10조합. **돌리기 전에 정했다.**
 *
 * 시간청산은 전부 90일로 둔다 — 지시서 B-1 의 예시가 `90일 무반응` 이다.
 * 기준선만 30일인데, 그건 원장의 T+30 을 재현하는 것이라 일부러 다르다.
 */
const COMBOS: readonly ExitCombo[] = [
  { label: "손절 −5", stopPct: -5, targetPct: null, holdDays: 90 },
  { label: "손절 −8", stopPct: -8, targetPct: null, holdDays: 90 },
  { label: "손절 −12", stopPct: -12, targetPct: null, holdDays: 90 },
  { label: "손절 −20", stopPct: -20, targetPct: null, holdDays: 90 },
  { label: "익절 +15", stopPct: NO_STOP, targetPct: 15, holdDays: 90 },
  { label: "익절 +30", stopPct: NO_STOP, targetPct: 30, holdDays: 90 },
  { label: "−8 / +15", stopPct: -8, targetPct: 15, holdDays: 90 },
  { label: "−8 / +30", stopPct: -8, targetPct: 30, holdDays: 90 },
  { label: "−12 / +20", stopPct: -12, targetPct: 20, holdDays: 90 },
  { label: "−20 / +30", stopPct: -20, targetPct: 30, holdDays: 90 },
];

/** 원장 채점 방식의 재현 — 손절도 익절도 없이 T+30. **조합 수에 세지 않는다.** */
const BASELINE: ExitCombo = {
  label: "기준선 T+30 (청산 규칙 없음)",
  stopPct: NO_STOP,
  targetPct: null,
  holdDays: 30,
};

interface Outcome {
  label: string;
  cagr: number | null;
  mdd: number | null;
  cagrMdd: number | null;
  sharpe: number | null;
  winRate: number | null;
  profitFactor: number | null;
  trades: number;
  avgHoldHours: number | null;
  /** 청산 사유 분포 — 손절이 실제로 걸렸는지 본다. */
  exits: Record<string, number>;
  blocked: Record<string, number>;
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function indexSymbolFor(symbol: string): string | null {
  const def = STOCK_UNIVERSE.find((d) => d.yahoo === symbol);
  if (!def) return null;
  const benchmark = STOCK_BENCHMARKS.find((b) =>
    (b.markets as readonly string[]).includes(def.market)
  );
  return benchmark?.symbol ?? null;
}

async function loadBars(symbol: string): Promise<Bar[]> {
  const rows = await prisma.candle.findMany({
    where: { symbol, interval: "D1" },
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
    where: { symbol, interval: "D1" },
    select: { fromAt: true, toAt: true, missing: true },
  });
  return rows.map((r) => ({ fromAt: r.fromAt, toAt: r.toAt, missing: r.missing }));
}

interface Loaded {
  bySymbol: Record<string, Bar[]>;
  gaps: Record<string, Gap[]>;
  reference: Record<string, Bar[]>;
  flows: Record<string, { at: Date; foreignNet: number; institutionNet: number }[]>;
  longest: Bar[];
}

async function load(symbols: readonly string[]): Promise<Loaded> {
  const bySymbol: Record<string, Bar[]> = {};
  const gaps: Record<string, Gap[]> = {};
  const reference: Record<string, Bar[]> = {};
  const flows: Record<string, { at: Date; foreignNet: number; institutionNet: number }[]> = {};
  const indexCache = new Map<string, Bar[]>();

  for (const symbol of symbols) {
    const bars = await loadBars(symbol);
    if (bars.length === 0) continue;
    bySymbol[symbol] = bars;
    gaps[symbol] = await loadGaps(symbol);

    const indexSymbol = indexSymbolFor(symbol);
    if (indexSymbol) {
      let series = indexCache.get(indexSymbol);
      if (!series) {
        series = await loadBars(indexSymbol);
        indexCache.set(indexSymbol, series);
      }
      if (series.length > 0) reference[symbol] = series;
    }

    const def = STOCK_UNIVERSE.find((d) => d.yahoo === symbol);
    if (def?.naverCode) {
      const rows = await prisma.supplyDemandDaily.findMany({
        where: { ticker: def.naverCode },
        orderBy: { date: "asc" },
        select: { date: true, foreignNet: true, institutionNet: true },
      });
      // **없으면 넣지 않는다.** 빈 배열을 넣으면 연속일이 0 이 되어
      // "안 샀다" 가 되고, "자료가 없다" 와 구분이 사라진다.
      if (rows.length > 0) {
        flows[symbol] = rows.map((r) => ({
          at: new Date(`${r.date}T00:00:00Z`),
          foreignNet: r.foreignNet,
          institutionNet: r.institutionNet,
        }));
      }
    }
  }

  // 워크포워드 분할 기준 — **가장 긴 계열**. 짧은 종목으로 자르면 폴드가 몇 개 안 나온다.
  let longest: Bar[] = [];
  for (const bars of Object.values(bySymbol)) if (bars.length > longest.length) longest = bars;

  return { bySymbol, gaps, reference, flows, longest };
}

/**
 * 비교용 포지션 크기 — 자산의 10%. **조합마다 같게 고정한다.**
 *
 * ## 왜 정의의 `risk_pct` 를 쓰지 않나 — 처음 돌린 표가 딴 것을 재고 있었다
 *
 * `risk_pct` 사이징은 `명목 = (자산 × risk%) / 손절거리` 다. 손절이 좁을수록
 * **포지션이 커진다.** 그래서 첫 실측이 이렇게 나왔다:
 *
 * | 손절 | 실제 명목(자산 대비) | MDD |
 * |---|---|---|
 * | 없음(−99%) | 2% | −2.6% |
 * | −5% | **40%** | −44.1% |
 *
 * "손절을 걸었더니 낙폭이 20배가 됐다" 로 읽히지만, 실제로 달라진 것은 **포지션
 * 크기**다. 이 배치가 답해야 하는 질문은 "청산 규칙이 성적을 바꾸는가" 이고,
 * 한 번에 한 가지만 바꿔야 그 답이 나온다.
 *
 * 그래서 조합 비교에서는 크기를 고정한다. 10%는 동시 보유 3개 기준 최대 30% 노출이다.
 */
const COMPARISON_SIZING = { type: "fixed_pct", fixed_pct: 10 } as const;

function withExit(definition: StrategyDefinition, combo: ExitCombo): StrategyDefinition {
  return {
    ...definition,
    sizing: COMPARISON_SIZING,
    exit: {
      ...definition.exit,
      stop_pct: combo.stopPct,
      target_pct: combo.targetPct,
      max_hold_days: combo.holdDays,
    },
  };
}

function runCombo(definition: StrategyDefinition, loaded: Loaded, combo: ExitCombo): Outcome {
  const folds = splitFolds(loaded.longest, FOLD);
  const windows =
    folds.length > 0
      ? folds.map((f) => ({ from: f.outOfSample.from.getTime(), to: f.outOfSample.to.getTime() }))
      : [{ from: -Infinity, to: Infinity }];

  const trades: ClosedTrade[] = [];
  const equity: EquityPoint[] = [];
  const blocked: Record<string, number> = {};

  for (const window of windows) {
    const slice: Record<string, Bar[]> = {};
    for (const [symbol, bars] of Object.entries(loaded.bySymbol)) {
      const inWindow = bars.filter(
        (bar) => bar.at.getTime() >= window.from && bar.at.getTime() <= window.to
      );
      // 검증 구간 **앞** 봉을 워밍업으로 붙인다. 과거 데이터라 look-ahead 가 아니다.
      const before = bars.filter((bar) => bar.at.getTime() < window.from).slice(-WARMUP_BARS);
      slice[symbol] = [...before, ...inWindow];
    }
    const result = execute({
      definition: withExit(definition, combo),
      source: new MultiSymbolSource({
        bySymbol: slice,
        gaps: loaded.gaps,
        reference: loaded.reference,
        flows: loaded.flows,
      }),
      config: { ...DEFAULT_EXECUTOR, initialCapital: INITIAL_CAPITAL },
      gaps: loaded.gaps,
      ...(Number.isFinite(window.from) ? { warmupUntil: new Date(window.from) } : {}),
    });
    trades.push(...result.trades);
    equity.push(...result.equity);
    for (const [key, value] of Object.entries(result.blocked)) {
      blocked[key] = (blocked[key] ?? 0) + value;
    }
  }

  const metrics = computeMetrics(trades, equity, INITIAL_CAPITAL);
  const exits: Record<string, number> = {};
  for (const trade of trades) exits[trade.exitReason] = (exits[trade.exitReason] ?? 0) + 1;

  return {
    label: combo.label,
    cagr: metrics.cagr,
    mdd: metrics.mdd,
    cagrMdd: metrics.cagrMdd,
    sharpe: metrics.sharpe,
    winRate: metrics.winRate,
    profitFactor: metrics.profitFactor,
    trades: metrics.trades,
    avgHoldHours: metrics.avgHoldHours,
    exits,
    blocked,
  };
}

function fmt(value: number | null, digits = 2, suffix = ""): string {
  return value === null ? "—" : `${value > 0 && suffix === "%" ? "+" : ""}${value.toFixed(digits)}${suffix}`;
}

function table(rows: readonly Outcome[]): string {
  const lines = [
    "| 청산 규칙 | CAGR | MDD | C/M | 샤프 | 승률 | 손익비 | 평균보유 | 거래 | 청산사유 |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    const reasons = Object.entries(row.exits)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `${reason} ${count}`)
      .join(" · ");
    lines.push(
      `| ${row.label} | ${fmt(row.cagr, 1, "%")} | ${fmt(row.mdd, 1, "%")} | ${fmt(row.cagrMdd)} | ` +
        `${fmt(row.sharpe)} | ${row.winRate === null ? "—" : `${row.winRate.toFixed(0)}%`} | ` +
        `${fmt(row.profitFactor)} | ${row.avgHoldHours === null ? "—" : `${(row.avgHoldHours / 24).toFixed(0)}일`} | ` +
        `${row.trades} | ${reasons || "—"} |`
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const signal = arg("signal");
  if (!signal) {
    console.error("--signal <파일이름> 이 필요하다 (docs/lab/strategies/<이름>.json)");
    process.exit(1);
  }

  const path = `docs/lab/strategies/${signal}.json`;
  const file = JSON.parse(readFileSync(path, "utf8")) as { name: string; definition: unknown };
  const definition = assertStrategyDefinition(file.definition);

  console.log(`\n## ${file.name}\n`);
  console.log(
    `포지션 크기는 조합마다 **고정**(자산의 ${COMPARISON_SIZING.fixed_pct}%)이다 — ` +
      `한 번에 한 가지만 바꿔야 청산 규칙의 효과가 보인다.\n`
  );

  const started = Date.now();
  const loaded = await load(definition.universe.symbols);
  const symbols = Object.keys(loaded.bySymbol).length;
  const withFlows = Object.keys(loaded.flows).length;
  console.log(
    `봉 ${Object.values(loaded.bySymbol).reduce((n, b) => n + b.length, 0).toLocaleString()}개 · ` +
      `종목 ${symbols} · 참조지수 ${Object.keys(loaded.reference).length} · 수급 ${withFlows}\n`
  );

  if (symbols === 0) {
    console.error("봉이 없다. 먼저 npm run lab:stock-candles -- --backfill");
    process.exit(1);
  }

  // 기준선 먼저 — **이것이 비교 대상**이다.
  const baseline = runCombo(definition, loaded, BASELINE);
  const results = COMBOS.map((combo) => runCombo(definition, loaded, combo));

  console.log(table([baseline, ...results]));

  // 고르는 것은 C/M 이다(LAB-00 §7). 표본이 모자라면 고르지 않는다.
  const rankable = results.filter((r) => r.trades >= 30 && r.cagrMdd !== null);
  const best = rankable.sort((a, b) => (b.cagrMdd ?? 0) - (a.cagrMdd ?? 0))[0] ?? null;

  console.log(`\n조합 ${COMBOS.length}개 시도(기준선 제외) · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (!best) {
    console.log(
      `\n**고르지 않았다.** 표본 30건을 넘긴 조합이 없다 — ` +
        `가장 많은 조합도 ${Math.max(0, ...results.map((r) => r.trades))}건이다.`
    );
  } else {
    console.log(`\n**선택: ${best.label}** — C/M ${fmt(best.cagrMdd)} · 거래 ${best.trades}건`);
    const delta =
      baseline.cagrMdd !== null && best.cagrMdd !== null ? best.cagrMdd - baseline.cagrMdd : null;
    console.log(
      `기준선 대비 C/M ${delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`} ` +
        `(기준선 ${fmt(baseline.cagrMdd)} → ${fmt(best.cagrMdd)})`
    );
  }

  const out = arg("json");
  if (out) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(out, JSON.stringify({ signal, baseline, results }, null, 2));
    console.log(`\n→ ${out}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
