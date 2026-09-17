/**
 * 데이터 상태 — 화면(`LAB-03` PART B-2)과 페이퍼 실행기(`LAB-07`)가 같이 읽는다.
 *
 * 여기서 판단하지 않는다. 판단은 `@fomo/lab` 의 `feedStatus` 가 한다 —
 * 이 파일은 DB 에서 재료를 꺼내 그 함수에 넘길 뿐이다.
 */
import { feedStatus, type FeedStatus } from "@fomo/lab";

import { prisma } from "../prisma";

/** `scripts/lab/collect/config.ts` 의 `STALE_AFTER_MS` 와 같아야 한다. */
export const STALE_AFTER_MS = 3 * 60 * 1000;

export interface JobHealth {
  job: string;
  ok: boolean;
  finishedAt: Date;
  rows: number;
  error: string | null;
  /** 이 잡의 현재 연속 실패 횟수. */
  consecutiveFailures: number;
}

export interface GapSummary {
  symbol: string;
  interval: string;
  intervals: number;
  missing: number;
}

export interface DataStatus {
  feed: FeedStatus;
  jobs: JobHealth[];
  gaps: GapSummary[];
  candles: { symbol: string; interval: string; count: number; last: Date | null }[];
  whale: { positions: number; lastAt: Date | null };
}

export async function readDataStatus(now: Date = new Date()): Promise<DataStatus> {
  const [prices, runs, gaps, candleGroups, whaleCount, whaleLast] = await Promise.all([
    prisma.latestPrice.findMany({ select: { symbol: true, fetchedAt: true } }),
    prisma.collectionRun.findMany({
      orderBy: { finishedAt: "desc" },
      take: 200,
      select: { job: true, ok: true, finishedAt: true, rows: true, error: true },
    }),
    prisma.dataGap.groupBy({
      by: ["symbol", "interval"],
      _count: { _all: true },
      _sum: { missing: true },
    }),
    prisma.candle.groupBy({
      by: ["symbol", "interval"],
      _count: { _all: true },
      _max: { at: true },
    }),
    prisma.whalePosition.count(),
    prisma.whalePosition.findFirst({ orderBy: { at: "desc" }, select: { at: true } }),
  ]);

  // 잡별로 가장 최근 실행 + 연속 실패 횟수.
  const byJob = new Map<string, JobHealth>();
  for (const run of runs) {
    const seen = byJob.get(run.job);
    if (!seen) {
      byJob.set(run.job, {
        job: run.job,
        ok: run.ok,
        finishedAt: run.finishedAt,
        rows: run.rows,
        error: run.error,
        consecutiveFailures: run.ok ? 0 : 1,
      });
      continue;
    }
    // 최근 것부터 오므로, 성공을 만나기 전까지만 연속 실패를 센다.
    if (!seen.ok && !run.ok && seen.consecutiveFailures > 0) {
      seen.consecutiveFailures += 1;
    }
  }

  return {
    feed: feedStatus(
      prices.map((p) => ({ symbol: p.symbol, fetchedAt: p.fetchedAt })),
      now,
      STALE_AFTER_MS
    ),
    jobs: [...byJob.values()].sort((a, b) => a.job.localeCompare(b.job)),
    gaps: gaps.map((g) => ({
      symbol: g.symbol,
      interval: g.interval,
      intervals: g._count._all,
      missing: g._sum.missing ?? 0,
    })),
    candles: candleGroups
      .map((c) => ({
        symbol: c.symbol,
        interval: c.interval,
        count: c._count._all,
        last: c._max.at,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.interval.localeCompare(b.interval)),
    whale: { positions: whaleCount, lastAt: whaleLast?.at ?? null },
  };
}
