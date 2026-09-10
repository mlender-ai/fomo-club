/**
 * 전략 저장 — **검증을 통과한 정의만 DB 에 들어간다.**
 *
 * LAB-02 완료확인 4 는 "`stop_pct` 없으면 **저장이** 거부된다" 다. 검증 함수가
 * 어딘가 있는 것만으로는 그 조건이 충족되지 않는다 — 저장 경로가 검증을 지나야 한다.
 * 그래서 `prisma.strategy.create` 를 직접 부르는 대신 **이 함수를 부른다.**
 *
 * `LAB-06`(전략 정의 + 초기 3종)이 이 문을 쓴다.
 *
 * 규칙 하나 더: **정의가 바뀌면 새 행을 만든다**(PART A-1). `updateDefinition` 이
 * 없는 이유다 — 버전을 올린 새 행을 만드는 `reviseStrategy` 만 있다.
 */
import type { Market, Prisma, Strategy } from "@prisma/client";
import { assertStrategyDefinition, type StrategyDefinition } from "@fomo/lab";

import { prisma } from "../prisma";

const MARKET_OF: Record<StrategyDefinition["market"], Market> = {
  crypto: "CRYPTO",
  stock: "STOCK",
  polymarket: "POLYMARKET",
};

export interface CreateStrategyInput {
  name: string;
  /** 검증되지 않은 입력. 통과하지 못하면 던진다. */
  definition: unknown;
}

/**
 * 새 전략을 만든다. 정의가 스키마를 통과하지 못하면 **던지고 아무것도 쓰지 않는다.**
 *
 * `market` 은 정의에서 읽는다 — 같은 사실을 두 곳에 적으면 갈라진다.
 */
export async function createStrategy(input: CreateStrategyInput): Promise<Strategy> {
  const definition = assertStrategyDefinition(input.definition);
  return prisma.strategy.create({
    data: {
      name: input.name,
      version: 1,
      market: MARKET_OF[definition.market],
      definition: definition as unknown as Prisma.InputJsonValue,
      status: "DRAFT",
    },
  });
}

/**
 * 규칙을 바꾼다 = **새 행을 만든다.** 기존 행을 수정하지 않는다(PART A-1).
 *
 * 옛 행을 고치면 그 행을 참조하는 `Run` 의 결과가 "어떤 규칙으로 낸 숫자인지"
 * 알 수 없게 된다. 그러면 백테스트 결과 전부가 못 믿을 것이 된다.
 */
export async function reviseStrategy(input: CreateStrategyInput): Promise<Strategy> {
  const definition = assertStrategyDefinition(input.definition);
  const latest = await prisma.strategy.findFirst({
    where: { name: input.name },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return prisma.strategy.create({
    data: {
      name: input.name,
      version: (latest?.version ?? 0) + 1,
      market: MARKET_OF[definition.market],
      definition: definition as unknown as Prisma.InputJsonValue,
      status: "DRAFT",
    },
  });
}

/**
 * 전략을 끈다. **`stopReason` 이 필수다** — 종료 전략도 표에 남는데(LAB-00 §7)
 * 왜 껐는지가 비어 있으면 그 행이 거짓말을 한다.
 */
export async function stopStrategy(id: string, stopReason: string): Promise<Strategy> {
  const reason = stopReason.trim();
  if (reason === "") {
    throw new Error("stopReason 이 비었다. 왜 껐는지 없이 끄지 않는다(LAB-00 §7).");
  }
  return prisma.strategy.update({
    where: { id },
    data: { status: "STOPPED", stoppedAt: new Date(), stopReason: reason },
  });
}
