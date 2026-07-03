import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({ prisma: { $executeRaw: vi.fn(), $queryRaw: vi.fn().mockResolvedValue([]) } }));

const { safeInternals } = await (async () => {
  const mod = await import("../../lib/feed-briefing");
  return { safeInternals: mod };
})();

// 내부 함수는 export 안 됐으므로 공개 계약으로 검증 — 카드 빌더의 안전판이 핵심.
describe("feed-briefing 안전판", () => {
  it("모듈이 로드되고 read 경로는 캐시 실패 시 빈 컨텐츠(fail-open)", async () => {
    const content = await safeInternals.readTodayFeedContent();
    expect(content.cards).toEqual([]);
    expect(content.pinnedIds.size).toBe(0);
  });
});
