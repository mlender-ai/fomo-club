/**
 * 전략 하나를 저장한다. **`LAB-06`(전략 정의 + 초기 3종)이 이걸 대체한다** —
 * 지금은 `LAB-04` 엔진을 실제로 돌려보기 위한 최소 입구다.
 *
 * 저장은 반드시 검증을 지난다(LAB-02 완료확인 4). 여기서도 예외가 아니다.
 *
 *   npm run lab:seed-strategy -- --file strategy.json
 *   npm run lab:seed-strategy -- --demo        # 추세 스윙 (지시서 PART B 예시)
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { assertStrategyDefinition, type DefinitionMarket } from "@fomo/lab";

const prisma = new PrismaClient();

/** LAB-02 PART B 의 예시 정의 그대로. */
const DEMO = {
  name: "추세 스윙",
  definition: {
    market: "crypto",
    universe: { type: "list", symbols: ["BTC"] },
    entry: {
      all: [
        { indicator: "ma_cross", fast: 20, slow: 60, dir: "up" },
        { indicator: "volume_ratio", min: 1.2 },
      ],
    },
    exit: {
      stop_pct: -8,
      target_pct: null,
      max_hold_days: 30,
      any: [{ indicator: "ma_cross", fast: 20, slow: 60, dir: "down" }],
    },
    sizing: { type: "risk_pct", risk_pct: 2 },
    leverage: 1,
    max_positions: 3,
  },
};

const MARKET: Record<DefinitionMarket, "CRYPTO" | "STOCK" | "POLYMARKET"> = {
  crypto: "CRYPTO",
  stock: "STOCK",
  polymarket: "POLYMARKET",
};

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const file = arg("file");
  const source = file
    ? (JSON.parse(readFileSync(file, "utf8")) as { name: string; definition: unknown })
    : DEMO;

  // **검증을 지나야만 저장된다.**
  const definition = assertStrategyDefinition(source.definition);

  const latest = await prisma.strategy.findFirst({
    where: { name: source.name },
    orderBy: { version: "desc" },
    select: { version: true, definition: true, id: true },
  });

  // 같은 정의를 다시 넣으면 버전을 올리지 않는다 — 버전은 **규칙이 바뀔 때** 오른다.
  if (latest && JSON.stringify(latest.definition) === JSON.stringify(definition)) {
    console.log(latest.id);
    return;
  }

  const created = await prisma.strategy.create({
    data: {
      name: source.name,
      version: (latest?.version ?? 0) + 1,
      market: MARKET[definition.market],
      definition: definition as object,
      status: "DRAFT",
    },
  });
  console.log(created.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
