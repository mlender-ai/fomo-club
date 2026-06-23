/**
 * 종목 관심(워치리스트) seam — STOCK_SCREEN_REDESIGN 2차 C. "증권시장의 틴더" 취향 입력의 핵심.
 *
 * 명시적 관심(하트)을 로컬에 즉시 기록(토글 상태 + 히스토리). 서버 적재는 recordTaste(STOCK, more/less)로
 * 트랙 B(#552) 취향 신호에 같이 쌓인다 — 별도 테이블/DDL 없이 재사용. 로그인 시 서버 워치리스트로 보강.
 * 비로그인도 로컬로 동작(기존 패턴). 출시 후 서버 동기화로 교체할 단일 지점.
 */
const KEY = "fomo_watchlist";
const CAP = 200;

export interface WatchItem {
  stock: string;
  ts: number;
  sector?: string;
  reason?: string;
}

function read(): WatchItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): WatchItem | null => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        if (typeof row.stock !== "string" || typeof row.ts !== "number") return null;
        return {
          stock: row.stock,
          ts: row.ts,
          ...(typeof row.sector === "string" ? { sector: row.sector } : {}),
          ...(typeof row.reason === "string" ? { reason: row.reason } : {}),
        };
      })
      .filter((item): item is WatchItem => item !== null);
  } catch {
    return [];
  }
}

function write(list: WatchItem[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-CAP)));
  } catch {
    /* 저장 실패 무시 — 흐름 안 막음 */
  }
}

/** 관심 등록 여부. */
export function isWatched(stock: string): boolean {
  return read().some((w) => w.stock === stock);
}

/** 최근 관심 순(내림차순). */
export function getWatchlist(): WatchItem[] {
  return [...read()].sort((a, b) => b.ts - a.ts);
}

/** 관심 등록/갱신 — 기존 localStorage 구조와 호환되게 stock 기준으로 upsert. */
export function upsertWatch(
  stock: string,
  nowMs: number,
  meta: { sector?: string | undefined; reason?: string | undefined } = {}
): WatchItem | null {
  if (typeof window === "undefined" || !stock) return null;
  const list = read().filter((w) => w.stock !== stock);
  const item: WatchItem = {
    stock,
    ts: nowMs,
    ...(meta.sector ? { sector: meta.sector } : {}),
    ...(meta.reason ? { reason: meta.reason } : {}),
  };
  write([...list, item]);
  return item;
}

/** 관심 토글 — 새 상태(true=관심 등록됨) 반환. */
export function toggleWatch(
  stock: string,
  nowMs: number,
  meta: { sector?: string | undefined; reason?: string | undefined } = {}
): boolean {
  if (typeof window === "undefined") return false;
  const list = read();
  const exists = list.some((w) => w.stock === stock);
  if (exists) {
    write(list.filter((w) => w.stock !== stock));
    return false;
  }
  upsertWatch(stock, nowMs, meta);
  return true;
}

/** 서버 워치리스트(로그인 시)를 로컬에 머지 — 다른 기기에서 담은 것도 보이게. */
export function mergeWatchlist(stocks: string[], nowMs: number): void {
  if (typeof window === "undefined" || stocks.length === 0) return;
  const list = read();
  const have = new Set(list.map((w) => w.stock));
  const merged = [...list];
  for (const s of stocks) if (!have.has(s)) merged.push({ stock: s, ts: nowMs });
  write(merged);
}
