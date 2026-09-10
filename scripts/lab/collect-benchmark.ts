/**
 * LAB-02 PART D — 벤치마크 시세 적재.
 *
 * **벤치마크를 항상 옆에 둔다**(LAB-00 §7). +30% 가 좋은지 나쁜지 이것 없이는 모른다.
 *
 * ## 소스
 *
 * Binance 공개 klines(키 없음). 이건 **벤치마크 가격 소스**이고
 * LAB-00 §9 의 "거래소" 결정이 아니다 — 그건 `LAB-03` 전에 정한다.
 *
 * ## 구멍을 메우지 않는다 (LAB-00 §7)
 *
 * 받은 봉만 넣는다. 빠진 날을 앞뒤 값으로 채우지 않는다. 화면이 끊긴 선을
 * 보여주는 게 맞다 — 이어붙인 선은 거짓이다.
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/lab/collect-benchmark.ts [--symbol BTC] [--days 1000]
 */
import { Prisma, PrismaClient } from "@prisma/client";

/** 랩 심볼 → 소스 심볼. 주식 벤치마크(KOSPI·SPY)는 `LAB-09` 에서 붙인다. */
const SOURCE: Record<string, { kind: "binance"; pair: string }> = {
  BTC: { kind: "binance", pair: "BTCUSDT" },
  ETH: { kind: "binance", pair: "ETHUSDT" },
};

/** Binance klines 한 번 호출 상한. */
const PAGE = 1000;

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

interface Point {
  at: Date;
  price: Prisma.Decimal;
}

/**
 * 일봉 종가를 오래된 것 → 최신 순으로 가져온다.
 * 응답 모양이 예상과 다르면 **던진다** — 조용히 빈 배열을 돌려주면
 * "수집했는데 0건" 과 "소스가 바뀌었다" 를 구분할 수 없다.
 */
async function fetchBinanceDaily(pair: string, days: number): Promise<Point[]> {
  const points: Point[] = [];
  let endTime = Date.now();

  while (points.length < days) {
    const limit = Math.min(PAGE, days - points.length);
    const url =
      `https://api.binance.com/api/v3/klines?symbol=${pair}` +
      `&interval=1d&limit=${limit}&endTime=${endTime}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`binance ${pair} ${response.status}: ${await response.text()}`);
    }
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error(`binance ${pair}: 배열이 아니다`);
    if (rows.length === 0) break;

    const page: Point[] = rows.map((row) => {
      if (!Array.isArray(row) || typeof row[0] !== "number" || typeof row[4] !== "string") {
        throw new Error(`binance ${pair}: 봉 모양이 예상과 다르다 — ${JSON.stringify(row).slice(0, 120)}`);
      }
      return { at: new Date(row[0]), price: new Prisma.Decimal(row[4]) };
    });

    points.unshift(...page);
    const oldest = page[0];
    if (!oldest) break;
    endTime = oldest.at.getTime() - 1;
    if (page.length < limit) break;
  }

  return points;
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const symbol = arg("symbol", "BTC").toUpperCase();
  const days = Number(arg("days", "1000"));
  const source = SOURCE[symbol];
  if (!source) {
    console.error(`모르는 벤치마크 심볼: ${symbol}. 아는 것: ${Object.keys(SOURCE).join(", ")}`);
    process.exit(1);
  }
  if (!Number.isInteger(days) || days < 1) {
    console.error("--days 는 1 이상의 정수여야 한다");
    process.exit(1);
  }

  console.log(`${symbol} ← binance ${source.pair} 일봉 ${days}개 요청`);
  const points = await fetchBinanceDaily(source.pair, days);
  if (points.length === 0) {
    console.error("소스가 0건을 돌려줬다. 넣을 것이 없다.");
    process.exit(1);
  }

  const first = points[0];
  const last = points[points.length - 1];
  console.log(
    `받음 ${points.length}건: ${first?.at.toISOString().slice(0, 10)} ~ ` +
      `${last?.at.toISOString().slice(0, 10)}`
  );

  // 같은 (symbol, at) 은 한 점뿐이다. 재실행은 갱신한다.
  let written = 0;
  for (let i = 0; i < points.length; i += 500) {
    const chunk = points.slice(i, i + 500);
    const result = await prisma.benchmark.createMany({
      data: chunk.map((p) => ({ symbol, at: p.at, price: p.price })),
      skipDuplicates: true,
    });
    written += result.count;
  }

  const total = await prisma.benchmark.count({ where: { symbol } });
  const range = await prisma.benchmark.aggregate({
    where: { symbol },
    _min: { at: true },
    _max: { at: true },
  });
  console.log(
    `신규 ${written}건 · ${symbol} 총 ${total}건 ` +
      `(${range._min.at?.toISOString().slice(0, 10)} ~ ${range._max.at?.toISOString().slice(0, 10)})`
  );

  // 구멍을 보고한다. 메우지는 않는다.
  const gaps = await prisma.$queryRaw<{ gap_days: number; count: bigint }[]>`
    SELECT diff AS gap_days, count(*)::bigint AS count FROM (
      SELECT EXTRACT(DAY FROM (at - lag(at) OVER (ORDER BY at)))::int AS diff
        FROM "Benchmark" WHERE symbol = ${symbol}
    ) t WHERE diff > 1 GROUP BY diff ORDER BY diff
  `;
  if (gaps.length === 0) {
    console.log("빠진 날 없음");
  } else {
    console.log("빠진 구간 (메우지 않는다 — LAB-00 §7):");
    for (const gap of gaps) console.log(`  ${gap.gap_days}일 간격 × ${Number(gap.count)}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
