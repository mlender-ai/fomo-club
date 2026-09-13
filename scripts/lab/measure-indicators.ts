/**
 * LAB-06 PART E-1 — **각 지표의 분포를 실측한다.**
 *
 * > 파라미터를 감으로 정하지 않는다(하지 말 것 1).
 *
 * 임계값을 고르기 전에 그 지표가 실제로 어떤 값을 갖는지 본다.
 * 분포를 모르고 `rsi < 30` 을 쓰면 그게 하루에 열 번 걸리는 조건인지
 * 1년에 한 번 걸리는 조건인지 모른 채 전략을 만드는 것이다.
 *
 * **읽기만 한다.** 아무것도 쓰지 않는다.
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/lab/measure-indicators.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  ma,
  maCross,
  pctFromMa,
  rsi,
  volumeRatio,
  type Bar,
} from "@fomo/lab";

const prisma = new PrismaClient();
const SYMBOLS = ["BTC", "ETH", "SOL"] as const;

/** 워밍업. 이보다 앞은 지표가 null 이라 분포에 넣지 않는다. */
const WARMUP = 61;

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const index = (sorted.length - 1) * q;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (index - lo);
}

function describe(name: string, values: readonly number[]): void {
  if (values.length === 0) {
    console.log(`  ${name.padEnd(18)} 값 없음`);
    return;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const cells = [
    quantile(sorted, 0.01),
    quantile(sorted, 0.05),
    quantile(sorted, 0.25),
    quantile(sorted, 0.5),
    quantile(sorted, 0.75),
    quantile(sorted, 0.95),
    quantile(sorted, 0.99),
  ]
    .map((v) => v.toFixed(2).padStart(9))
    .join("");
  console.log(`  ${name.padEnd(18)}${cells}   n=${values.length.toLocaleString()}`);
}

/** 조건이 몇 % 의 봉에서 걸리나. **빈도를 모르면 임계를 못 고른다.** */
function hitRate(values: readonly number[], test: (v: number) => boolean): string {
  if (values.length === 0) return "—";
  const hits = values.filter(test).length;
  return `${((hits / values.length) * 100).toFixed(2)}% (${hits.toLocaleString()}건)`;
}

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

async function main(): Promise<void> {
  console.log("지표 분포 — BTC·ETH·SOL 1시간봉 3년\n");
  console.log(`  ${"지표".padEnd(16)}${["1%", "5%", "25%", "50%", "75%", "95%", "99%"].map((h) => h.padStart(9)).join("")}`);

  const all: Record<string, number[]> = {
    rsi14: [],
    pctFromMa20: [],
    volumeRatio20: [],
    maCross2060: [],
  };

  for (const symbol of SYMBOLS) {
    const bars = await loadBars(symbol);
    if (bars.length < WARMUP) continue;
    for (let i = WARMUP; i < bars.length; i += 1) {
      const window = bars.slice(Math.max(0, i - 200), i + 1);
      const r = rsi(window, 14);
      const p = pctFromMa(window, 20);
      const v = volumeRatio(window, 20);
      const c = maCross(window, 20, 60);
      if (r !== null) all.rsi14?.push(r);
      if (p !== null) all.pctFromMa20?.push(p);
      if (v !== null) all.volumeRatio20?.push(v);
      if (c !== null) all.maCross2060?.push(c);
    }
  }

  console.log();
  describe("rsi(14)", all.rsi14 ?? []);
  describe("pct_from_ma(20)", all.pctFromMa20 ?? []);
  describe("volume_ratio(20)", all.volumeRatio20 ?? []);

  console.log("\n조건별 적중 빈도 (3종목 합)\n");
  const rsiValues = all.rsi14 ?? [];
  const pctValues = all.pctFromMa20 ?? [];
  const volValues = all.volumeRatio20 ?? [];
  const crossValues = all.maCross2060 ?? [];

  console.log("  rsi(14)");
  for (const t of [20, 25, 30, 35]) {
    console.log(`    < ${String(t).padStart(3)}        ${hitRate(rsiValues, (v) => v < t)}`);
  }
  for (const t of [55, 60, 65, 70]) {
    console.log(`    > ${String(t).padStart(3)}        ${hitRate(rsiValues, (v) => v > t)}`);
  }

  console.log("  pct_from_ma(20)");
  for (const t of [-3, -5, -8, -12]) {
    console.log(`    < ${String(t).padStart(3)}%       ${hitRate(pctValues, (v) => v < t)}`);
  }

  console.log("  volume_ratio(20)");
  for (const t of [1.2, 1.5, 2, 2.5, 3]) {
    console.log(`    > ${String(t).padStart(3)}        ${hitRate(volValues, (v) => v > t)}`);
  }

  console.log("  ma_cross(20,60)");
  console.log(`    골든(up)      ${hitRate(crossValues, (v) => v === 1)}`);
  console.log(`    데드(down)    ${hitRate(crossValues, (v) => v === -1)}`);

  // 고래 — 실제 스냅샷이 얼마나 쌓였나. 임계(min_usd)는 이 분포로 정해야 한다.
  const whale = await prisma.whalePosition.groupBy({
    by: ["symbol"],
    _count: { _all: true },
    _sum: { size: true },
  });
  console.log("\n고래 스냅샷");
  if (whale.length === 0) {
    console.log("  없음 — min_usd 임계를 실측으로 정할 수 없다");
  } else {
    for (const row of whale) {
      console.log(
        `  ${row.symbol.padEnd(6)} ${row._count._all}건 · 합계 $${Number(row._sum.size ?? 0).toLocaleString()}`
      );
    }
    const span = await prisma.whalePosition.aggregate({ _min: { at: true }, _max: { at: true } });
    console.log(
      `  기간 ${span._min.at?.toISOString().slice(0, 16)} ~ ${span._max.at?.toISOString().slice(0, 16)}`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
