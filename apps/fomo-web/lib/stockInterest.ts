/**
 * 종목 스와이프 취향 점수 — 서버 taste 적재와 별개로 즉시 덱 정렬에 쓰는 로컬 1차 개인화.
 * more/view_depth/watch 는 위로, less 는 아래로. 실패해도 제품 흐름을 막지 않는다.
 */
const KEY = "fomo_stock_interest";
const CAP = 300;

export type StockInterest = "more" | "less" | "view_depth";

interface StockInterestRecord {
  stock: string;
  signal: StockInterest;
  ts: number;
}

function read(): StockInterestRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StockInterestRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordStockInterest(stock: string, signal: StockInterest, nowMs: number): void {
  if (typeof window === "undefined" || !stock) return;
  try {
    const list = read();
    list.push({ stock, signal, ts: nowMs });
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-CAP)));
  } catch {
    /* 저장 실패는 무시 */
  }
}

export function stockInterestScore(stock: string, nowMs = Date.now()): number {
  const dayMs = 86_400_000;
  return read()
    .filter((r) => r.stock === stock)
    .reduce((sum, r) => {
      const ageDays = Math.max(0, (nowMs - r.ts) / dayMs);
      const decay = Math.max(0.25, 1 - ageDays / 21);
      const weight = r.signal === "view_depth" ? 14 : r.signal === "more" ? 10 : -12;
      return sum + weight * decay;
    }, 0);
}
