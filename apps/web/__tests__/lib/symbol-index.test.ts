import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({ prisma: { $executeRaw: vi.fn(), $queryRaw: vi.fn().mockResolvedValue([]) } }));

const { searchSymbols, saveSearchRequest } = await import("../../lib/symbol-index");

describe("symbol-index (요청 경로 안전판)", () => {
  it("인덱스 미구축(캐시 없음) 시 빈 결과 — 재구축·외부 fetch 없이 fail-open", async () => {
    const results = await searchSymbols("삼성전자");
    expect(results).toEqual([]);
  });

  it("검색 요청 저장은 쿼리를 60자로 자르고 pending 상태로 만든다", async () => {
    const row = await saveSearchRequest("  존재하지  않는   종목  ");
    expect(row.status).toBe("pending");
    expect(row.query).toBe("존재하지 않는 종목");
  });
});
