import type { KeywordCard, SectorStock, StockSector } from "@fomo/core";
import { getWatchlist } from "@/lib/watchlist";
import { stockInterestScore } from "@/lib/stockInterest";

export const MAX_DISCOVERY_STOCKS = 60;
export const MIN_DISCOVERY_STOCKS = 30;

/** 덱 카드 — 섹터 풀 종목 + 발굴 근거(있으면 "주목 종목"으로 노출). */
export type DeckStock = SectorStock & { reason?: string; whyShown?: string };

export interface SectorPool {
  sector: StockSector;
  stocks: SectorStock[];
}

/**
 * 섹터 풀 + 그날 발굴 종목 병합. 발굴 근거(reason)를 풀 종목에 붙이고, 풀에 없던 발굴주는 추가.
 * 순서는 풀 순서를 보존한다. 즉시 렌더 path 에서 다시 정렬한다.
 */
export function buildSectorDiscoveryStocks(
  pool: readonly SectorStock[],
  cards: readonly KeywordCard[],
  sector: StockSector
): DeckStock[] {
  const reasons = new Map<string, string>();
  for (const c of cards) {
    if (c.keyword !== sector) continue;
    const s = c.surpriseStock;
    if (s?.reason) reasons.set(s.canonical, s.reason);
  }
  const have = new Set(pool.map((s) => s.canonical));
  const out: DeckStock[] = pool.map((s) => {
    const r = reasons.get(s.canonical);
    return r ? { ...s, reason: r } : s;
  });
  for (const c of cards) {
    if (c.keyword !== sector) continue;
    const s = c.surpriseStock;
    if (!s?.reason || have.has(s.canonical)) continue;
    have.add(s.canonical);
    out.push({ canonical: s.canonical, market: s.market, country: s.country, marquee: false, sector, reason: s.reason });
  }
  return rankInstantStocks(out);
}

function stockPersonalizationRank(stock: string, nowMs = Date.now()): number {
  const watch = getWatchlist();
  const watchIndex = watch.findIndex((w) => w.stock === stock);
  const watchBoost = watchIndex >= 0 ? 30 + Math.max(0, 10 - watchIndex) : 0;
  return stockInterestScore(stock, nowMs) + watchBoost;
}

export function rankInstantStocks(stocks: readonly DeckStock[], nowMs = Date.now()): DeckStock[] {
  return stocks
    .map((stock, index) => ({ stock, index, rank: stockPersonalizationRank(stock.canonical, nowMs) }))
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        Number(!!b.stock.reason) - Number(!!a.stock.reason) ||
        Number(b.stock.marquee) - Number(a.stock.marquee) ||
        a.index - b.index
    )
    .map((row) => row.stock);
}

export function buildTodayDiscoveryStocks(
  pools: readonly SectorPool[],
  cards: readonly KeywordCard[],
  discoverySectors: readonly StockSector[]
): DeckStock[] {
  const sectorSet = new Set<string>(discoverySectors);
  const byCanonical = new Map<string, DeckStock>();

  for (const card of cards) {
    if (!sectorSet.has(card.keyword)) continue;
    const surprise = card.surpriseStock;
    if (!surprise?.reason) continue;
    byCanonical.set(surprise.canonical, {
      canonical: surprise.canonical,
      market: surprise.market,
      country: surprise.country,
      marquee: false,
      sector: card.keyword as StockSector,
      reason: surprise.reason,
    });
  }

  for (const pool of pools) {
    for (const stock of pool.stocks) {
      const current = byCanonical.get(stock.canonical);
      if (current) {
        byCanonical.set(stock.canonical, {
          ...stock,
          ...(current.reason ? { reason: current.reason } : {}),
        });
        continue;
      }
      byCanonical.set(stock.canonical, stock);
    }
  }

  return rankInstantStocks([...byCanonical.values()]).slice(0, MAX_DISCOVERY_STOCKS);
}
