import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * 피드 콘텐츠 캐시 (WO 피드 강화) — 크론이 쓰고 요청 경로는 읽기만(504 원칙).
 * 브리핑·버즈·주간회고·언급 스냅샷을 id 단위 JSONB 로 저장. UsMarketQuoteCache 패턴 미러.
 * id 규약: "briefing:us:<date>" | "briefing:kr:<date>" | "buzz:<date>" | "recap:<isoweek>" | "mention-snapshot:<date>"
 */

let ensured = false;

async function ensureFeedContentTable(): Promise<void> {
  if (ensured) return;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "FeedContentCache" (
      "id" TEXT PRIMARY KEY,
      "row" JSONB NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "FeedContentCache_updatedAt_idx"
    ON "FeedContentCache" ("updatedAt" DESC)
  `;
  ensured = true;
}

export async function writeFeedContent(id: string, row: unknown): Promise<void> {
  await ensureFeedContentTable();
  await prisma.$executeRaw`
    INSERT INTO "FeedContentCache" ("id", "row", "updatedAt")
    VALUES (${id}, ${JSON.stringify(row)}::jsonb, NOW())
    ON CONFLICT ("id") DO UPDATE
    SET "row" = EXCLUDED."row", "updatedAt" = NOW()
  `;
}

/** 행 삭제 — 발행 가드가 차단한 날, 앞서 잘못 발행된 같은 키(장전 껍데기 등)를 걷어내는 self-heal 용. */
export async function deleteFeedContent(id: string): Promise<void> {
  await ensureFeedContentTable();
  await prisma.$executeRaw`DELETE FROM "FeedContentCache" WHERE "id" = ${id}`;
}

/**
 * 오류를 삼키지 않는 읽기.
 *
 * `readFeedContent` 는 "행이 없다(아직 안 구웠다)" 와 "DB 읽기가 실패했다" 를 **똑같이 null 로** 준다.
 * 조회 라우트가 그 null 을 "발행 전" 으로 번역하면 장애가 정상 상태로 위장된다.
 *
 * 2026-08-15 quiet-picks 사고가 정확히 이것이었다(WO-OPS-QP503): `quiet-pick:active` 는 내내
 * 있었는데(asOf 2026-08-14T21:41:50Z) 읽기가 간헐 실패했고, 삼킨 null 이 `unstable_cache` 에
 * 300초씩 굳어 사용자에게 빈 503 이 나갔다.
 *
 * 삼킴 자체가 죄는 아니다 — 보강 경로는 실패 시 건너뛰는 게 맞다. 삼킨 것을 사용자에게
 * "발행 전" 이라고 **말하는** 호출자만 이 함수를 쓰고 예외를 그대로 받는다.
 */
export async function readFeedContentStrict<T>(id: string): Promise<T | null> {
  const records = await prisma.$queryRaw<Array<{ row: unknown }>>`
    SELECT "row" FROM "FeedContentCache" WHERE "id" = ${id} LIMIT 1
  `;
  return (records[0]?.row as T | undefined) ?? null;
}

export async function readFeedContent<T>(id: string): Promise<T | null> {
  try {
    return await readFeedContentStrict<T>(id);
  } catch (err) {
    // 삼키더라도 흔적은 남긴다 — 조용한 null 이 조사에서 가장 비쌌다.
    console.error("[feed-content-store] read failed", id, err instanceof Error ? err.message : err);
    return null;
  }
}

/** 접두사로 여러 개 읽기(최신순) — 언급 스냅샷 7일치 등. */
/**
 * 접두사 조회 상한.
 *
 * 50 이었는데 **조용히 잘랐다** — 전수 스캔(불변식 소급 검사)에서 300여 건 중 50 건만 보고
 * "위반 0건" 이 나오면 그건 거짓 신호다. 호출자가 자기 상한을 주므로 이 값은 방어선일 뿐이고,
 * 방어선이 진실을 자르는 위치에 있으면 안 된다.
 */
const MAX_PREFIX_ROWS = 2_000;

export async function readFeedContentByPrefix<T>(prefix: string, limit = 10): Promise<Array<{ id: string; row: T }>> {
  try {
    const records = await prisma.$queryRaw<Array<{ id: string; row: unknown }>>`
      SELECT "id", "row" FROM "FeedContentCache"
      WHERE "id" LIKE ${`${prefix}%`}
      ORDER BY "updatedAt" DESC
      LIMIT ${Math.max(1, Math.min(MAX_PREFIX_ROWS, limit))}
    `;
    return records.map((record) => ({ id: record.id, row: record.row as T }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2010") return [];
    return [];
  }
}

/**
 * One-off migrations need the persisted timestamp, not a synthesized date. Keep this separate
 * from the hot-path reader so normal requests retain the small 50-row ceiling.
 */
/**
 * 여러 id 를 **한 쿼리로** 읽는다.
 *
 * 왜 이게 필요했나: `readFeedContent` 를 `Promise.all` 로 N 개 돌리면 커넥션 풀에서 N 슬롯을
 * 동시에 잡는다. 2026-08-18 실측 — quiet-pick 크론이 최근 8일 스냅샷을 병렬로 읽자
 * `FATAL: (EMAXCONNSESSION) max clients reached in session mode - pool_size: 15` 가 나며
 * 조회 라우트가 503 으로 넘어갔다. 커넥션 1개면 그 위험이 없고 왕복도 1회다.
 *
 * 없는 id 는 결과에 없다(에러가 아니다). 반환은 Map — 호출자가 순서를 직접 정한다.
 */
export async function readFeedContentMany<T>(ids: readonly string[]): Promise<Map<string, T>> {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  if (unique.length === 0) return new Map();
  try {
    const records = await prisma.$queryRaw<Array<{ id: string; row: unknown }>>`
      SELECT "id", "row" FROM "FeedContentCache"
      WHERE "id" IN (${Prisma.join(unique)})
    `;
    return new Map(records.map((record) => [record.id, record.row as T]));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2010") return new Map();
    return new Map();
  }
}

export async function readFeedContentHistoryByPrefix<T>(
  prefix: string,
  limit = 5_000
): Promise<Array<{ id: string; row: T; updatedAt: Date }>> {
  try {
    const records = await prisma.$queryRaw<Array<{ id: string; row: unknown; updatedAt: Date }>>`
      SELECT "id", "row", "updatedAt" FROM "FeedContentCache"
      WHERE "id" LIKE ${`${prefix}%`}
      ORDER BY "updatedAt" ASC, "id" ASC
      LIMIT ${Math.max(1, Math.min(5_000, limit))}
    `;
    return records.map((record) => ({
      id: record.id,
      row: record.row as T,
      updatedAt: record.updatedAt,
    }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2010") return [];
    return [];
  }
}
