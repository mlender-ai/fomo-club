import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeFeedContent } = vi.hoisted(() => ({ writeFeedContent: vi.fn() }));

vi.mock("../../lib/feed-content-store", () => ({
  readFeedContent: vi.fn(),
  readFeedContentByPrefix: vi.fn(),
  writeFeedContent,
}));

import { publishCommitteeSnapshot, writeFailedCommitteeRun, type CommitteeRunReport } from "../../lib/expert-review-store";

const report: CommitteeRunReport = {
  runId: "run-1",
  version: "committee-v1",
  date: "2026-07-19",
  status: "failed",
  startedAt: "2026-07-19T00:00:00.000Z",
  completedAt: "2026-07-19T00:01:00.000Z",
  model: "test-model",
  callCount: 1,
  candidateCount: 50,
  selectedCount: 0,
  selectedIds: [],
  reviews: [],
  compositionSummary: "직전 승인본 유지",
  assetCounts: {},
  previousRunRetained: true,
};

describe("expert committee publication ordering", () => {
  beforeEach(() => writeFeedContent.mockReset());

  it("실패 실행은 이력만 쓰고 활성 승인본을 교체하지 않는다", async () => {
    await writeFailedCommitteeRun(report);
    expect(writeFeedContent).toHaveBeenCalledTimes(1);
    expect(writeFeedContent.mock.calls[0]?.[0]).toContain("expert-committee:run:");
    expect(writeFeedContent.mock.calls.some((call) => call[0] === "expert-committee:active")).toBe(false);
  });

  it("성공 실행은 이력을 먼저 저장한 뒤 활성 승인본을 교체한다", async () => {
    const published = { ...report, status: "published" as const, selectedCount: 30 };
    const snapshot = {
      runId: "run-1",
      version: "committee-v1",
      reviewedAt: report.completedAt,
      response: {} as never,
      report: published,
    };
    await publishCommitteeSnapshot(snapshot, published);
    expect(writeFeedContent.mock.calls.map((call) => call[0])).toEqual([
      "expert-committee:run:2026-07-19:run-1",
      "expert-committee:active",
    ]);
  });
});
