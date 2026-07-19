/**
 * Ephemeral ranking projection only. Durable swipe history moved to JudgmentLedger (WO-M1).
 * This module deliberately has no localStorage/DB write; it may be fed from a ledger projection in a later ranking pass.
 */
const CAP = 300;
const records: StockInterestRecord[] = [];

export type StockInterest = "more" | "less" | "view_depth" | "seen";

interface StockInterestRecord {
  stock: string;
  signal: StockInterest;
  ts: number;
}

export interface StockInteractionSummary {
  stock: string;
  lastSignal?: StockInterest | undefined;
  lastTs?: number | undefined;
  moreCount: number;
  lessCount: number;
  depthCount: number;
  seenCount: number;
}

export function recordStockInterest(stock: string, signal: StockInterest, nowMs: number): void {
  if (!stock) return;
  records.push({ stock, signal, ts: nowMs });
  if (records.length > CAP) records.splice(0, records.length - CAP);
}

export function resetStockInterestProjection(): void {
  records.length = 0;
}

export function stockInterestScore(stock: string, nowMs = Date.now()): number {
  const dayMs = 86_400_000;
  return records
    .filter((record) => record.stock === stock)
    .reduce((sum, record) => {
      const ageDays = Math.max(0, (nowMs - record.ts) / dayMs);
      const decay = Math.max(0.25, 1 - ageDays / 21);
      const weight = record.signal === "view_depth" ? 14 : record.signal === "more" ? 10 : record.signal === "less" ? -12 : 0;
      return sum + weight * decay;
    }, 0);
}

export function recentSeenStocks(limit = 20): string[] {
  const seen: string[] = [];
  const used = new Set<string>();
  for (const record of [...records].reverse()) {
    if (used.has(record.stock)) continue;
    used.add(record.stock);
    seen.push(record.stock);
    if (seen.length >= limit) break;
  }
  return seen;
}

export function stockInteractionSummary(stock: string): StockInteractionSummary {
  const rows = records.filter((record) => record.stock === stock);
  const last = rows.at(-1);
  return {
    stock,
    lastSignal: last?.signal,
    lastTs: last?.ts,
    moreCount: rows.filter((record) => record.signal === "more").length,
    lessCount: rows.filter((record) => record.signal === "less").length,
    depthCount: rows.filter((record) => record.signal === "view_depth").length,
    seenCount: rows.filter((record) => record.signal === "seen").length,
  };
}
