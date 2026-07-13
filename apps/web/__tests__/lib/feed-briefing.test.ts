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

// WO-21 Phase 1 — 장중 급변 펄스(결정론) 합성.
describe("composeKrMarketPulse (장중 급변 카드)", () => {
  const base = {
    date: "2026-07-13",
    timeLabel: "10:30",
    movers: [
      { name: "한화에어로스페이스", changePct: 4.2 },
      { name: "금호타이어", changePct: -8.2 },
    ],
  };

  it("코스피 -8.95% → 급락 카드, 최상단 고정, 시점 명시", () => {
    const row = safeInternals.composeKrMarketPulse({
      ...base,
      indices: [
        { key: "kospi", label: "코스피", changePct: -8.95 },
        { key: "kosdaq", label: "코스닥", changePct: -4.55 },
      ],
      eventHeadline: "이란 전쟁 격화에 코스피 폭락",
    });
    expect(row).not.toBeNull();
    expect(row!.pinned).toBe(true);
    expect(row!.card.headline).toContain("급락");
    expect(row!.card.headline).toContain("10:30");
    expect(row!.card.facts.map((f) => f.value)).toContain("-8.95%");
    expect(row!.card.note).toContain("이란 전쟁");
    // 금지 문형 없음(판단·조언·위로 금지)
    expect(`${row!.card.headline} ${row!.card.note}`).not.toMatch(/사세요|파세요|매수|매도|반등|저가 매수|기회/);
  });

  it("임계 미달(코스피 ±2%·코스닥 ±2.5% 미만) → null(억지 생성 금지)", () => {
    const row = safeInternals.composeKrMarketPulse({
      ...base,
      indices: [
        { key: "kospi", label: "코스피", changePct: 1.4 },
        { key: "kosdaq", label: "코스닥", changePct: -2.1 },
      ],
    });
    expect(row).toBeNull();
  });

  it("코스닥 단독 급등(+2.5%↑)도 발화", () => {
    const row = safeInternals.composeKrMarketPulse({
      ...base,
      indices: [
        { key: "kospi", label: "코스피", changePct: 0.8 },
        { key: "kosdaq", label: "코스닥", changePct: 3.1 },
      ],
    });
    expect(row?.card.headline).toContain("코스닥");
    expect(row?.card.headline).toContain("급등");
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
