import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    judgmentLedger: {
      findMany: vi.fn(),
    },
  },
}));

import { readSubjectTimeline } from "../../lib/judgment-ledger";
import { prisma } from "../../lib/prisma";

const findMany = vi.mocked(prisma.judgmentLedger.findMany);

describe("readSubjectTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("사용자 범위 조회가 실패해도 공개 판단 기록을 반환한다", async () => {
    findMany
      .mockResolvedValueOnce([{
        id: "public-score",
        date: "2026-07-20",
        ts: new Date("2026-07-20T00:00:00.000Z"),
        canonical: "클라우드플레어",
        symbol: "NET",
        asset: "us-stock",
        kind: "score",
        actor: "committee",
        payload: { score: 59, label: "매집 추정 3주차" },
        priceAt: { toNumber: () => 277.66 },
      }] as never)
      .mockRejectedValueOnce(new Error("user actor lookup failed"));

    const entries = await readSubjectTimeline("클라우드플레어", 80, ["user:anonymous"]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "public-score",
      kind: "score",
      actor: "committee",
      priceAt: 277.66,
      payload: { score: 59 },
    });
    expect(findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { canonical: "클라우드플레어", actor: { in: ["engine", "committee", "backfill"] } },
    }));
    expect(findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { canonical: "클라우드플레어", actor: "user:anonymous" },
    }));
  });
});
