/**
 * LAB-03 PART A — 봉 수집.
 *
 * 백필과 증분이 **같은 스크립트**다. 시작 시각만 다르다 —
 * 따로 만들면 둘이 갈라져서 백필로 넣은 봉과 증분으로 넣은 봉의 규칙이 달라진다.
 *
 *   npm run lab:candles                  # 증분 (가진 마지막 봉 이후)
 *   npm run lab:candles -- --backfill    # 3년 백필
 *   npm run lab:candles -- --symbol BTC --interval H1
 *
 * **구멍을 메우지 않는다.** 받은 봉만 넣고, 빠진 구간은 `DataGap` 에 기록한다.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { inspectCandles, INTERVAL_MS, type Interval } from "@fomo/lab";

import {
  BACKFILL_YEARS,
  BINANCE_PAIR,
  INTERVALS,
  SOURCE_CANDLE,
  SYMBOLS,
  type IntervalKey,
  type Symbol,
} from "./collect/config";
import { fetchBinanceCandles } from "./collect/sources";
import { finish, runJob, type JobResult } from "./collect/job";

const prisma = new PrismaClient();

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const BACKFILL = process.argv.includes("--backfill");

const symbols = (arg("symbol") ? [arg("symbol") as Symbol] : [...SYMBOLS]).filter((s) =>
  (SYMBOLS as readonly string[]).includes(s)
);
const intervals = (arg("interval") ? [arg("interval") as IntervalKey] : [...INTERVALS]).filter(
  (i) => (INTERVALS as readonly string[]).includes(i)
);

/** 아직 닫히지 않은 봉은 넣지 않는다 — 값이 나중에 바뀐다. */
function lastClosedBoundary(interval: Interval): Date {
  const step = INTERVAL_MS[interval];
  return new Date(Math.floor(Date.now() / step) * step - step);
}

async function collectOne(symbol: Symbol, interval: IntervalKey): Promise<{ rows: number; detail: Record<string, unknown> }> {
  const to = lastClosedBoundary(interval);

  const newest = await prisma.candle.findFirst({
    where: { symbol, interval },
    orderBy: { at: "desc" },
    select: { at: true },
  });

  const from = BACKFILL || !newest
    ? new Date(Date.now() - BACKFILL_YEARS * 365 * 24 * 60 * 60 * 1000)
    : new Date(newest.at.getTime() + INTERVAL_MS[interval]);

  // 최신 상태여도 **조기 반환하지 않는다.** 여기서 빠져나가면 품질 검사가 건너뛰어지고,
  // 새 봉이 안 들어오는 동안 기존 구멍이 영원히 안 보인다. 받을 게 없을 뿐이지
  // 볼 게 없는 게 아니다.
  const raw =
    from > to ? [] : await fetchBinanceCandles(BINANCE_PAIR[symbol], interval, from, to);
  const closed = raw.filter((c) => c.at.getTime() <= to.getTime());

  if (closed.length > 0) {
    for (let i = 0; i < closed.length; i += 1000) {
      await prisma.candle.createMany({
        data: closed.slice(i, i + 1000).map((c) => ({
          symbol,
          interval,
          at: c.at,
          open: new Prisma.Decimal(c.open),
          high: new Prisma.Decimal(c.high),
          low: new Prisma.Decimal(c.low),
          close: new Prisma.Decimal(c.close),
          volume: new Prisma.Decimal(c.volume),
          source: SOURCE_CANDLE,
        })),
        skipDuplicates: true,
      });
    }
  }

  // 품질 검사 5종은 **가진 것 전체**에 대해 돈다. 이번에 받은 것만 보면
  // 백필과 증분 사이의 이음매에 생긴 구멍을 놓친다.
  const all = await prisma.candle.findMany({
    where: { symbol, interval },
    orderBy: { at: "asc" },
    select: { at: true, open: true, high: true, low: true, close: true, volume: true },
  });
  const report = inspectCandles(
    symbol,
    interval,
    all.map((c) => ({
      at: c.at,
      open: c.open.toNumber(),
      high: c.high.toNumber(),
      low: c.low.toNumber(),
      close: c.close.toNumber(),
      volume: c.volume.toNumber(),
    }))
  );

  // 구멍을 **기록만** 한다. 메우지 않는다(LAB-00 §7).
  for (const gap of report.gaps) {
    await prisma.dataGap.upsert({
      where: { symbol_interval_fromAt: { symbol, interval, fromAt: gap.fromAt } },
      create: { symbol, interval, fromAt: gap.fromAt, toAt: gap.toAt, missing: gap.missing },
      update: { toAt: gap.toAt, missing: gap.missing },
    });
  }

  return {
    rows: closed.length,
    detail: {
      [`${symbol}.${interval}`]: {
        신규: closed.length,
        보유: report.count,
        기대: report.expected,
        구멍: report.missing,
        구간: report.gaps.length,
        이상치: report.outliers.length,
        정렬오류: report.misaligned.length,
        중복: report.duplicates.length,
        처음: report.first?.toISOString().slice(0, 16) ?? null,
        마지막: report.last?.toISOString().slice(0, 16) ?? null,
        ok: report.ok,
      },
    },
  };
}

async function main(): Promise<void> {
  const outcome = await runJob(prisma, "candles", async (): Promise<JobResult> => {
    let rows = 0;
    const detail: Record<string, unknown> = { mode: BACKFILL ? "backfill" : "incremental" };
    for (const symbol of symbols) {
      for (const interval of intervals) {
        const one = await collectOne(symbol, interval);
        rows += one.rows;
        Object.assign(detail, one.detail);
      }
    }
    return { rows, detail };
  });
  await finish(prisma, outcome);
}

void main();
