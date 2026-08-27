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
/**
 * 저장된 최신 팩트시트 전량 — **소급 스캔용**.
 *
 * 커버리지 리포트는 유니버스를 돌며 종목별로 읽는데(유니버스 기준 확보율을 재는 것이 목적),
 * 소급 스캔은 "저장된 산출물 전량" 이 대상이라 유니버스에서 빠진 레코드도 봐야 한다.
 * 불변식 위반이 유니버스 밖에 숨는 것을 막는다.
 */
/**
 * 전량 조회 — **실패하면 던진다.**
 *
 * 종전에는 여기서 `.catch(() => [])` 로 삼켰다. 그러면 DB 가 죽어도 호출부에는
 * **"팩트시트가 하나도 없는 날"** 과 글자 하나 다르지 않게 보인다. `docs/STATUS.md` §12 가
 * 바로 그 사고였고(같은 fail-open 이 빈 덱을 2분 노출시켰다), 같은 실수를 여기서 반복했다 —
 * 3걸음이 0종목으로 나갔는데 `inputFailures` 는 비어 있었다(2026-08-27 실측).
 *
 * 삼키는 쪽이 필요하면 `readAllFactSheetsOrEmpty` 를 쓴다. **어느 쪽을 쓰는지 부르는 쪽이
 * 고르게 한다** — 조용히 정해주지 않는다.
 */
export async function readAllFactSheetsStrict(limit = 2_000): Promise<FactSheet[]> {
  const rows = await readFeedContentByPrefix<FactSheetRecord>(LATEST_PREFIX, limit);
  return rows.map((entry) => entry.row?.factsheet).filter((factsheet): factsheet is FactSheet => Boolean(factsheet));
}

/** 실패를 빈 배열로 덮는다. **"없다" 와 "못 읽었다" 를 구분할 필요가 없는 곳에서만** 쓴다. */
export async function readAllFactSheets(limit = 2_000): Promise<FactSheet[]> {
  return readAllFactSheetsStrict(limit).catch(() => []);
}

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

const BUILD_FAILURE_PREFIX = "factsheet-fail:";

export interface BuildFailureRow {
  date: string;
  canonical: string;
  market: string;
  error: string;
  at: string;
}

/**
 * 빌드 실패를 남긴다.
 *
 * 이전에는 실패 사유가 그 라운드의 HTTP 응답에만 있었고 백필 워크플로가 그것을 버렸다.
 * 그래서 "커서는 done 인데 레코드는 없다" 는 상태의 원인을 사후에 알 수 없었다.
 * 실패도 사실이므로 저장한다.
 */
export async function writeBuildFailure(row: Omit<BuildFailureRow, "at">): Promise<void> {
  await writeFeedContent(`${BUILD_FAILURE_PREFIX}${row.date}:${row.market}:${row.canonical}`, {
    ...row,
    at: new Date().toISOString(),
  } satisfies BuildFailureRow).catch(() => undefined);
}

export async function readBuildFailures(limit = 500): Promise<BuildFailureRow[]> {
  const rows = await readFeedContentByPrefix<BuildFailureRow>(BUILD_FAILURE_PREFIX, limit).catch(() => []);
  return rows.map((entry) => entry.row).filter((row): row is BuildFailureRow => Boolean(row?.canonical));
}

export async function readFactSheetIndex(date: string): Promise<FactSheetIndexRow | null> {
  return readFeedContent<FactSheetIndexRow>(`${INDEX_PREFIX}${date}`).catch(() => null);
}

/** 최근 인덱스(대시보드가 "가장 최근 배치"를 찾을 때). */
export async function readLatestFactSheetIndex(): Promise<FactSheetIndexRow | null> {
  const rows = await readFeedContentByPrefix<FactSheetIndexRow>(INDEX_PREFIX, 10).catch(() => []);
  return rows.map((row) => row.row).sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;
}
