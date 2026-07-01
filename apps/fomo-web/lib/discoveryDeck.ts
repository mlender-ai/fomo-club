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
  type ThemeStance,
  SECTORS,
  resolveStock,
  stocksBySector,
} from "@fomo/core";
import { getWatchlist } from "./watchlist";
import { recentSeenStocks, stockInteractionSummary, stockInterestScore } from "./stockInterest";
import { normalizeKrStockCode } from "./stockLogo";

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
  headline?: string;
  headlineProvenance?: {
    text: string;
    provenance: string;
    method: string;
    eventRef?: Record<string, string>;
  };
  insightTag?: string;
  sourceLabel?: string;
  sourceUrl?: string;
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

export type DeckContentType = "macro" | "index" | "whale";
export type DeckContentScope = "domestic" | "world" | "global";

export interface DeckContentFact {
  label: string;
  value: string;
}

export interface DeckContent {
  kind: "content";
  id: string;
  contentType: DeckContentType;
  scope: DeckContentScope;
  headline: string;
  facts: DeckContentFact[];
  source: string;
  asOf: string;
}

export interface DeckNarrativeStock {
  ticker: string;
  name: string;
  market: StockMarket;
  country: StockCountry;
  relation: "trigger" | DeckRelationKind;
  relationReason: string;
  changePct: number;
  naverCode?: string;
  symbol?: string;
}

export interface DeckNarrative {
  kind: "narrative";
  id: string;
  scope: Extract<StockCountry, "KR" | "US">;
  trigger: {
    headline: string;
    source: string;
    asOf: string;
    anchorTicker: string;
    url?: string;
  };
  headline: string;
  stocks: DeckNarrativeStock[];
  source: string;
  asOf: string;
}

export type DiscoveryDeckCard = DeckStock | DeckThemeBundle | DeckContent | DeckNarrative;

export interface DeckSectorStock {
  canonical: string;
  market: StockMarket;
  country: StockCountry;
  naverCode?: string;
  symbol?: string;
  marquee?: boolean;
  changePct?: number;
  flowSignal?: string;
  volumeSignal?: string;
}

export interface DeckSectorCardData {
  id: string;
  sector: string;
  country: StockCountry;
  stance: ThemeStance;
  stanceNote: string;
  stocks: DeckSectorStock[];
}

export type DeckCard =
  | { type: "stock"; data: DeckStock }
  | { type: "sector"; data: DeckSectorCardData }
  | { type: "content"; data: DeckContent }
  | { type: "narrative"; data: DeckNarrative };

export const SECTOR_CARD_INTERVAL = 5;

export function isThemeBundleCard(card: DiscoveryDeckCard): card is DeckThemeBundle {
  return card.kind === "theme_bundle";
}

export function isContentCard(card: DiscoveryDeckCard): card is DeckContent {
  return card.kind === "content";
}

export function isNarrativeCard(card: DiscoveryDeckCard): card is DeckNarrative {
  return card.kind === "narrative";
}

export function deckCardFromDiscovery(card: DiscoveryDeckCard): DeckCard | null {
  if (isThemeBundleCard(card)) return null;
  if (isContentCard(card)) return { type: "content", data: card };
  if (isNarrativeCard(card)) return { type: "narrative", data: card };
  return { type: "stock", data: card };
}

export function stockDeckCards(cards: readonly DiscoveryDeckCard[]): DeckCard[] {
  return cards.map(deckCardFromDiscovery).filter((card): card is DeckCard => card !== null);
}

function normalizeDeckStockIdentifiers(stock: DeckStock): DeckStock {
  if (stock.country !== "KR") return stock;
  const naverCode = normalizeKrStockCode(stock.naverCode) ?? normalizeKrStockCode(stock.symbol);
  return naverCode ? { ...stock, naverCode } : stock;
}

function normalizeThemeBundleIdentifiers(bundle: DeckThemeBundle): DeckThemeBundle {
  return {
    ...bundle,
    items: bundle.items.map((item) => {
      if (item.country !== "KR") return item;
      const naverCode = normalizeKrStockCode(item.naverCode) ?? normalizeKrStockCode(item.symbol);
      return naverCode ? { ...item, naverCode } : item;
    }),
  };
}

export function normalizeDiscoveryDeckCards(cards: readonly DiscoveryDeckCard[]): DiscoveryDeckCard[] {
  return cards.map((card) =>
    isThemeBundleCard(card) ? normalizeThemeBundleIdentifiers(card) : isContentCard(card) || isNarrativeCard(card) ? card : normalizeDeckStockIdentifiers(card)
  );
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

interface DeckFrontLike {
  signals?: {
    changePct?: number;
    volumeRatio?: number;
  };
  axisSignals?: AxisSignal[];
  axisHook?: MultiAxisHookSelection;
}

interface SectorDeckBuildOptions {
  country: StockCountry;
  fronts?: Record<string, DeckFrontLike>;
  interval?: number;
  contentCards?: readonly DeckContent[];
}

function changePctFor(stock: DeckStock, fronts: Record<string, DeckFrontLike>): number | undefined {
  return fronts[stock.canonical]?.signals?.changePct;
}

function volumeSignalFor(stock: DeckStock, fronts: Record<string, DeckFrontLike>): string | undefined {
  const ratio = fronts[stock.canonical]?.signals?.volumeRatio;
  if (typeof ratio !== "number" || ratio < 1.5) return undefined;
  return `거래량 ${ratio.toFixed(1)}배`;
}

function flowSignalFor(stock: DeckStock, fronts: Record<string, DeckFrontLike>): string | undefined {
  const front = fronts[stock.canonical];
  const hook = front?.axisHook ?? stock.axisHook;
  if (hook?.axis === "flow" && hook.hookText) return hook.hookText;
  const signal = (front?.axisSignals ?? stock.axisSignals ?? []).find((item) => item.axis === "flow" && item.fired);
  return signal?.hookText;
}

function stockSectorKey(stock: DeckStock): string {
  return stock.sector.trim() || "기타";
}

function curatedSectorStocks(sector: string, country: StockCountry): SectorStock[] {
  if (!(SECTORS as readonly string[]).includes(sector)) return [];
  return stocksBySector(sector as StockSector).filter((stock) => stock.country === country);
}

function isCoreSector(sector: string): sector is StockSector {
  return (SECTORS as readonly string[]).includes(sector);
}

function sectorStanceFor(
  sector: string,
  country: StockCountry,
  stocks: readonly DeckSectorStock[],
  fronts: Record<string, DeckFrontLike>
): { stance: ThemeStance; note: string; score: number } {
  const changes = stocks.map((stock) => stock.changePct).filter((value): value is number => typeof value === "number");
  const avg = changes.length > 0 ? changes.reduce((sum, value) => sum + value, 0) / changes.length : 0;
  const positive = changes.filter((value) => value > 0.2).length;
  const negative = changes.filter((value) => value < -0.2).length;
  const support =
    country === "KR"
      ? stocks.filter((stock) => Boolean(stock.flowSignal)).length
      : stocks.filter((stock) => {
        const ratio = fronts[stock.canonical]?.signals?.volumeRatio;
        return typeof ratio === "number" && ratio >= 1.5;
      }).length;
  const bullScore = positive * 1.3 + Math.max(0, avg) * 0.35 + support * 0.7;
  const bearScore = negative * 1.3 + Math.max(0, -avg) * 0.35;
  const stance: ThemeStance =
    bullScore >= bearScore + 1 ? "bull-dominant" : bearScore >= bullScore + 1 ? "bear-dominant" : "balanced";
  const avgText = changes.length > 0 ? `평균 등락률 ${avg >= 0 ? "+" : ""}${avg.toFixed(1)}%` : "등락률 확인 중";
  const supportText = country === "KR" ? `수급 신호 ${support}개` : `거래량 확대 ${support}개`;
  return {
    stance,
    note: `${sector} ${avgText}, ${supportText} 기준으로 오늘 흐름을 묶었어요.`,
    score: bullScore - bearScore + stocks.length * 0.08,
  };
}

function toSectorStock(
  stock: DeckStock,
  fronts: Record<string, DeckFrontLike>
): DeckSectorStock {
  const changePct = changePctFor(stock, fronts);
  const flowSignal = stock.country === "KR" ? flowSignalFor(stock, fronts) : undefined;
  const volumeSignal = stock.country === "US" ? volumeSignalFor(stock, fronts) : undefined;
  return {
    canonical: stock.canonical,
    market: stock.market,
    country: stock.country,
    ...(stock.naverCode ? { naverCode: stock.naverCode } : {}),
    ...(stock.symbol ? { symbol: stock.symbol } : {}),
    ...(stock.marquee ? { marquee: stock.marquee } : {}),
    ...(typeof changePct === "number" ? { changePct } : {}),
    ...(flowSignal ? { flowSignal } : {}),
    ...(volumeSignal ? { volumeSignal } : {}),
  };
}

export function buildSectorDeckCards(
  stocks: readonly DeckStock[],
  { country, fronts = {} }: SectorDeckBuildOptions
): DeckCard[] {
  const bySector = new Map<string, DeckStock[]>();
  for (const stock of stocks) {
    if (stock.country !== country) continue;
    const sector = stockSectorKey(stock);
    const arr = bySector.get(sector) ?? [];
    arr.push(stock);
    bySector.set(sector, arr);
  }

  const cards: Array<{ card: Extract<DeckCard, { type: "sector" }>; score: number }> = [];
  for (const [sector, currentStocks] of bySector.entries()) {
    if (country === "KR" && !isCoreSector(sector)) continue;
    const curated = curatedSectorStocks(sector, country);
    const byName = new Map<string, DeckStock>();
    for (const stock of curated) {
      byName.set(stock.canonical, { ...stock, sector });
    }
    for (const stock of currentStocks) byName.set(stock.canonical, stock);
    const rows = [...byName.values()]
      .filter((stock) => stock.country === country)
      .sort((a, b) => {
        const aChange = changePctFor(a, fronts) ?? -999;
        const bChange = changePctFor(b, fronts) ?? -999;
        return bChange - aChange || Number(b.marquee) - Number(a.marquee) || a.canonical.localeCompare(b.canonical);
      })
      .map((stock) => toSectorStock(stock, fronts));
    const withSignal = rows.filter((stock) => typeof stock.changePct === "number" || stock.flowSignal || stock.volumeSignal);
    const displayRows = withSignal.slice(0, 5);
    if (displayRows.length < 2) continue;
    const stance = sectorStanceFor(sector, country, displayRows, fronts);
    cards.push({
      score: stance.score,
      card: {
        type: "sector",
        data: {
          id: `sector:${country}:${sector}`,
          sector,
          country,
          stance: stance.stance,
          stanceNote: stance.note,
          stocks: displayRows,
        },
      },
    });
  }
  return cards.sort((a, b) => b.score - a.score || a.card.data.sector.localeCompare(b.card.data.sector)).map((item) => item.card);
}

function nextSupplementalCard(cards: readonly DeckCard[], cursor: number, lastSector: string | null): { card: DeckCard; cursor: number } | null {
  if (cards.length === 0) return null;
  for (let offset = 0; offset < cards.length; offset += 1) {
    const index = (cursor + offset) % cards.length;
    const card = cards[index];
    if (!card || card.type === "stock") continue;
    if (card.type === "sector" && cards.length > 1 && card.data.sector === lastSector) continue;
    return { card, cursor: index + 1 };
  }
  const card = cards[cursor % cards.length];
  return card ? { card, cursor: cursor + 1 } : null;
}

export function interleaveSectorCards(
  stockCards: readonly DeckCard[],
  sectorCards: readonly DeckCard[],
  interval = SECTOR_CARD_INTERVAL
): DeckCard[] {
  return interleaveSupplementalCards(stockCards, sectorCards, interval);
}

function scopeMatchesCountry(scope: DeckContentScope, country: StockCountry): boolean {
  if (scope === "global") return true;
  return country === "KR" ? scope === "domestic" : scope === "world";
}

function contentPriority(type: DeckContentType): number {
  switch (type) {
    case "index":
      return 0;
    case "macro":
      return 1;
    case "whale":
      return 2;
  }
}

export function buildContentDeckCards(
  contentCards: readonly DeckContent[] = [],
  country: StockCountry,
  limit = 3
): DeckCard[] {
  return contentCards
    .filter((card) => card.kind === "content" && scopeMatchesCountry(card.scope, country))
    .filter((card) => card.headline.trim().length > 0 && card.facts.length > 0)
    .sort((a, b) => contentPriority(a.contentType) - contentPriority(b.contentType) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((card) => ({ type: "content", data: card }) satisfies DeckCard);
}

export function buildNarrativeDeckCards(
  narrativeCards: readonly DeckNarrative[] = [],
  country: StockCountry,
  limit = 2
): DeckCard[] {
  return narrativeCards
    .filter((card) => card.kind === "narrative" && card.scope === country)
    .filter((card) => card.headline.trim().length > 0 && card.trigger.headline.trim().length > 0)
    .filter((card) => card.stocks.length >= 2 && card.stocks.every((stock) => stock.country === country && typeof stock.changePct === "number"))
    .slice(0, limit)
    .map((card) => ({ type: "narrative", data: card }) satisfies DeckCard);
}

function alternateSupplementalCards(
  sectorCards: readonly DeckCard[],
  narrativeCards: readonly DeckCard[],
  contentCards: readonly DeckCard[]
): DeckCard[] {
  const out: DeckCard[] = [];
  const max = Math.max(sectorCards.length, narrativeCards.length, contentCards.length);
  for (let i = 0; i < max; i += 1) {
    const sector = sectorCards[i];
    const narrative = narrativeCards[i];
    const content = contentCards[i];
    if (sector) out.push(sector);
    if (narrative) out.push(narrative);
    if (content) out.push(content);
  }
  return out;
}

export function interleaveSupplementalCards(
  stockCards: readonly DeckCard[],
  supplementalCards: readonly DeckCard[],
  interval = SECTOR_CARD_INTERVAL
): DeckCard[] {
  if (supplementalCards.length === 0 || interval <= 0) return [...stockCards];
  const out: DeckCard[] = [];
  let supplementalCursor = 0;
  let lastSector: string | null = null;
  let stockCount = 0;
  let inserted = 0;
  for (const card of stockCards) {
    out.push(card);
    if (card.type !== "stock") continue;
    stockCount += 1;
    if (stockCount % interval !== 0) continue;
    const next = nextSupplementalCard(supplementalCards, supplementalCursor, lastSector);
    if (!next) continue;
    out.push(next.card);
    inserted += 1;
    supplementalCursor = next.cursor;
    lastSector = next.card.type === "sector" ? next.card.data.sector : lastSector;
  }
  if (inserted === 0 && stockCount > 0) {
    const next = nextSupplementalCard(supplementalCards, supplementalCursor, lastSector);
    if (next) out.push(next.card);
  }
  return out;
}

export function buildDiscoveryDeckCards(
  discoveryCards: readonly DiscoveryDeckCard[],
  options: SectorDeckBuildOptions
): DeckCard[] {
  const normalized = normalizeDiscoveryDeckCards(discoveryCards);
  const stocks = normalized.filter((card): card is DeckStock => !isThemeBundleCard(card) && !isContentCard(card) && !isNarrativeCard(card));
  const stockCards = stockDeckCards(stocks);
  const sectorCards = buildSectorDeckCards(stocks, options);
  const narrativeCards = buildNarrativeDeckCards(normalized.filter(isNarrativeCard), options.country);
  const contentCards = buildContentDeckCards(
    [...normalized.filter(isContentCard), ...(options.contentCards ?? [])],
    options.country
  );
  const supplementalCards = alternateSupplementalCards(sectorCards, narrativeCards, contentCards);
  return interleaveSupplementalCards(stockCards, supplementalCards, options.interval ?? SECTOR_CARD_INTERVAL);
}
