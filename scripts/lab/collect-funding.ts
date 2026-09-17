/**
 * LAB-03 PART A — 펀딩비. 8시간 주기.
 *
 * 무기한 선물이면 필수다. **빼면 수익률이 부풀려진다** —
 * 보유 기간이 길수록 차이가 커진다.
 *
 *   npm run lab:funding                # 증분
 *   npm run lab:funding -- --backfill  # 3년
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { BACKFILL_YEARS, BINANCE_PERP, SOURCE_FUNDING, SYMBOLS } from "./collect/config";
import { fetchBinanceFunding } from "./collect/sources";
import { finish, runJob, type JobResult } from "./collect/job";

const prisma = new PrismaClient();
const BACKFILL = process.argv.includes("--backfill");

async function main(): Promise<void> {
  const outcome = await runJob(prisma, "funding", async (): Promise<JobResult> => {
    let rows = 0;
    const detail: Record<string, unknown> = {};

    for (const symbol of SYMBOLS) {
      const newest = await prisma.funding.findFirst({
        where: { symbol },
        orderBy: { at: "desc" },
        select: { at: true },
      });
      const from = BACKFILL || !newest
        ? new Date(Date.now() - BACKFILL_YEARS * 365 * 24 * 60 * 60 * 1000)
        : new Date(newest.at.getTime() + 1);

      const points = await fetchBinanceFunding(BINANCE_PERP[symbol], from, new Date());
      for (let i = 0; i < points.length; i += 1000) {
        const result = await prisma.funding.createMany({
          data: points.slice(i, i + 1000).map((p) => ({
            symbol,
            at: p.at,
            rate: new Prisma.Decimal(p.rate),
            source: SOURCE_FUNDING,
          })),
          skipDuplicates: true,
        });
        rows += result.count;
      }
      const total = await prisma.funding.count({ where: { symbol } });
      detail[symbol] = { 신규: points.length, 보유: total };
    }

    return { rows, detail };
  });
  await finish(prisma, outcome);
}

void main();
