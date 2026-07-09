import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { DiscoveryMarketRow } from "./market-source-types";

const US_MARKET_QUOTE_CACHE_MAX_AGE_HOURS = 18;

export interface UsMarketQuoteCacheWriteOptions {
  sessionDate: string;
  slot: number;
}

export interface UsMarketQuoteCacheReadOptions {
  maxAgeHours?: number;
}

export interface UsMarketQuoteCacheStats {
  rows: number;
  rowsWithPrice: number;
  rowsWithSparkline: number;
}

interface CachedUsMarketQuoteRow {
  symbol: string;
  row: unknown;
  updatedAt: Date;
}

let ensured = false;

async function ensureUsMarketQuoteCacheTable(): Promise<void> {
  if (ensured) return;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "UsMarketQuoteCache" (
      "symbol" TEXT PRIMARY KEY,
      "row" JSONB NOT NULL,
      "sessionDate" TEXT NOT NULL,
      "slot" INTEGER NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "UsMarketQuoteCache_updatedAt_idx"
    ON "UsMarketQuoteCache" ("updatedAt" DESC)
  `;
  ensured = true;
}

function isUsMarketRow(value: unknown): value is DiscoveryMarketRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<DiscoveryMarketRow>;
  return row.country === "US" && typeof row.symbol === "string" && row.symbol.length > 0 && typeof row.canonical === "string";
}

function hasUsQuote(row: DiscoveryMarketRow): boolean {
  return typeof row.changePct === "number" || typeof row.priceText === "string" || (row.sparkline?.length ?? 0) >= 2;
}

export async function writeUsMarketQuoteRows(
  rows: readonly DiscoveryMarketRow[],
  options: UsMarketQuoteCacheWriteOptions,
): Promise<UsMarketQuoteCacheStats> {
  await ensureUsMarketQuoteCacheTable();
  const quoteRows = rows.filter((row) => row.country === "US" && hasUsQuote(row));
  // 벌크 UPSERT(unnest) — 유니버스 500 확장 후 순차 INSERT 500회가 함수 타임아웃의 원인이었다.
  const CHUNK = 200;
  for (let i = 0; i < quoteRows.length; i += CHUNK) {
    const chunk = quoteRows.slice(i, i + CHUNK);
    const symbols = chunk.map((row) => row.symbol.toUpperCase());
    const payloads = chunk.map((row) => JSON.stringify(row));
    await prisma.$executeRaw`
      INSERT INTO "UsMarketQuoteCache" ("symbol", "row", "sessionDate", "slot", "updatedAt")
      SELECT s, p::jsonb, ${options.sessionDate}, ${options.slot}, NOW()
      FROM unnest(${symbols}::text[], ${payloads}::text[]) AS t(s, p)
      ON CONFLICT ("symbol") DO UPDATE
      SET "row" = EXCLUDED."row",
          "sessionDate" = EXCLUDED."sessionDate",
          "slot" = EXCLUDED."slot",
          "updatedAt" = NOW()
    `;
  }
  return {
    rows: quoteRows.length,
    rowsWithPrice: quoteRows.filter((row) => typeof row.changePct === "number" || row.priceText).length,
    rowsWithSparkline: quoteRows.filter((row) => (row.sparkline?.length ?? 0) >= 2).length,
  };
}

export async function readUsMarketQuoteRows(options: UsMarketQuoteCacheReadOptions = {}): Promise<DiscoveryMarketRow[]> {
  const maxAgeHours = Math.max(1, Math.min(72, options.maxAgeHours ?? US_MARKET_QUOTE_CACHE_MAX_AGE_HOURS));
  const since = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  try {
    const records = await prisma.$queryRaw<CachedUsMarketQuoteRow[]>`
      SELECT "symbol", "row", "updatedAt"
      FROM "UsMarketQuoteCache"
      WHERE "updatedAt" >= ${since}
      ORDER BY COALESCE(("row"->>'marketCapRank')::int, 9999), "symbol" ASC
    `;
    return records
      .map((record) => record.row)
      .filter(isUsMarketRow)
      .filter(hasUsQuote);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2010") return [];
    return [];
  }
}
