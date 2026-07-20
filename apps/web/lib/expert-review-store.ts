import type { Daily30Response } from "./daily-30";
import { readFeedContent, readFeedContentByPrefix, writeFeedContent } from "./feed-content-store";

const ACTIVE_ID = "expert-committee:active";
const RUN_PREFIX = "expert-committee:run:";
const SNAPSHOT_PREFIX = "expert-committee:snapshot:";

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

/** 날짜별 최종 위원회 발행본. M1 원장 도입 전의 실제 발행 이력도 보존한다. */
export async function readPublishedCommitteeSnapshotHistory(
  limit = 30
): Promise<PublishedCommitteeSnapshot[]> {
  const rows = await readFeedContentByPrefix<PublishedCommitteeSnapshot>(
    SNAPSHOT_PREFIX,
    Math.max(1, Math.min(limit * 3, 50))
  );
  const byDate = new Map<string, PublishedCommitteeSnapshot>();
  for (const { row } of rows) {
    const date = row?.report?.date || row?.response?.asOf || row?.reviewedAt?.slice(0, 10);
    if (!date || row.report?.status !== "published" || !row.response) continue;
    const current = byDate.get(date);
    if (!current || Date.parse(row.reviewedAt) > Date.parse(current.reviewedAt)) {
      byDate.set(date, row);
    }
  }
  return [...byDate.values()]
    .sort(
      (a, b) =>
        b.report.date.localeCompare(a.report.date) ||
        Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt)
    )
    .slice(0, Math.max(1, Math.min(limit, 30)));
}

function snapshotAgeDays(snapshot: PublishedCommitteeSnapshot, today: string): number {
  const snapshotDate = snapshot.report.date || snapshot.reviewedAt.slice(0, 10);
  const todayMs = Date.parse(`${today}T00:00:00.000Z`);
  const snapshotMs = Date.parse(`${snapshotDate}T00:00:00.000Z`);
  if (!Number.isFinite(todayMs) || !Number.isFinite(snapshotMs)) return Number.POSITIVE_INFINITY;
  return Math.floor((todayMs - snapshotMs) / 86_400_000);
}

/**
 * 활성 포인터와 날짜별 발행 이력을 함께 조회한다. 오늘 날짜 캐시 키와 무관하게
 * 최근 승인본을 찾기 때문에 위원회가 하루 실패해도 전일 덱을 계속 서빙할 수 있다.
 */
export async function readRecentPublishedCommitteeSnapshot(
  today: string,
  maxAgeDays = 3
): Promise<PublishedCommitteeSnapshot | null> {
  const [active, history] = await Promise.all([
    readPublishedCommitteeSnapshot().catch(() => null),
    readFeedContentByPrefix<PublishedCommitteeSnapshot>(SNAPSHOT_PREFIX, 10).catch(
      () => [] as Array<{ id: string; row: PublishedCommitteeSnapshot }>
    ),
  ]);
  const candidates = [active, ...history.map((entry) => entry.row)].filter(
    (snapshot): snapshot is PublishedCommitteeSnapshot =>
      !!snapshot?.response &&
      Math.max(snapshot.response.cards?.length ?? 0, snapshot.response.stocks?.length ?? 0) >= 20 &&
      snapshotAgeDays(snapshot, today) >= 0 &&
      snapshotAgeDays(snapshot, today) <= maxAgeDays
  );
  const byRunId = new Map(candidates.map((snapshot) => [snapshot.runId, snapshot]));
  return (
    [...byRunId.values()].sort(
      (a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt)
    )[0] ?? null
  );
}

export async function publishCommitteeSnapshot(
  snapshot: PublishedCommitteeSnapshot,
  report: CommitteeRunReport
): Promise<void> {
  // 이력부터 남기고 활성 포인터를 마지막에 교체한다. 중간 실패 시 전일 활성본이 그대로 유지된다.
  await writeFeedContent(`${RUN_PREFIX}${report.date}:${report.runId}`, report);
  await writeFeedContent(`${SNAPSHOT_PREFIX}${report.date}:${report.runId}`, snapshot);
  await writeFeedContent(ACTIVE_ID, snapshot);
}

export async function writeFailedCommitteeRun(report: CommitteeRunReport): Promise<void> {
  await writeFeedContent(`${RUN_PREFIX}${report.date}:${report.runId}`, report);
}

export async function readCommitteeRunReports(limit = 14): Promise<CommitteeRunReport[]> {
  const rows = await readFeedContentByPrefix<CommitteeRunReport>(RUN_PREFIX, limit);
  return rows.map((entry) => entry.row);
}
