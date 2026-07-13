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

// 2026-07-13 사건 회귀(WO-21) — 전 거래일 데이터가 "오늘의 국장"으로 발행되는 것 차단.
describe("isStaleSession (거래일 가드)", () => {
  it("소스 거래일 ≠ 오늘 → 스테일(발행 차단)", () => {
    expect(safeInternals.isStaleSession("2026-07-10", "2026-07-13")).toBe(true);
  });
  it("소스 거래일 = 오늘 → 통과", () => {
    expect(safeInternals.isStaleSession("2026-07-13", "2026-07-13")).toBe(false);
  });
  it("거래일 미제공/비정형 → 가드 발동 안 함(확인 가능한 불일치만 차단)", () => {
    expect(safeInternals.isStaleSession(undefined, "2026-07-13")).toBe(false);
    expect(safeInternals.isStaleSession("어제", "2026-07-13")).toBe(false);
  });
});
