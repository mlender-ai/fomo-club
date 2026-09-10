import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    judgmentLedger: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

import { appendJudgmentLedger, ledgerContentKey, type LedgerAppendInput } from "../../lib/judgment-ledger";
import { prisma } from "../../lib/prisma";

const findMany = vi.mocked(prisma.judgmentLedger.findMany);
const createMany = vi.mocked(prisma.judgmentLedger.createMany);

/** createMany 에 실제로 넘어간 행들. */
function insertedRows(call = 0): Array<{ idempotencyKey: string; actor: string }> {
  const args = createMany.mock.calls[call]?.[0] as unknown as {
    data: Array<{ idempotencyKey: string; actor: string }>;
  };
  return args.data;
}

/**
 * quiet-pick 크론이 만드는 모양 그대로. `publication.reference_price_as_of` 가 실행 시각이라
 * 같은 날 두 번 구우면 페이로드가 달라진다 — 중복 사고의 실제 경로다(WO-OPS-QP503).
 */
function quietPickEntry(asOf: string): LedgerAppendInput {
  return {
    date: "2026-08-15",
    subject: { asset: "kr-stock", canonical: "삼성전자", symbol: "005930" },
    kind: "selection",
    payload: {
      pickType: "quiet",
      order: 0,
      publication: { reference_price: 71_200, reference_price_as_of: asOf },
    },
    priceAt: 71_200,
    actor: "committee",
    idempotencyKey: "quiet-pick:2026-08-15:kr-stock:005930:selection",
  };
}

describe("appendJudgmentLedger 멱등성", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([] as never);
    createMany.mockResolvedValue({ count: 1 } as never);
  });

  it("selection 은 호출자의 안정 키를 그대로 쓴다 — 페이로드 해시로 덮어쓰지 않는다", async () => {
    await appendJudgmentLedger([quietPickEntry("2026-08-15T21:25:04.000Z")]);

    expect(insertedRows()[0]?.idempotencyKey).toBe("quiet-pick:2026-08-15:kr-stock:005930:selection");
  });

  it("같은 날 재실행에서 발행 스탬프 시각이 달라져도 멱등 키는 그대로다", async () => {
    await appendJudgmentLedger([quietPickEntry("2026-08-15T21:25:04.000Z")]);
    const first = insertedRows()[0]?.idempotencyKey;

    createMany.mockClear();
    await appendJudgmentLedger([quietPickEntry("2026-08-15T22:41:57.000Z")]);

    expect(insertedRows()[0]?.idempotencyKey).toBe(first);
  });

  it("이미 기록된 selection 은 키 방식이 달랐어도 다시 넣지 않는다", async () => {
    // 키 교체 이전에 내용 해시로 기록된 행. 키가 달라 skipDuplicates 로는 못 막는다.
    findMany.mockResolvedValue([
      { date: "2026-08-15", asset: "kr-stock", canonical: "삼성전자", actor: "committee" },
    ] as never);

    const appended = await appendJudgmentLedger([quietPickEntry("2026-08-15T22:41:57.000Z")]);

    expect(appended).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("같은 날·같은 종목이라도 엔진분과 위원회분은 각각 남는다", async () => {
    findMany.mockResolvedValue([
      { date: "2026-08-15", asset: "kr-stock", canonical: "삼성전자", actor: "engine" },
    ] as never);

    await appendJudgmentLedger([quietPickEntry("2026-08-15T21:25:04.000Z")]);

    expect(insertedRows()).toHaveLength(1);
    expect(insertedRows()[0]?.actor).toBe("committee");
  });

  it("ledgerContentKey 는 ts 를 해시하지 않는다 — 날짜만 끌어낸다", () => {
    const base = {
      date: "2026-08-15",
      subject: { asset: "kr-stock" as const, canonical: "삼성전자" },
      kind: "selection" as const,
      payload: { pickType: "quiet" },
    };
    expect(ledgerContentKey({ ...base, ts: new Date("2026-08-15T21:25:04.000Z") })).toBe(
      ledgerContentKey({ ...base, ts: new Date("2026-08-15T22:41:57.000Z") })
    );
  });
});
