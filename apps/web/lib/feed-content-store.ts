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

export async function readFeedContent<T>(id: string): Promise<T | null> {
  try {
    const records = await prisma.$queryRaw<Array<{ row: unknown }>>`
      SELECT "row" FROM "FeedContentCache" WHERE "id" = ${id} LIMIT 1
    `;
    return (records[0]?.row as T | undefined) ?? null;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2010") return null;
    return null;
  }
}

/** 접두사로 여러 개 읽기(최신순) — 언급 스냅샷 7일치 등. */
export async function readFeedContentByPrefix<T>(prefix: string, limit = 10): Promise<Array<{ id: string; row: T }>> {
  try {
    const records = await prisma.$queryRaw<Array<{ id: string; row: unknown }>>`
      SELECT "id", "row" FROM "FeedContentCache"
      WHERE "id" LIKE ${`${prefix}%`}
      ORDER BY "updatedAt" DESC
      LIMIT ${Math.max(1, Math.min(50, limit))}
    `;
    return records.map((record) => ({ id: record.id, row: record.row as T }));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2010") return [];
    return [];
  }
}
