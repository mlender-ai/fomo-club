import type { CardFrontSignals, StockCountry } from "@fomo/core";
import {
  buildDiscoveryResponse,
  type DiscoveryDeckCardPayload,
  type DiscoveryFrontSeed,
  type DiscoveryResponse,
  type DiscoveryStockPayload,
} from "./discovery-supply";
import { expandDeckContentCardsForScope, fetchDeckContentCards, type DeckContentCard } from "./deck-content";
import { buildCoinDiscoveryResponse } from "./coin-discovery";
import { readTodayFeedContent, type TodayFeedContent } from "./feed-briefing";

export type Daily30AssetClass = "kr-stock" | "us-stock" | "coin" | "macro";

export interface Daily30MetaCard {
  id: string;
  assetClass: Daily30AssetClass;
  quietScore: number;
  signalScore: number;
  hypePenalty: number;
}

export interface Daily30Response extends DiscoveryResponse {
  country: "all";
  meta: {
    targetCount: number;
    cards: Daily30MetaCard[];
    assetCounts: Record<Daily30AssetClass, number>;
  };
}

type CandidateKind = "stock" | "content" | "narrative";

interface Daily30Candidate {
  kind: CandidateKind;
  id: string;
  card: DiscoveryDeckCardPayload;
  stock?: DiscoveryStockPayload;
  front?: DiscoveryFrontSeed;
  assetClass: Daily30AssetClass;
  sector?: string;
  signalScore: number;
  hypePenalty: number;
  quietScore: number;
}

const DAILY_CARD_TARGET = 30;
const FAMOUS_STOCKS = new Set([
  "삼성전자",
  "SK하이닉스",
  "현대차",
  "기아",
  "NAVER",
  "카카오",
  "LG에너지솔루션",
  "엔비디아",
  "애플",
  "마이크로소프트",
  "알파벳",
  "아마존",
  "메타",
  "테슬라",
  "브로드컴",
  "TSMC",
  "월마트",
  "버크셔해서웨이",
]);

const ASSET_CAPS: Record<Daily30AssetClass, number> = {
  "kr-stock": 12,
  "us-stock": 12,
  coin: 3,
  macro: 6,
};

function isStockCard(card: DiscoveryDeckCardPayload): card is { kind: "stock" } & DiscoveryStockPayload {
  return !("kind" in card) || card.kind === "stock";
}

function isContentCard(card: DiscoveryDeckCardPayload): card is DeckContentCard {
  return "kind" in card && card.kind === "content";
}

function isNarrativeCard(card: DiscoveryDeckCardPayload): boolean {
  return "kind" in card && card.kind === "narrative";
}

function stockId(stock: Pick<DiscoveryStockPayload, "country" | "canonical" | "symbol" | "naverCode">): string {
  return `stock:${stock.country}:${stock.symbol ?? stock.naverCode ?? stock.canonical}:${stock.canonical}`;
}

function stockAssetClass(stock: Pick<DiscoveryStockPayload, "country" | "market">): Daily30AssetClass {
  return stock.market === "COIN" ? "coin" : stock.country === "US" ? "us-stock" : "kr-stock";
}

function contentAssetClass(card: DeckContentCard): Daily30AssetClass {
  return card.contentType === "whale" || card.scope === "global" ? "coin" : "macro";
}

function frontSignals(front: DiscoveryFrontSeed | undefined): Partial<CardFrontSignals> {
  return front?.signals ?? {};
}

function absoluteChange(front: DiscoveryFrontSeed | undefined): number {
  const value = frontSignals(front).changePct;
  return typeof value === "number" && Number.isFinite(value) ? Math.abs(value) : 0;
}

function hasPricedFront(front: DiscoveryFrontSeed | undefined): boolean {
  return Boolean(front?.priceText) && (front?.sparkline?.length ?? 0) >= 2;
}

function signalText(stock: DiscoveryStockPayload): string {
  return [stock.headline, stock.whyShown, stock.reason, stock.insightTag, stock.sourceLabel]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function strongQuietSignal(stock: DiscoveryStockPayload): boolean {
  return /내부자|자사주|임원|대주주|순매수|기관|외국인|거래량|공시|계약|수주|DART|SEC|Form\s?4|insider|purchase|disclosure/i.test(
    signalText(stock)
  );
}

function computeStockSignal(stock: DiscoveryStockPayload, front: DiscoveryFrontSeed | undefined): number {
  const signals = frontSignals(front);
  const change = absoluteChange(front);
  const volumeRatio = typeof signals.volumeRatio === "number" && Number.isFinite(signals.volumeRatio) ? signals.volumeRatio : 0;
  const axisCount = front?.axisSignals?.length ?? 0;
  let score = 18;
  if (stock.headline || stock.whyShown || stock.reason) score += 22;
  score += Math.min(24, change * 2.4);
  score += Math.min(18, Math.max(0, volumeRatio - 1) * 8);
  score += Math.min(16, axisCount * 4);
  if (strongQuietSignal(stock)) score += 18;
  if (hasPricedFront(front)) score += 10;
  return score;
}

function computeHypePenalty(stock: DiscoveryStockPayload, front: DiscoveryFrontSeed | undefined): number {
  const signals = frontSignals(front);
  const mentionScore = typeof signals.mentionScore === "number" && Number.isFinite(signals.mentionScore) ? signals.mentionScore : 0;
  const marketCapRank =
    signals.marketCapRank && typeof signals.marketCapRank === "object" && typeof signals.marketCapRank.rank === "number"
      ? signals.marketCapRank.rank
      : undefined;
  let penalty = 0;
  penalty += Math.min(25, mentionScore * 0.35);
  if (stock.marquee) penalty += 28;
  if (FAMOUS_STOCKS.has(stock.canonical)) penalty += 42;
  if (typeof marketCapRank === "number") {
    if (marketCapRank <= 30) penalty += 28;
    else if (marketCapRank <= 100) penalty += 18;
    else if (marketCapRank <= 250) penalty += 8;
  }
  if (absoluteChange(front) >= 15) penalty += 8;
  return penalty;
}

/**
 * 렌더 전 표준 검증 게이트(WO 1.6 C) — 바이오비쥬 포맷 필수 필드.
 * 가격·등락률·헤드라인·verdict 미달 카드는 30장에서 제외(다음 quietScore 후보가 채움). 에러 카드 노출 0.
 */
function meetsCardStandard(stock: DiscoveryStockPayload, front: DiscoveryFrontSeed | undefined): boolean {
  if (!hasPricedFront(front)) return false;
  if (typeof frontSignals(front).changePct !== "number") return false;
  if (!(stock.headline ?? "").trim()) return false;
  if (!front?.verdict) return false;
  return true;
}

function stockCandidate(stock: DiscoveryStockPayload, front: DiscoveryFrontSeed | undefined): Daily30Candidate | null {
  if (!meetsCardStandard(stock, front)) return null;
  if (FAMOUS_STOCKS.has(stock.canonical) && !strongQuietSignal(stock)) return null;
  const signalScore = computeStockSignal(stock, front);
  const hypePenalty = computeHypePenalty(stock, front);
  const quietScore = signalScore - hypePenalty;
  if (quietScore < 6) return null;
  return {
    kind: "stock",
    id: stockId(stock),
    card: { kind: "stock", ...stock },
    stock,
    ...(front ? { front } : {}),
    assetClass: stockAssetClass(stock),
    sector: stock.sector,
    signalScore,
    hypePenalty,
    quietScore,
  };
}

/** 피드 정렬(WO 피드 강화): 브리핑 상단 → 버즈 → 회고 → 기존(지수·거시·고래). 핀(급변동일)은 그 위. */
const CONTENT_SIGNAL_SCORE: Record<DeckContentCard["contentType"], number> = {
  briefing: 72,
  buzz: 60,
  recap: 52,
  index: 42,
  macro: 38,
  whale: 34,
};
const PINNED_SCORE_BONUS = 30;

function contentCandidate(card: DeckContentCard, pinnedIds?: ReadonlySet<string>): Daily30Candidate | null {
  if (!card.headline.trim() || card.facts.length === 0) return null;
  const pinned = pinnedIds?.has(card.id) === true;
  const signalScore = CONTENT_SIGNAL_SCORE[card.contentType] + (pinned ? PINNED_SCORE_BONUS : 0);
  const hypePenalty = card.contentType === "whale" ? 6 : 2;
  return {
    kind: "content",
    id: card.id,
    card,
    assetClass: contentAssetClass(card),
    signalScore,
    hypePenalty,
    quietScore: signalScore - hypePenalty,
  };
}

function narrativeCandidate(card: DiscoveryDeckCardPayload): Daily30Candidate | null {
  if (!isNarrativeCard(card)) return null;
  const record = card as Extract<DiscoveryDeckCardPayload, { kind: "narrative" }>;
  if (!record.headline.trim() || record.stocks.length < 2) return null;
  const signalScore = 46 + Math.min(16, record.stocks.length * 3);
  const famousPenalty = record.stocks.some((stock) => FAMOUS_STOCKS.has(stock.name)) ? 20 : 0;
  return {
    kind: "narrative",
    id: record.id,
    card,
    assetClass: record.scope === "US" ? "us-stock" : "kr-stock",
    signalScore,
    hypePenalty: famousPenalty,
    quietScore: signalScore - famousPenalty,
  };
}

function addStockCandidates(
  out: Daily30Candidate[],
  discovery: DiscoveryResponse,
  seen: Set<string>
): void {
  const cards = discovery.cards?.length ? discovery.cards : discovery.stocks.map((stock) => ({ kind: "stock", ...stock }) satisfies DiscoveryDeckCardPayload);
  for (const card of cards) {
    if (isStockCard(card)) {
      const stock = card;
      const id = stockId(stock);
      if (seen.has(id)) continue;
      seen.add(id);
      const candidate = stockCandidate(stock, discovery.fronts[stock.canonical]);
      if (candidate) out.push(candidate);
      continue;
    }
    const narrative = narrativeCandidate(card);
    if (narrative && !seen.has(narrative.id)) {
      seen.add(narrative.id);
      out.push(narrative);
    }
  }
  for (const stock of discovery.stocks) {
    const id = stockId(stock);
    if (seen.has(id)) continue;
    seen.add(id);
    const candidate = stockCandidate(stock, discovery.fronts[stock.canonical]);
    if (candidate) out.push(candidate);
  }
}

function addContentCandidates(
  out: Daily30Candidate[],
  content: readonly DeckContentCard[],
  seen: Set<string>,
  pinnedIds?: ReadonlySet<string>
): void {
  for (const card of content) {
    const candidate = contentCandidate(card, pinnedIds);
    if (!candidate || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    out.push(candidate);
  }
}

export function selectDaily30Candidates(candidates: readonly Daily30Candidate[], targetCount = DAILY_CARD_TARGET): Daily30Candidate[] {
  const ranked = [...candidates].sort((a, b) => b.quietScore - a.quietScore || a.id.localeCompare(b.id));
  const selected: Daily30Candidate[] = [];
  const seen = new Set<string>();
  const assetCounts: Record<Daily30AssetClass, number> = { "kr-stock": 0, "us-stock": 0, coin: 0, macro: 0 };
  const sectorCounts = new Map<string, number>();

  const tryTake = (candidate: Daily30Candidate, enforceCaps: boolean): boolean => {
    if (seen.has(candidate.id)) return false;
    if (enforceCaps && assetCounts[candidate.assetClass] >= ASSET_CAPS[candidate.assetClass]) return false;
    if (enforceCaps && candidate.sector && (sectorCounts.get(candidate.sector) ?? 0) >= 5) return false;
    selected.push(candidate);
    seen.add(candidate.id);
    assetCounts[candidate.assetClass] += 1;
    if (candidate.sector) sectorCounts.set(candidate.sector, (sectorCounts.get(candidate.sector) ?? 0) + 1);
    return selected.length >= targetCount;
  };

  for (const candidate of ranked) {
    if (tryTake(candidate, true)) return selected;
  }
  for (const candidate of ranked) {
    if (tryTake(candidate, false)) return selected;
  }
  return selected;
}

/** 피드 표면(WO-GNB)용 콘텐츠·내러티브 최대치 — 덱 30장과 별개로 응답에 함께 싣는다. */
const FEED_CARD_LIMIT = 16;

function responseFromSelected(
  deck: readonly Daily30Candidate[],
  feed: readonly Daily30Candidate[],
  discoveries: readonly DiscoveryResponse[],
  asOf: string
): Daily30Response {
  const fronts: Record<string, DiscoveryFrontSeed> = {};
  const stocks: DiscoveryStockPayload[] = [];
  const stockById = new Map<string, DiscoveryStockPayload>();
  for (const discovery of discoveries) {
    for (const [ticker, front] of Object.entries(discovery.fronts)) fronts[ticker] = front;
  }
  for (const candidate of deck) {
    if (!candidate.stock) continue;
    if (stockById.has(candidate.id)) continue;
    stockById.set(candidate.id, candidate.stock);
    stocks.push(candidate.stock);
  }
  // cards = 덱(종목 30장) + 피드(콘텐츠·내러티브). 클라가 표면별로 필터: 메인=stock, 피드=content/narrative.
  const all = [...deck, ...feed];
  const assetCounts: Record<Daily30AssetClass, number> = { "kr-stock": 0, "us-stock": 0, coin: 0, macro: 0 };
  for (const candidate of all) assetCounts[candidate.assetClass] += 1;
  return {
    asOf,
    country: "all",
    stocks,
    cards: all.map((candidate) => candidate.card),
    fronts,
    confidence: deck.length >= DAILY_CARD_TARGET ? "H" : deck.length >= 20 ? "M" : "L",
    source: "KR/US discovery·수급·내부자·거래량·고래·매크로 통합 quietScore",
    meta: {
      targetCount: DAILY_CARD_TARGET,
      cards: all.map((candidate) => ({
        id: candidate.id,
        assetClass: candidate.assetClass,
        quietScore: Number(candidate.quietScore.toFixed(2)),
        signalScore: Number(candidate.signalScore.toFixed(2)),
        hypePenalty: Number(candidate.hypePenalty.toFixed(2)),
      })),
      assetCounts,
    },
  };
}

export async function buildDaily30Response(): Promise<Daily30Response> {
  const [kr, us, coin, rawContent, feedContent] = await Promise.all([
    buildDiscoveryResponse({ country: "KR", targetedMaterial: true, targetedMaterialLimit: 36 }),
    buildDiscoveryResponse({ country: "US", targetedMaterial: true, targetedMaterialLimit: 12 }),
    // 코인(WO Phase C) — Upbit 캐시 발굴. 신호 없으면 stocks 0(쿼터 강제 없음 — 정직).
    buildCoinDiscoveryResponse().catch(
      (): DiscoveryResponse => ({ asOf: "", stocks: [], fronts: {}, confidence: "L", source: "coin unavailable" })
    ),
    fetchDeckContentCards().catch(() => [] as DeckContentCard[]),
    // 피드 강화(WO) — 브리핑·버즈·회고. 크론이 채운 캐시만 읽는다(외부 fetch 0).
    readTodayFeedContent().catch((): TodayFeedContent => ({ cards: [], pinnedIds: new Set() })),
  ]);
  // MARKET NOTE 해석 1줄(WO — 숫자만 금지): 국내 지수 카드에 섹터 펄스(실데이터) 주입.
  const enrichedRawContent = feedContent.indexNote
    ? rawContent.map((card) =>
        card.contentType === "index" && card.scope === "domestic" && !card.note
          ? { ...card, note: feedContent.indexNote! }
          : card
      )
    : rawContent;
  const content = [
    ...feedContent.cards,
    ...expandDeckContentCardsForScope(enrichedRawContent, "domestic", 3),
    ...expandDeckContentCardsForScope(enrichedRawContent, "world", 3),
    ...expandDeckContentCardsForScope(enrichedRawContent, "global", 2),
  ];
  const candidates: Daily30Candidate[] = [];
  const seen = new Set<string>();
  addStockCandidates(candidates, kr, seen);
  addStockCandidates(candidates, us, seen);
  addStockCandidates(candidates, coin, seen);
  addContentCandidates(candidates, content, seen, feedContent.pinnedIds);

  // WO-GNB 두 표면 분리: 덱 = 종목 30장(내러티브·콘텐츠 제외), 피드 = 콘텐츠·내러티브(중요도순).
  const stockCandidates = candidates.filter((c) => c.kind === "stock");
  const feedCandidates = candidates
    .filter((c) => c.kind === "content" || c.kind === "narrative")
    .sort((a, b) => b.quietScore - a.quietScore || a.id.localeCompare(b.id))
    .slice(0, FEED_CARD_LIMIT);
  const deck = selectDaily30Candidates(stockCandidates, DAILY_CARD_TARGET);
  return responseFromSelected(deck, feedCandidates, [kr, us, coin], kr.asOf > us.asOf ? kr.asOf : us.asOf);
}
