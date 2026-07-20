import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (factory: () => unknown) => factory,
}));

import {
  resolveDaily30Response,
  type Daily30Response,
} from "../../lib/daily-30";
import type { PublishedCommitteeSnapshot } from "../../lib/expert-review-store";

function response(count = 30): Daily30Response {
  const stocks = Array.from({ length: count }, (_, index) => ({
    canonical: `종목${index}`,
    country: "KR" as const,
    market: "KOSPI",
    sector: "기타 업종",
  }));
  return {
    asOf: "2026-07-20T00:00:00.000Z",
    country: "all",
    stocks,
    cards: stocks,
    fronts: {},
    confidence: "M",
    source: "test",
    meta: {
      targetCount: 30,
      cards: [],
      assetCounts: { "kr-stock": count, "us-stock": 0, coin: 0, macro: 0 },
    },
  } as unknown as Daily30Response;
}

function snapshot(date: string, count = 30): PublishedCommitteeSnapshot {
  return {
    runId: `run-${date}`,
    version: "committee-v1",
    reviewedAt: `${date}T01:00:00.000Z`,
    response: response(count),
    report: {
      runId: `run-${date}`,
      version: "committee-v1",
      date,
      status: "published",
      startedAt: `${date}T00:00:00.000Z`,
      completedAt: `${date}T01:00:00.000Z`,
      model: "test",
      callCount: 3,
      candidateCount: 50,
      selectedCount: count,
      selectedIds: [],
      compositionSummary: "test",
      assetCounts: {},
    },
  };
}

describe("daily-30 availability fallback", () => {
  it("오늘 위원회 발행분을 정상 경로로 반환한다", async () => {
    const current = snapshot("2026-07-20");
    const result = await resolveDaily30Response({
      today: "2026-07-20",
      readToday: vi.fn().mockResolvedValue(current),
      readRecent: vi.fn(),
      buildDirect: vi.fn(),
    });
    expect(result).toBe(current.response);
    expect(result.meta.stale).toBeUndefined();
  });

  it("오늘 엔진 원장 투영본을 위원회 승인본으로 오인하지 않는다", async () => {
    const engineProjection = response(24);
    const direct = response(30);
    const result = await resolveDaily30Response({
      today: "2026-07-20",
      readToday: vi.fn().mockResolvedValue(engineProjection),
      readRecent: vi.fn().mockResolvedValue(null),
      buildDirect: vi.fn().mockResolvedValue(direct),
    });
    expect(result.meta.stale).toBe("engine-direct");
    expect(result.stocks).toHaveLength(30);
  });

  it("오늘 발행 실패 시 최근 3일 승인본을 stale 표시와 함께 반환한다", async () => {
    const recent = snapshot("2026-07-19");
    const buildDirect = vi.fn();
    const result = await resolveDaily30Response({
      today: "2026-07-20",
      readToday: vi.fn().mockResolvedValue(null),
      readRecent: vi.fn().mockResolvedValue(recent),
      buildDirect,
    });
    expect(result.meta.stale).toBe("committee-yesterday");
    expect(buildDirect).not.toHaveBeenCalled();
  });

  it("승인 스냅샷도 없으면 엔진 직생성 결과를 반환한다", async () => {
    const direct = response();
    const result = await resolveDaily30Response({
      today: "2026-07-20",
      readToday: vi.fn().mockResolvedValue(null),
      readRecent: vi.fn().mockResolvedValue(null),
      buildDirect: vi.fn().mockResolvedValue(direct),
    });
    expect(result.meta.stale).toBe("engine-direct");
    expect(result.stocks).toHaveLength(30);
  });

  it("세 경로가 모두 20장 미만일 때만 실패한다", async () => {
    await expect(
      resolveDaily30Response({
        today: "2026-07-20",
        readToday: vi.fn().mockResolvedValue(snapshot("2026-07-20", 3)),
        readRecent: vi.fn().mockResolvedValue(snapshot("2026-07-19", 10)),
        buildDirect: vi.fn().mockResolvedValue(response(19)),
      })
    ).rejects.toThrow("engine produced 19/20");
  });
});
