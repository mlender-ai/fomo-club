import {
  affinityAxisSignal,
  rankMultiAxisFeed,
  selectMultiAxisHook,
  type AxisSignal,
  type KeywordCard,
  type MultiAxisHookSelection,
  type SectorStock,
  type StockCountry,
  type StockMarket,
  type StockSector,
  resolveStock,
  stocksBySector,
} from "@fomo/core";
import { getWatchlist } from "./watchlist";
import { recentSeenStocks, stockInteractionSummary, stockInterestScore } from "./stockInterest";

export const MAX_DISCOVERY_STOCKS = 60;
export const MIN_DISCOVERY_STOCKS = 30;
export const RECENT_SEEN_LIMIT = 20;

export const DISCOVERY_MIX = {
  marquee: 0.4,
  discovered: 0.3,
  tasteSimilar: 0.2,
  quietLead: 0.1,
} as const;

/** 덱 카드 — 섹터 풀 종목 + 발굴 근거(있으면 "주목 종목"으로 노출). */
export type DeckStock = Omit<SectorStock, "sector"> & {
  kind?: "stock";
  reason?: string;
  whyShown?: string;
  insightTag?: string;
  symbol?: string;
  axisSignals?: AxisSignal[];
  axisHook?: MultiAxisHookSelection;
  sector: string;
  market: StockMarket;
  country: StockCountry;
};

export type DeckRelationKind = "customer" | "supplier" | "material" | "peer" | "beneficiary";

export interface DeckThemeBundleItem {
  ticker: string;
  label: string;
  market: StockMarket;
  country?: StockCountry;
  sector?: string;
  relation: DeckRelationKind;
  reason: string;
  source: string;
  confidence: "L" | "M" | "H";
  changePct?: number;
  naverCode?: string;
  symbol?: string;
}

export interface DeckThemeBundle {
  kind: "theme_bundle";
  id: string;
  title: string;
  subtitle: string;
  source: string;
  asOf: string;
  confidence: "L" | "M" | "H";
  anchorTicker: string;
  relation: "event_bundle";
  items: DeckThemeBundleItem[];
}

export type DiscoveryDeckCard = DeckStock | DeckThemeBundle;

export function isThemeBundleCard(card: DiscoveryDeckCard): card is DeckThemeBundle {
  return card.kind === "theme_bundle";
}

export interface AxisSnapshotLike {
  axisSignals: AxisSignal[];
  axisHook: MultiAxisHookSelection;
}

export interface SectorPool {
  sector: StockSector;
  stocks: SectorStock[];
}

function enrichDiscoveredStock(
  stock: Pick<SectorStock, "canonical" | "market" | "country" | "naverCode"> & Partial<Pick<SectorStock, "marquee">>,
  sector: StockSector,
  reason: string
): DeckStock {
  const resolved = resolveStock(stock.canonical);
  const naverCode = resolved?.naverCode ?? stock.naverCode;
  return {
    canonical: resolved?.canonical ?? stock.canonical,
    market: resolved?.market ?? stock.market,
    country: resolved?.country ?? stock.country,
    marquee: resolved?.marquee ?? stock.marquee ?? false,
    sector,
    reason,
    ...(naverCode ? { naverCode } : {}),
  };
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
    out.push(enrichDiscoveredStock(s, sector, s.reason));
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
    const enriched = enrichDiscoveredStock(surprise, card.keyword as StockSector, surprise.reason);
    byCanonical.set(enriched.canonical, enriched);
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

  const all = rankTodayDiscoveryStocks([...byCanonical.values()]);
  if (all.length <= MIN_DISCOVERY_STOCKS) return all;

  const picked = new Map<string, DeckStock>();
  const add = (stock: DeckStock) => {
    if (!picked.has(stock.canonical)) picked.set(stock.canonical, stock);
  };
  const take = (group: readonly DeckStock[], count: number) => {
    for (const stock of group) {
      if (picked.size >= MAX_DISCOVERY_STOCKS || count <= 0) break;
      if (picked.has(stock.canonical)) continue;
      add(stock);
      count -= 1;
    }
  };

  const target = Math.min(MAX_DISCOVERY_STOCKS, all.length);
  const discoveredTarget = Math.round(target * DISCOVERY_MIX.discovered);
  const tasteTarget = Math.round(target * DISCOVERY_MIX.tasteSimilar);
  const marqueeTarget = Math.round(target * DISCOVERY_MIX.marquee);
  const quietLeadTarget = Math.round(target * DISCOVERY_MIX.quietLead);

  const early = all.filter((s) => !isSuppressedForEarlyDiscovery(s));
  const late = all.filter((s) => isSuppressedForEarlyDiscovery(s));
  const discovered = early.filter((s) => !!s.reason);
  const tasteSimilar = early.filter((s) => !s.reason && isTasteSimilarStock(s));
  const marquee = early.filter((s) => !s.reason && s.marquee);
  const quietLead: DeckStock[] = []; // 수급/💎 후보 데이터가 빌더 입력에 없으면 만들지 않는다.
  const rest = early.filter((s) => !s.reason && !s.marquee && !isTasteSimilarStock(s));

  take(discovered, discoveredTarget);
  take(tasteSimilar, tasteTarget);
  take(marquee, marqueeTarget);
  take(quietLead, quietLeadTarget);
  take(rest, target - picked.size);
  take(early, target - picked.size);
  take(late, target - picked.size);

  return [...picked.values()].slice(0, MAX_DISCOVERY_STOCKS);
}

function isSuppressedForEarlyDiscovery(stock: DeckStock, nowMs = Date.now()): boolean {
  if (recentSeenStocks(RECENT_SEEN_LIMIT).includes(stock.canonical)) return true;
  const summary = stockInteractionSummary(stock.canonical);
  const dayMs = 86_400_000;
  const isFreshInteraction = typeof summary.lastTs === "number" && nowMs - summary.lastTs < dayMs;
  return isFreshInteraction && (summary.lastSignal === "less" || summary.lastSignal === "more" || summary.lastSignal === "view_depth");
}

function rankTodayDiscoveryStocks(stocks: readonly DeckStock[], nowMs = Date.now()): DeckStock[] {
  const recent = recentSeenStocks(RECENT_SEEN_LIMIT);
  const recentRank = new Map(recent.map((stock, index) => [stock, RECENT_SEEN_LIMIT - index]));
  return stocks
    .map((stock, index) => ({ stock, index, rank: todayDiscoveryRank(stock, recentRank, nowMs) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map((row) => row.stock);
}

function todayDiscoveryRank(stock: DeckStock, recentRank: ReadonlyMap<string, number>, nowMs: number): number {
  const summary = stockInteractionSummary(stock.canonical);
  const dayMs = 86_400_000;
  const isFreshInteraction = typeof summary.lastTs === "number" && nowMs - summary.lastTs < dayMs;
  const interest = stockInterestScore(stock.canonical, nowMs);
  const recentPenalty = recentRank.get(stock.canonical) ?? 0;
  const lessPenalty = isFreshInteraction && summary.lastSignal === "less" ? 220 : summary.lessCount > summary.moreCount + summary.depthCount ? 80 : 0;
  const positiveRevisitPenalty =
    isFreshInteraction && (summary.lastSignal === "more" || summary.lastSignal === "view_depth") ? 70 : 0;
  return (
    (stock.reason ? 90 : 0) +
    (stock.marquee ? 35 : 0) +
    (isTasteSimilarStock(stock) ? 40 : 0) +
    sectorTasteScore(stock, nowMs) +
    interest * 0.25 -
    recentPenalty * 10 -
    lessPenalty -
    positiveRevisitPenalty
  );
}

function sectorTasteScore(stock: DeckStock, nowMs = Date.now()): number {
  if (!isKnownStockSector(stock.sector)) return 0;
  const dayMs = 86_400_000;
  const peers = stocksBySector(stock.sector).map((s) => s.canonical).filter((peer) => peer !== stock.canonical);
  const watch = new Set(getWatchlist().map((w) => w.stock));
  let score = 0;
  for (const peer of peers) {
    if (watch.has(peer)) score += 10;
    const summary = stockInteractionSummary(peer);
    const fresh = typeof summary.lastTs === "number" && nowMs - summary.lastTs < dayMs;
    if (fresh && summary.lastSignal === "less") score -= 22;
    if (fresh && (summary.lastSignal === "more" || summary.lastSignal === "view_depth")) score += 16;
    score += Math.min(12, summary.moreCount * 4 + summary.depthCount * 3);
    score -= Math.min(18, summary.lessCount * 5);
  }
  return Math.max(-80, Math.min(80, score));
}

function isTasteSimilarStock(stock: DeckStock): boolean {
  if (!isKnownStockSector(stock.sector)) return false;
  const watch = getWatchlist();
  if (watch.length === 0) return false;
  const peers = new Set(stocksBySector(stock.sector).map((s) => s.canonical));
  return watch.some((w) => w.stock !== stock.canonical && peers.has(w.stock));
}

function isKnownStockSector(sector: string): sector is StockSector {
  return ["반도체", "AI", "2차전지", "방산", "바이오", "원자력", "코인"].includes(sector);
}

function affinitySignalFor(stock: DeckStock): AxisSignal | undefined {
  if (!isKnownStockSector(stock.sector)) return undefined;
  const watch = getWatchlist();
  if (watch.length === 0) return undefined;
  const peers = new Set(stocksBySector(stock.sector).map((s) => s.canonical));
  const peerWatch = watch.find((w) => w.stock !== stock.canonical && peers.has(w.stock));
  if (!peerWatch) return undefined;
  return affinityAxisSignal({
    fired: true,
    strength: 0.72,
    hookText: "네가 관심 둔 종목들과 같은 섹터에 있어요.",
    evidenceText: `${stock.sector} 관심 종목 기반`,
  });
}

function mergeAffinitySignal(signals: readonly AxisSignal[], affinity?: AxisSignal): AxisSignal[] {
  const withoutAffinity = signals.filter((s) => s.axis !== "affinity");
  return affinity ? [...withoutAffinity, affinity] : [...withoutAffinity];
}

export function applyAxisSnapshotToStocks(
  stocks: readonly DeckStock[],
  snapshot: Record<string, AxisSnapshotLike> = {}
): DeckStock[] {
  const enriched = stocks.map((stock) => {
    const snap = snapshot[stock.canonical];
    const axisSignals = mergeAffinitySignal(snap?.axisSignals ?? stock.axisSignals ?? [], affinitySignalFor(stock));
    return {
      ...stock,
      ...(axisSignals.length > 0 ? { axisSignals, axisHook: selectMultiAxisHook(axisSignals) } : {}),
    };
  });
  if (!enriched.some((stock) => stock.axisSignals?.some((signal) => signal.fired))) return enriched;
  return rankMultiAxisFeed(enriched, {
    getSignals: (stock) => stock.axisSignals,
    getKey: (stock) => stock.canonical,
  }).map(({ item, hook }) => ({
    ...item,
    axisHook: hook,
    axisSignals: hook.axisSignals,
  }));
}
