import type { Daily30Response } from "./daily-30";
import { readFeedContent, readFeedContentByPrefix, writeFeedContent } from "./feed-content-store";

const ACTIVE_ID = "expert-committee:active";
const RUN_PREFIX = "expert-committee:run:";

export type CommitteeRunStatus = "published" | "failed";

export interface CommitteeReviewAudit {
  candidateId: string;
  canonical: string;
  approved: boolean;
  timingGrade: "A" | "B" | "C";
  valuationGrade: "A" | "B" | "C";
  tradingView: string;
  fundamentalView: string;
  rejectionReasons: string[];
  factGate: {
    tradingFallback: boolean;
    financialFallback: boolean;
    invalidNumbers: string[];
  };
}

export interface CommitteeRunReport {
  runId: string;
  version: string;
  date: string;
  status: CommitteeRunStatus;
  startedAt: string;
  completedAt: string;
  model: string;
  callCount: number;
  candidateCount: number;
  selectedCount: number;
  selectedIds: string[];
  reviews: CommitteeReviewAudit[];
  compositionSummary: string;
  assetCounts: Record<string, number>;
  error?: string;
  previousRunRetained?: boolean;
}

export interface PublishedCommitteeSnapshot {
  runId: string;
  version: string;
  reviewedAt: string;
  response: Daily30Response;
  report: Omit<CommitteeRunReport, "reviews">;
}

export async function readPublishedCommitteeSnapshot(): Promise<PublishedCommitteeSnapshot | null> {
  return readFeedContent<PublishedCommitteeSnapshot>(ACTIVE_ID);
}

export async function publishCommitteeSnapshot(
  snapshot: PublishedCommitteeSnapshot,
  report: CommitteeRunReport
): Promise<void> {
  // 이력부터 남기고 활성 포인터를 마지막에 교체한다. 중간 실패 시 전일 활성본이 그대로 유지된다.
  await writeFeedContent(`${RUN_PREFIX}${report.date}:${report.runId}`, report);
  await writeFeedContent(ACTIVE_ID, snapshot);
}

export async function writeFailedCommitteeRun(report: CommitteeRunReport): Promise<void> {
  await writeFeedContent(`${RUN_PREFIX}${report.date}:${report.runId}`, report);
}

export async function readCommitteeRunReports(limit = 14): Promise<CommitteeRunReport[]> {
  const rows = await readFeedContentByPrefix<CommitteeRunReport>(RUN_PREFIX, limit);
  return rows.map((entry) => entry.row);
}
