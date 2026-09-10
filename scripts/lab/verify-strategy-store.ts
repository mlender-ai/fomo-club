/**
 * LAB-02 완료확인 4 — **`stop_pct` 없으면 저장이 거부된다.**
 *
 * 단위 테스트는 검증 *함수* 가 거부하는 것을 보인다. 이 스크립트는
 * **DB 를 앞에 두고** 거부되는 것과 **행이 늘지 않는 것**을 보인다. 둘은 다른 주장이다.
 *
 *   DATABASE_URL=postgresql://... npx tsx scripts/lab/verify-strategy-store.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertStrategyDefinition } from "@fomo/lab";

const prisma = new PrismaClient();

const BASE = {
  market: "crypto",
  universe: { type: "list", symbols: ["BTC"] },
  entry: { all: [{ indicator: "ma_cross", fast: 20, slow: 60, dir: "up" }] },
  exit: { stop_pct: -8, target_pct: null, max_hold_days: 30 },
  sizing: { type: "risk_pct", risk_pct: 2 },
  leverage: 1,
  max_positions: 3,
};

const checks: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * `apps/web/lib/lab/strategy-store.ts` 와 같은 순서다 — 검증이 쓰기보다 먼저다.
 * (스크립트에서 Next 의 `@/lib` 별칭을 끌어오지 않으려고 여기서 같은 순서를 재현한다.)
 */
async function save(name: string, definition: unknown): Promise<void> {
  const parsed = assertStrategyDefinition(definition);
  await prisma.strategy.create({
    data: {
      name,
      version: 1,
      market: parsed.market === "crypto" ? "CRYPTO" : parsed.market === "stock" ? "STOCK" : "POLYMARKET",
      definition: parsed as unknown as object,
      status: "DRAFT",
    },
  });
}

async function main(): Promise<void> {
  const before = await prisma.strategy.count();

  await save("검증-정상", BASE);
  check("정상 정의는 저장된다", (await prisma.strategy.count()) === before + 1);

  const { stop_pct: _drop, ...exitWithoutStop } = BASE.exit;
  let rejected = false;
  try {
    await save("검증-손절없음", { ...BASE, exit: exitWithoutStop });
  } catch (error) {
    rejected = /stop_pct/.test(String(error));
  }
  check("stop_pct 없는 정의는 저장이 거부된다", rejected);
  check(
    "거부된 뒤 행이 늘지 않았다",
    (await prisma.strategy.count()) === before + 1,
    `${await prisma.strategy.count()}행`
  );
  check(
    "거부된 이름으로 아무 행도 안 생겼다",
    (await prisma.strategy.count({ where: { name: "검증-손절없음" } })) === 0
  );

  let positiveRejected = false;
  try {
    await save("검증-양수손절", { ...BASE, exit: { ...BASE.exit, stop_pct: 8 } });
  } catch {
    positiveRejected = true;
  }
  check("양수 stop_pct 도 거부된다", positiveRejected);

  await prisma.strategy.deleteMany({ where: { name: { startsWith: "검증-" } } });

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} 통과`);
  if (failed.length > 0) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
