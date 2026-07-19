import { daysSince, type DiscoverySeenItem } from "./discoveryPerformance";

export interface CompanyScorePerformanceRow {
  item: DiscoverySeenItem;
  returnPct?: number;
}

export interface ScoreBandStat {
  label: string;
  count: number;
  winRate: number | null;
}

export function companyScoreBandStats(
  rows: readonly CompanyScorePerformanceRow[],
  nowMs = Date.now()
): ScoreBandStat[] {
  const eligible = rows.filter(
    (row) =>
      daysSince(row.item.firstSeenAt, nowMs) >= 30 &&
      typeof row.item.companyScore === "number" &&
      typeof row.returnPct === "number"
  );
  return [
    { label: "80점 이상", min: 80, max: 101 },
    { label: "60–79점", min: 60, max: 80 },
    { label: "60점 미만", min: 0, max: 60 },
  ].map((band) => {
    const matches = eligible.filter((row) => row.item.companyScore! >= band.min && row.item.companyScore! < band.max);
    return {
      label: band.label,
      count: matches.length,
      winRate: matches.length > 0 ? Math.round((matches.filter((row) => row.returnPct! > 0).length / matches.length) * 100) : null,
    };
  });
}
