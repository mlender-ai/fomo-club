/**
 * LAB-03 PART B — 실시간 시세.
 *
 * **최신 가격만 저장한다.** 시계열은 `Candle` 이 진다(PART B-1).
 *
 *   npm run lab:latest
 */
import { Prisma, PrismaClient } from "@prisma/client";

import { BINANCE_PAIR, SOURCE_PRICE, SYMBOLS } from "./collect/config";
import { fetchBinancePrices } from "./collect/sources";
import { finish, runJob, type JobResult } from "./collect/job";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const outcome = await runJob(prisma, "latest-price", async (): Promise<JobResult> => {
    const pairs = SYMBOLS.map((s) => BINANCE_PAIR[s]);
    const prices = await fetchBinancePrices(pairs);
    const detail: Record<string, unknown> = {};

    for (const symbol of SYMBOLS) {
      const point = prices.get(BINANCE_PAIR[symbol]);
      if (!point) throw new Error(`${symbol}: 가격이 안 왔다`);
      // `fetchedAt` 을 **반드시 여기서 찍는다.** `@default(now())` 는 생성 때만 걸려서
      // update 절에서 빼면 첫 삽입 시각에 멈춘다 — 그러면 수집이 멀쩡히 도는데도
      // 영원히 stale 이 되고 페이퍼 실행기가 진입을 영구히 거부한다.
      const fetchedAt = new Date();
      await prisma.latestPrice.upsert({
        where: { symbol },
        create: {
          symbol,
          price: new Prisma.Decimal(point.price),
          at: point.at,
          fetchedAt,
          source: SOURCE_PRICE,
        },
        update: {
          price: new Prisma.Decimal(point.price),
          at: point.at,
          fetchedAt,
          source: SOURCE_PRICE,
        },
      });
      detail[symbol] = point.price;
    }

    return { rows: SYMBOLS.length, detail };
  });
  await finish(prisma, outcome);
}

void main();
