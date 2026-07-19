import { describe, expect, it } from "vitest";
import { companyScoreBandStats, type CompanyScorePerformanceRow } from "../lib/companyScorePerformance";

const DAY = 86_400_000;

describe("company score performance bands", () => {
  it("uses only honest 30-day observations and keeps losses in the denominator", () => {
    const now = Date.UTC(2026, 6, 19);
    const row = (score: number, returnPct: number, ageDays: number): CompanyScorePerformanceRow => ({
      item: { stock: `${score}-${returnPct}`, firstSeenAt: now - ageDays * DAY, companyScore: score },
      returnPct,
    });
    const stats = companyScoreBandStats(
      [row(85, 12, 31), row(82, -4, 45), row(74, 3, 35), row(58, -2, 32), row(91, 20, 12)],
      now
    );
    expect(stats).toEqual([
      { label: "80점 이상", count: 2, winRate: 50 },
      { label: "60–79점", count: 1, winRate: 100 },
      { label: "60점 미만", count: 1, winRate: 0 },
    ]);
  });
});
