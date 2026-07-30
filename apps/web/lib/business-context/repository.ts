import type { BusinessContext } from "@fomo/core";
import { readFeedContent, readFeedContentByPrefix, writeFeedContent } from "../feed-content-store";

/**
 * 사업 실체 저장소 + 원문 아카이브 (WO-SUB-03 §4-1 "원문을 아카이브한다", §7).
 *
 * 저장소는 기존 `FeedContentCache`(JSONB) 재사용 — **신규 DDL 0**(WO-SUB-01 선례).
 *
 * 키 규약:
 *   `bizctx:<market>:<canonical>`            — 종목당 최신 레코드
 *   `bizctx-archive:<doc_id>`                — 추출된 섹션 원문(재계산·감사·근거 노출용)
 *   `bizctx-index:<date>`                    — 그날 합성한 종목 → 배지·프롬프트 버전
 *
 * 재합성 트리거는 두 개다(§5):
 *   ① `snapshot_hash` 변경(문서 갱신)  ② `prompt_version` 변경
 * `needsResynthesis()` 가 그 판정을 한다 — 전량 재합성 비용을 통제하는 지점이다.
 */

const LATEST_PREFIX = "bizctx:";
const ARCHIVE_PREFIX = "bizctx-archive:";
const INDEX_PREFIX = "bizctx-index:";

export function businessContextKey(market: string, canonical: string): string {
  return `${LATEST_PREFIX}${market}:${canonical}`;
}

export async function writeBusinessContext(context: BusinessContext): Promise<void> {
  await writeFeedContent(businessContextKey(context.market, context.canonical), context);
}

export async function readBusinessContext(market: string, canonical: string): Promise<BusinessContext | null> {
  return readFeedContent<BusinessContext>(businessContextKey(market, canonical)).catch(() => null);
}

/** 추출된 섹션 원문 아카이브. 같은 해시면 다시 쓰지 않는다(불변). */
export async function archiveSourceText(docId: string, snapshotHash: string, text: string): Promise<void> {
  const key = `${ARCHIVE_PREFIX}${docId}`;
  const existing = await readFeedContent<{ snapshot_hash: string }>(key).catch(() => null);
  if (existing?.snapshot_hash === snapshotHash) return;
  await writeFeedContent(key, { doc_id: docId, snapshot_hash: snapshotHash, text, archived_at: new Date().toISOString() });
}

/** 저장된 사업 실체 전량 — 소급 스캔용(유니버스 밖 레코드도 검사 대상이다). */
export async function readAllBusinessContexts(limit = 2_000): Promise<BusinessContext[]> {
  const rows = await readFeedContentByPrefix<BusinessContext>(LATEST_PREFIX, limit).catch(() => []);
  return rows.map((entry) => entry.row).filter((row): row is BusinessContext => Boolean(row?.canonical));
}

export async function readArchivedSourceText(docId: string): Promise<string | null> {
  const row = await readFeedContent<{ text?: string }>(`${ARCHIVE_PREFIX}${docId}`).catch(() => null);
  return row?.text ?? null;
}

export interface BusinessContextIndexEntry {
  canonical: string;
  market: string;
  badge: string;
  prompt_version: string;
  slot1: boolean;
  slot2: boolean;
  slot3: boolean;
}

export async function writeBusinessContextIndex(date: string, entries: readonly BusinessContextIndexEntry[]): Promise<void> {
  await writeFeedContent(`${INDEX_PREFIX}${date}`, {
    date,
    generatedAt: new Date().toISOString(),
    entries: [...entries].sort((a, b) => a.canonical.localeCompare(b.canonical)),
  });
}

export async function readLatestBusinessContextIndex(): Promise<{ date: string; entries: BusinessContextIndexEntry[] } | null> {
  const rows = await readFeedContentByPrefix<{ date: string; entries: BusinessContextIndexEntry[] }>(INDEX_PREFIX, 10).catch(() => []);
  return rows.map((row) => row.row).sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;
}

/**
 * 재합성이 필요한가. **비용 통제의 핵심 판정**이다 —
 * 프롬프트 버전이 바뀌면 전 유니버스가 재합성되므로, 버전 변경은 의도적이어야 한다(§5 비용 관리).
 */
export function needsResynthesis(
  existing: BusinessContext | null,
  currentPromptVersion: string,
  currentSnapshotHashes: readonly string[]
): { needed: boolean; reason: string | null } {
  if (!existing) return { needed: true, reason: "레코드 없음" };
  if (existing.prompt_version !== currentPromptVersion) return { needed: true, reason: "프롬프트 버전 변경" };
  const previous = new Set(existing.documents.map((document) => document.snapshot_hash));
  const changed = currentSnapshotHashes.some((hash) => !previous.has(hash));
  if (changed) return { needed: true, reason: "소스 문서 갱신" };
  return { needed: false, reason: null };
}
