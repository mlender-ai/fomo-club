/**
 * LAB-09 PART C — 주식 일봉·지수 수집.
 *
 * 크립토 봉 수집(`collect-candles.ts`)과 **따로 둔 이유**가 있다.
 * 같은 `Candle` 표에 쌓지만 성질이 다르다:
 *
 * | | 크립토 | 주식 |
 * |---|---|---|
 * | 봉 | 1시간 · 24시간 연속 | **일봉 · 장중만** |
 * | 빈 구간 | 전부 구멍이다 | **주말·공휴일은 구멍이 아니다** |
 * | 소스 | Binance | Yahoo |
 *
 * 같은 스크립트에 넣으면 "구멍" 판정이 두 갈래가 되고, 한쪽 규칙이 다른 쪽을 조용히
 * 망친다. 크립토의 `inspectCandles` 는 간격이 일정하다는 전제 위에 서 있다.
 *
 * ## 거래일 달력을 만들어내지 않는다
 *
 * 한국 공휴일표를 코드에 박으면 매년 틀린다(임시공휴일·대체휴일). 대신
 * **지수(`^KS11`·`^KQ11`·`^GSPC`)가 거래일 달력이다** — 지수에 봉이 있는 날이 거래일이다.
 * 종목에 그날 봉이 없으면 그건 진짜 구멍(거래정지·상장 전후)이다.
 *
 *   npm run lab:stock-candles                  # 증분
 *   npm run lab:stock-candles -- --backfill    # 전체 (2005~)
 *   npm run lab:stock-candles -- --symbol 005930.KS
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { finish, runJob, type JobResult } from "./collect/job";
import { fetchYahooDaily } from "./collect/sources";
import { STOCK_BENCHMARKS, STOCK_UNIVERSE, type StockDef } from "./collect/stock-universe";

const prisma = new PrismaClient();

/** 소스 이름. `Candle.source` 에 박힌다 — 나중에 어디서 온 숫자인지 알아야 한다. */
const SOURCE = "yahoo-daily";

/** 백필 시작. 야후가 국내 종목은 2005년부터 준다(삼성전자 5,371봉 실측). */
const BACKFILL_FROM = new Date("2005-01-01T00:00:00Z");

const DAY_MS = 86_400_000;

const BACKFILL = process.argv.includes("--backfill");
const DRY = process.argv.includes("--dry");

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/** 야후 레이트 보호. 89종목이면 89콜이라 넉넉히 둬도 2분이 안 걸린다. */
const GAP_MS = 250;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function upsertCandles(symbol: string, bars: Awaited<ReturnType<typeof fetchYahooDaily>>): Promise<number> {
  if (bars.length === 0 || DRY) return 0;
  let written = 0;
  for (let i = 0; i < bars.length; i += 1000) {
    const result = await prisma.candle.createMany({
      data: bars.slice(i, i + 1000).map((bar) => ({
        symbol,
        interval: "D1" as const,
        at: bar.at,
        open: new Prisma.Decimal(bar.open),
        high: new Prisma.Decimal(bar.high),
        low: new Prisma.Decimal(bar.low),
        close: new Prisma.Decimal(bar.close),
        volume: new Prisma.Decimal(bar.volume),
        source: SOURCE,
      })),
      skipDuplicates: true,
    });
    written += result.count;
  }
  return written;
}

/** 이 심볼의 마지막 봉 다음날부터. 없으면 백필 시작점부터. */
async function startFor(symbol: string): Promise<Date> {
  if (BACKFILL) return BACKFILL_FROM;
  const newest = await prisma.candle.findFirst({
    where: { symbol, interval: "D1" },
    orderBy: { at: "desc" },
    select: { at: true },
  });
  return newest ? new Date(newest.at.getTime() + DAY_MS) : BACKFILL_FROM;
}

/**
 * 지수를 받아 `Candle`(달력용)과 `Benchmark`(비교용) 양쪽에 넣는다.
 *
 * 두 군데 쓰는 이유: 거래일 달력은 봉이 필요하고, 화면 비교는 종가만 필요하다.
 * 같은 숫자를 두 번 적는 셈이지만, `Benchmark` 는 크립토 BTC 와 **같은 표**라
 * 화면이 시장을 가리지 않고 읽을 수 있다.
 */
async function collectIndex(
  benchmark: (typeof STOCK_BENCHMARKS)[number],
  now: Date
): Promise<{ bars: number; days: number }> {
  const from = await startFor(benchmark.symbol);
  const bars = from > now ? [] : await fetchYahooDaily(benchmark.yahoo, from, now);
  await upsertCandles(benchmark.symbol, bars);

  if (!DRY && bars.length > 0) {
    for (let i = 0; i < bars.length; i += 1000) {
      await prisma.benchmark.createMany({
        data: bars.slice(i, i + 1000).map((bar) => ({
          symbol: benchmark.symbol,
          at: bar.at,
          price: new Prisma.Decimal(bar.close),
        })),
        skipDuplicates: true,
      });
    }
  }
  return { bars: bars.length, days: bars.length };
}

/** 지수에 봉이 있는 날 = 거래일. 이것이 이 시장의 달력이다. */
async function tradingDays(indexSymbol: string): Promise<Set<number>> {
  const rows = await prisma.candle.findMany({
    where: { symbol: indexSymbol, interval: "D1" },
    orderBy: { at: "asc" },
    select: { at: true },
  });
  return new Set(rows.map((r) => r.at.getTime()));
}

/**
 * 종목의 구멍을 **거래일 달력에 대고** 센다.
 *
 * 상장 전후는 구멍이 아니다 — 그 종목의 첫 봉과 마지막 봉 사이만 본다.
 * 그 안에서 거래일인데 봉이 없으면 거래정지이거나 소스 누락이고, 둘 다 진짜 구멍이다.
 */
async function recordGaps(symbol: string, calendar: Set<number>): Promise<number> {
  const rows = await prisma.candle.findMany({
    where: { symbol, interval: "D1" },
    orderBy: { at: "asc" },
    select: { at: true },
  });
  if (rows.length < 2) return 0;

  const have = new Set(rows.map((r) => r.at.getTime()));
  const first = rows[0]!.at.getTime();
  const last = rows[rows.length - 1]!.at.getTime();

  const missing = [...calendar].filter((t) => t > first && t < last && !have.has(t)).sort((a, b) => a - b);
  if (missing.length === 0) {
    if (!DRY) await prisma.dataGap.deleteMany({ where: { symbol, interval: "D1" } });
    return 0;
  }

  // 이어진 결측일은 한 구간으로 묶는다 — 거래정지는 대개 연속이다.
  const spans: { fromAt: Date; toAt: Date; missing: number }[] = [];
  let runStart = missing[0]!;
  let runEnd = missing[0]!;
  let count = 1;
  const ordered = [...calendar].sort((a, b) => a - b);
  const indexOf = new Map(ordered.map((t, i) => [t, i]));

  for (let i = 1; i < missing.length; i += 1) {
    const prev = missing[i - 1]!;
    const cur = missing[i]!;
    const adjacent = (indexOf.get(cur) ?? 0) - (indexOf.get(prev) ?? 0) === 1;
    if (adjacent) {
      runEnd = cur;
      count += 1;
    } else {
      spans.push({ fromAt: new Date(runStart), toAt: new Date(runEnd), missing: count });
      runStart = cur;
      runEnd = cur;
      count = 1;
    }
  }
  spans.push({ fromAt: new Date(runStart), toAt: new Date(runEnd), missing: count });

  if (!DRY) {
    await prisma.dataGap.deleteMany({ where: { symbol, interval: "D1" } });
    await prisma.dataGap.createMany({
      data: spans.map((s) => ({ symbol, interval: "D1" as const, ...s })),
      skipDuplicates: true,
    });
  }
  return missing.length;
}

/** 그 종목이 속한 시장의 지수 심볼. */
function indexFor(def: StockDef): string {
  const found = STOCK_BENCHMARKS.find((b) => (b.markets as readonly string[]).includes(def.market));
  if (!found) throw new Error(`${def.market} 에 맞는 지수가 없다`);
  return found.symbol;
}

async function main(): Promise<void> {
  const now = new Date();
  const only = arg("symbol");
  const targets = only
    ? STOCK_UNIVERSE.filter((d) => d.yahoo === only)
    : [...STOCK_UNIVERSE];

  if (only && targets.length === 0) throw new Error(`유니버스에 없는 심볼: ${only}`);

  const outcome = await runJob(prisma, "stock-candles", async (): Promise<JobResult> => {
    // 1. 지수 먼저 — **거래일 달력이 여기서 나온다.** 종목보다 먼저 있어야 구멍을 셀 수 있다.
    const indexRows: Record<string, number> = {};
    for (const benchmark of STOCK_BENCHMARKS) {
      const { bars } = await collectIndex(benchmark, now);
      indexRows[benchmark.symbol] = bars;
      await sleep(GAP_MS);
    }

    const calendars = new Map<string, Set<number>>();
    for (const benchmark of STOCK_BENCHMARKS) {
      calendars.set(benchmark.symbol, await tradingDays(benchmark.symbol));
    }

    // 2. 종목.
    let rows = 0;
    let gaps = 0;
    const failed: string[] = [];
    const empty: string[] = [];

    for (const def of targets) {
      try {
        const from = await startFor(def.yahoo);
        const bars = from > now ? [] : await fetchYahooDaily(def.yahoo, from, now);
        if (bars.length === 0 && from <= now) empty.push(def.yahoo);
        rows += await upsertCandles(def.yahoo, bars);
        const calendar = calendars.get(indexFor(def));
        if (calendar && calendar.size > 0) gaps += await recordGaps(def.yahoo, calendar);
      } catch (error) {
        // **한 종목이 죽어도 나머지는 받는다.** 단, 조용히 넘기지 않고 센다.
        failed.push(`${def.yahoo}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await sleep(GAP_MS);
    }

    return {
      rows,
      detail: {
        symbols: targets.length,
        indexRows,
        gapDays: gaps,
        emptySymbols: empty,
        failed,
        mode: BACKFILL ? "backfill" : "incremental",
        dry: DRY,
      },
    };
  });

  await finish(prisma, outcome);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
