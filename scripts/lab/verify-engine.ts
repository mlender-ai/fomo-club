/**
 * LAB-04 PART G — 엔진 역검증. **실제 3년치 봉으로 돌린다.**
 *
 * 단위 테스트는 합성 시계열로 규칙을 본다. 여기서 보는 것은 **진짜 데이터에서
 * 엔진이 산수를 맞게 하는가** 다.
 *
 *  G-1  매수후보유 — 결과가 실제 가격 변동과 맞나. 수수료·슬리피지만큼 낮아야 정상
 *  G-2  look-ahead — 절단 불변성 (실데이터로 한 번 더)
 *  G-3  손절 체결 — 갭 하락 구간을 만들어 시가 체결이 되나
 *
 * > **이게 통과 안 되면 엔진이 틀린 것이다.**
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/lab/verify-engine.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_EXECUTOR,
  DEFAULT_FILL,
  HistoricalSource,
  computeMetrics,
  execute,
  type Bar,
  type StrategyDefinition,
} from "@fomo/lab";

const prisma = new PrismaClient();
const INITIAL = 10_000;

const checks: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * 매수후보유. 첫 봉에 사서 끝까지 든다.
 *
 * 손절은 −99% 로 둔다 — `stop_pct` 는 필수라 뺄 수 없고(LAB-02 완료확인 4),
 * −99% 면 3년 동안 안 닿는다. **손절을 없앤 게 아니라 닿지 않게 둔 것**이다.
 */
const BUY_AND_HOLD: StrategyDefinition = {
  market: "crypto",
  universe: { type: "list", symbols: ["BTC"] },
  entry: { all: [{ indicator: "consecutive", min: -999 }] },
  exit: { stop_pct: -99, target_pct: null, max_hold_days: null },
  sizing: { type: "fixed_pct", fixed_pct: 100 },
  leverage: 1,
  max_positions: 1,
};

async function loadBars(limit?: number): Promise<Bar[]> {
  const rows = await prisma.candle.findMany({
    where: { symbol: "BTC", interval: "H1" },
    orderBy: { at: "asc" },
    ...(limit ? { take: limit } : {}),
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

function run(bars: readonly Bar[], definition = BUY_AND_HOLD, fill = DEFAULT_FILL) {
  return execute({
    definition,
    source: new HistoricalSource({ symbol: "BTC", bars }),
    config: { ...DEFAULT_EXECUTOR, initialCapital: INITIAL, fill, reentryLock: "off" },
  });
}

async function main(): Promise<void> {
  const bars = await loadBars();
  if (bars.length < 1000) {
    console.error(`봉이 ${bars.length}개뿐이다. 먼저 npm run lab:candles -- --backfill`);
    process.exit(1);
  }
  const first = bars[0] as Bar;
  const last = bars[bars.length - 1] as Bar;
  console.log(
    `BTC 1시간봉 ${bars.length.toLocaleString()}개 · ` +
      `${first.at.toISOString().slice(0, 10)} ~ ${last.at.toISOString().slice(0, 10)}\n`
  );

  // ── G-1 ─────────────────────────────────────────────────────────────────
  console.log("G-1. 매수후보유 — 결과가 실제 가격 변동과 맞나");

  // 비용 0 으로 돌리면 순수 가격 변동만 남는다.
  const free = { ...DEFAULT_FILL, takerFeeRate: 0, minSlippageBps: 0, impactBps: 0 };
  const freeRun = run(bars, BUY_AND_HOLD, free);
  const freeMetrics = computeMetrics(freeRun.trades, freeRun.equity, INITIAL);

  // 진입은 두 번째 봉 시가다(첫 봉에서 신호 → 다음 봉 체결). 워밍업 2봉이라 3번째.
  const entryBar = bars[2] as Bar;
  const priceReturn = ((last.close - entryBar.open) / entryBar.open) * 100;

  check(
    "비용 0 이면 총수익이 실제 가격 변동과 일치한다",
    freeMetrics.totalReturn !== null && Math.abs(freeMetrics.totalReturn - priceReturn) < 0.5,
    `엔진 ${freeMetrics.totalReturn?.toFixed(2)}% vs 가격 ${priceReturn.toFixed(2)}%`
  );

  const costRun = run(bars, BUY_AND_HOLD, DEFAULT_FILL);
  const costMetrics = computeMetrics(costRun.trades, costRun.equity, INITIAL);
  check(
    "수수료·슬리피지를 물리면 **더 낮게** 나온다",
    costMetrics.totalReturn !== null &&
      freeMetrics.totalReturn !== null &&
      costMetrics.totalReturn < freeMetrics.totalReturn,
    `${costMetrics.totalReturn?.toFixed(2)}% < ${freeMetrics.totalReturn?.toFixed(2)}%`
  );



  check(
    "매수후보유는 끝까지 들고 있다 — 닫힌 거래가 0건이고 포지션이 열려 있다",
    freeRun.trades.length === 0 && freeMetrics.totalReturn !== null && freeMetrics.totalReturn > 100,
    `닫힌 거래 ${freeRun.trades.length}건 · 총수익 ${freeMetrics.totalReturn?.toFixed(2)}%`
  );

  check(
    "비용을 물려도 **진입은 한다** — 수량을 줄여서 들어간다",
    costMetrics.totalReturn !== null && costMetrics.totalReturn > 100,
    `${costMetrics.totalReturn?.toFixed(2)}%`
  );

  check(
    "비용 차이가 설명 가능한 크기다 — 왕복 0.1% + 슬리피지",
    freeMetrics.totalReturn !== null &&
      costMetrics.totalReturn !== null &&
      freeMetrics.totalReturn - costMetrics.totalReturn < 5,
    `차이 ${((freeMetrics.totalReturn ?? 0) - (costMetrics.totalReturn ?? 0)).toFixed(2)}%p`
  );

  check(
    "낙폭이 실제로 잡힌다 — 3년 크립토에서 0 일 수 없다",
    freeMetrics.mdd !== null && freeMetrics.mdd < -5,
    `MDD ${freeMetrics.mdd?.toFixed(2)}%`
  );

  // ── G-2 ─────────────────────────────────────────────────────────────────
  console.log("\nG-2. look-ahead — 실데이터 절단 불변성");
  const cutPoints = [5_000, 12_000, 20_000];
  let divergent = 0;
  for (const n of cutPoints) {
    if (n >= bars.length) continue;
    const cut = bars.slice(0, n);
    const at = (cut[cut.length - 1] as Bar).at.getTime();
    const a = run(cut).equity.map((p) => p.equity.toFixed(6));
    const b = run(bars)
      .equity.filter((p) => p.at.getTime() <= at)
      .map((p) => p.equity.toFixed(6));
    if (a.join() !== b.join()) divergent += 1;
  }
  check("실데이터에서도 절단 불변성이 성립한다", divergent === 0, `${cutPoints.length}개 지점 검사`);

  // ── G-3 ─────────────────────────────────────────────────────────────────
  console.log("\nG-3. 손절 체결 — 갭 하락이면 시가로");
  const head = bars.slice(0, 40).map((bar, i) => ({ ...bar, at: bar.at }));
  const base = (head[2] as Bar).open;
  // 진입 직후 봉을 −30% 갭으로 바꾼다. 손절선은 −10% 라 시가가 이미 그 아래다.
  const gapped = head.map((bar, i) =>
    i === 3
      ? { ...bar, open: base * 0.7, high: base * 0.72, low: base * 0.68, close: base * 0.71 }
      : bar
  );
  const stopStrategy: StrategyDefinition = {
    ...BUY_AND_HOLD,
    exit: { stop_pct: -10, target_pct: null, max_hold_days: null },
  };
  const gapRun = run(gapped, stopStrategy, { ...DEFAULT_FILL, takerFeeRate: 0, minSlippageBps: 0, impactBps: 0 });
  const gapTrade = gapRun.trades[0];

  check("갭 하락에서 손절로 청산된다", gapTrade?.exitReason === "STOP");
  check(
    "**손절가가 아니라 시가로** 체결된다 — 손절가보다 나쁜 가격이다",
    gapTrade !== undefined && Math.abs(gapTrade.exitPrice - base * 0.7) < 0.01,
    `체결 ${gapTrade?.exitPrice.toFixed(2)} vs 손절선 ${(base * 0.9).toFixed(2)}`
  );
  check(
    "체결가가 손절선보다 낮다",
    gapTrade !== undefined && gapTrade.exitPrice < base * 0.9
  );

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
