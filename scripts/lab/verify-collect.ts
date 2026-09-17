/**
 * LAB-03 완료확인 3·4·5·6 — 수집이 지켜야 할 것을 DB 앞에서 확인한다.
 *
 * 단위 테스트는 순수 함수를 본다(`packages/lab`). 여기서 보는 것은 **DB 와 만나야
 * 드러나는 것**이다:
 *
 *   1. 재수집해도 봉이 중복되지 않는다 (유니크가 실제로 건다)
 *   2. 시각이 UTC 주기 경계에 맞는다 (로컬 기준 저장 금지)
 *   3. 구멍이 `DataGap` 에 **기록**되고 **메워지지 않는다**
 *   4. **`LatestPrice.fetchedAt` 이 재수집 때 전진한다**
 *
 * 4번은 실제로 났던 결함이다. `fetchedAt` 에 `@default(now())` 만 두고 upsert 의
 * update 절에서 빼면 첫 삽입 시각에 멈춘다. 수집은 멀쩡히 도는데 화면과 실행기는
 * 영원히 stale 을 본다 — **페이퍼 실행기가 진입을 영구히 거부한다.**
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/lab/verify-collect.ts
 */
import { execFileSync } from "node:child_process";
import { Prisma, PrismaClient } from "@prisma/client";
import { INTERVAL_MS, inspectCandles, type Interval } from "@fomo/lab";

const prisma = new PrismaClient();

const checks: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function run(script: string, args: string[] = []): void {
  execFileSync("npx", ["tsx", script, ...args], { encoding: "utf8", env: process.env });
}

async function main(): Promise<void> {
  const before = await prisma.candle.count();
  if (before === 0) {
    console.error("봉이 없다. 먼저 `npm run lab:candles -- --backfill` 을 돌려라.");
    process.exit(1);
  }

  console.log("1. 재수집 — 중복이 생기나");
  run("scripts/lab/collect-candles.ts");
  const after = await prisma.candle.count();
  check(
    "재수집해도 봉 수가 늘지 않는다(새 봉 제외)",
    after - before <= 6,
    `${before} → ${after}`
  );

  const dupes = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM (
      SELECT symbol, interval, at FROM "Candle" GROUP BY 1,2,3 HAVING count(*) > 1
    ) t`;
  check("같은 (종목·주기·시각) 이 둘인 봉이 없다", Number(dupes[0]?.n ?? 0) === 0);

  console.log("\n2. 시각이 UTC 경계에 맞나");
  const groups = await prisma.candle.groupBy({ by: ["symbol", "interval"] });
  let misaligned = 0;
  let totalMissing = 0;
  for (const group of groups) {
    const rows = await prisma.candle.findMany({
      where: { symbol: group.symbol, interval: group.interval },
      orderBy: { at: "asc" },
      select: { at: true, open: true, high: true, low: true, close: true, volume: true },
    });
    const report = inspectCandles(
      group.symbol,
      group.interval as Interval,
      rows.map((r) => ({
        at: r.at,
        open: r.open.toNumber(),
        high: r.high.toNumber(),
        low: r.low.toNumber(),
        close: r.close.toNumber(),
        volume: r.volume.toNumber(),
      }))
    );
    misaligned += report.misaligned.length;
    totalMissing += report.missing;
  }
  check("주기 경계에서 벗어난 봉이 없다", misaligned === 0, `${misaligned}개`);

  console.log("\n3. 구멍을 기록하고 메우지 않나");
  const symbol = groups[0]?.symbol ?? "BTC";
  const interval = (groups[0]?.interval ?? "H1") as Interval;
  // 가운데 봉 하나를 지워 인위적으로 구멍을 만든다.
  const sample = await prisma.candle.findMany({
    where: { symbol, interval },
    orderBy: { at: "asc" },
    skip: 100,
    take: 1,
    select: { id: true, at: true },
  });
  const victim = sample[0];
  if (!victim) throw new Error("구멍을 낼 봉을 못 찾았다");

  await prisma.candle.delete({ where: { id: victim.id } });
  run("scripts/lab/collect-candles.ts", ["--symbol", symbol, "--interval", interval]);

  const gap = await prisma.dataGap.findFirst({
    where: { symbol, interval, fromAt: victim.at },
  });
  check("구멍이 DataGap 에 기록된다", gap !== null, gap ? `${gap.missing}개 빠짐` : "기록 없음");

  const refilled = await prisma.candle.findFirst({ where: { symbol, interval, at: victim.at } });
  check(
    "증분 수집이 과거 구멍을 메우지 않는다",
    refilled === null,
    refilled ? "메워졌다" : "비어 있다"
  );

  // 뒷정리 — 지운 봉을 되돌리고 인위적 구멍 기록을 지운다.
  const neighbour = await prisma.candle.findFirst({
    where: { symbol, interval, at: new Date(victim.at.getTime() - INTERVAL_MS[interval]) },
  });
  if (neighbour) {
    await prisma.candle.create({
      data: {
        symbol,
        interval,
        at: victim.at,
        open: neighbour.close,
        high: neighbour.close,
        low: neighbour.close,
        close: neighbour.close,
        volume: new Prisma.Decimal(0),
        source: "verify-restore",
      },
    });
  }
  if (gap) await prisma.dataGap.delete({ where: { id: gap.id } });

  console.log("\n4. 실시간 시세 — fetchedAt 이 전진하나");
  run("scripts/lab/collect-latest.ts");
  const first = await prisma.latestPrice.findMany({ select: { symbol: true, fetchedAt: true } });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  run("scripts/lab/collect-latest.ts");
  const second = await prisma.latestPrice.findMany({ select: { symbol: true, fetchedAt: true } });

  const advanced = second.every((row) => {
    const prev = first.find((f) => f.symbol === row.symbol);
    return prev ? row.fetchedAt.getTime() > prev.fetchedAt.getTime() : false;
  });
  check("재수집하면 fetchedAt 이 전진한다", advanced && second.length > 0);

  console.log(`\n(참고) 전체 구멍 ${totalMissing}개 — 메우지 않는다`);

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
