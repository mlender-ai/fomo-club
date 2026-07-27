import { createHash } from "node:crypto";
import { canonicalFactsheetJson, type FactSheet, type FactSheetRecord } from "@fomo/core";
import { readFeedContent, readFeedContentByPrefix, writeFeedContent } from "../feed-content-store";

/**
 * 팩트시트 저장소 (WO-SUB-01 §7-3).
 *
 * 저장소는 기존 `FeedContentCache`(JSONB 키-값) 재사용 — **신규 DDL 0**
 * (`us-candles`·`kr-candles`·`signal-stats` 선례와 동일). prod DDL 은 직접 승인 사항이라
 * 이 WO 범위에서 테이블을 만들지 않는다.
 *
 * 키 규약:
 *   `factsheet:<market>:<key>`        — 종목당 최신 1건
 *   `factsheet-snap:<market>:<key>:<hash>` — 내용 주소 스냅샷(불변). WO-SUB-07 의
 *                                            `factsheet_snapshot_hash` 가 이걸 가리킨다
 *   `factsheet-index:<date>`          — 그날 배치가 만든 종목 → 해시 목록(대시보드·감사)
 *
 * **일별 전량 스냅샷을 쓰지 않는 이유**: 종목 × 날짜로 행이 선형 증가하는데, 팩트시트는
 * 실적 발표 때만 바뀐다. 해시가 바뀔 때만 스냅샷을 append 하면 이력은 그대로 보존되면서
 * 행이 폭발하지 않는다. 발행 시점 참조는 해시로 하므로 재현성은 동일하다.
 */

const LATEST_PREFIX = "factsheet:";
const SNAPSHOT_PREFIX = "factsheet-snap:";
const INDEX_PREFIX = "factsheet-index:";

/** 팩트시트 해시 — 정규화 JSON(시각 필드 제외)의 sha256. */
export function factsheetHash(factsheet: FactSheet): string {
  return createHash("sha256").update(canonicalFactsheetJson(factsheet)).digest("hex");
}

export function factsheetKey(factsheet: Pick<FactSheet, "market" | "canonical">): string {
  return `${LATEST_PREFIX}${factsheet.market}:${factsheet.canonical}`;
}

export interface FactSheetIndexEntry {
  canonical: string;
  market: string;
  hash: string;
  coverage_flag: string;
  missing_count: number;
}

export interface FactSheetIndexRow {
  date: string;
  generatedAt: string;
  entries: FactSheetIndexEntry[];
}

/** 최신 레코드 저장 + 해시가 바뀌었으면 불변 스냅샷 append. */
export async function writeFactSheet(factsheet: FactSheet): Promise<FactSheetRecord> {
  const hash = factsheetHash(factsheet);
  const record: FactSheetRecord = { factsheet, factsheet_hash: hash };
  const snapshotId = `${SNAPSHOT_PREFIX}${factsheet.market}:${factsheet.canonical}:${hash}`;
  const existing = await readFeedContent<FactSheetRecord>(snapshotId).catch(() => null);
  if (!existing) await writeFeedContent(snapshotId, record);
  await writeFeedContent(factsheetKey(factsheet), record);
  return record;
}

export async function readFactSheet(market: string, canonical: string): Promise<FactSheetRecord | null> {
  return readFeedContent<FactSheetRecord>(`${LATEST_PREFIX}${market}:${canonical}`).catch(() => null);
}

/** 해시로 스냅샷 조회 — WO-SUB-07 의 발행 시점 재현 경로. */
export async function readFactSheetSnapshot(market: string, canonical: string, hash: string): Promise<FactSheetRecord | null> {
  return readFeedContent<FactSheetRecord>(`${SNAPSHOT_PREFIX}${market}:${canonical}:${hash}`).catch(() => null);
}

export async function writeFactSheetIndex(date: string, entries: readonly FactSheetIndexEntry[]): Promise<void> {
  const row: FactSheetIndexRow = {
    date,
    generatedAt: new Date().toISOString(),
    entries: [...entries].sort((a, b) => a.canonical.localeCompare(b.canonical)),
  };
  await writeFeedContent(`${INDEX_PREFIX}${date}`, row);
}

export async function readFactSheetIndex(date: string): Promise<FactSheetIndexRow | null> {
  return readFeedContent<FactSheetIndexRow>(`${INDEX_PREFIX}${date}`).catch(() => null);
}

/** 최근 인덱스(대시보드가 "가장 최근 배치"를 찾을 때). */
export async function readLatestFactSheetIndex(): Promise<FactSheetIndexRow | null> {
  const rows = await readFeedContentByPrefix<FactSheetIndexRow>(INDEX_PREFIX, 10).catch(() => []);
  return rows.map((row) => row.row).sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;
}
