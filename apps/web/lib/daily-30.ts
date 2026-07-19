import { unstable_cache } from "next/cache";
import { isDiscoveryCopySafe, withCompanyQuietScore } from "@fomo/core";
import type { CardFrontSignals, StockCountry } from "@fomo/core";
import { cacheVersion, kstDate as kstDateOf } from "./fomo";
import { parsePriceText } from "./quote-prices";
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
import {
  readDaily30ResponseFromLedger,
  readLatestSelectionSnapshotBefore,
  writeDaily30Ledger,
} from "./judgment-ledger";
import type { PublishedCommitteeSnapshot } from "./expert-review-store";

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
    /** 어제 30장 대비 종목 중복률(0~1) — 신선도 수용 지표(≤0.5). */
    repeatRatio?: number;
    /** 2026-07-12 US 파이프라인 진단(임시) + 원인 설명률(WO 뎁스 재건 E) causeCoverage. */
    debug?: Record<string, number | { movers: number; explained: number; ratio: number }>;
    /** 일일 전문가 위원회 승인 정보. 없으면 아직 위원회 발행 전인 레거시 응답이다. */
    committee?: {
      runId: string;
      version: string;
      reviewedAt: string;
      candidateCount: number;
      selectedCount: number;
      callCount: number;
    };
    /** 위원회 미발행 시 사용한 비상 공급 경로. 정상 발행본에는 없다. */
    stale?: "committee-yesterday" | "engine-direct";
  };
}

type CandidateKind = "stock" | "content" | "narrative";

export interface Daily30Candidate {
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

/** 소프트 목표(WO 미장·코인 확충): KR ~15 / US 8~10 / 코인 3~5 — 쿼터 강제가 아니라 풀 확대로 자연 도달. */
const ASSET_CAPS: Record<Daily30AssetClass, number> = {
  "kr-stock": 15,
  "us-stock": 12,
  coin: 5,
  macro: 6,
};
// 2026-07-12 프로덕션 미장 1장 사고: KR이 quietScore 상위를 독식해(2패스 캡 완화 시 KR 24장)
// 미장·코인이 굶었다. 자산군 최소 바닥 — 미장 탭이 비지 않도록 US를 우선 확보한다.
// (후보가 바닥보다 적으면 있는 만큼만 — 억지 생성 없음. 코인 5=캡과 동일.)
const ASSET_FLOORS: Partial<Record<Daily30AssetClass, number>> = {
  "us-stock": 8,
  coin: 5,
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
  // 카피 세이프(클라와 동일 패턴, @fomo/core 단일 원본) — 오염 카드 1장이 클라에서
  // 덱 30장 전체를 무효 처리한 사고(SKAI "TSID와" 실측) 재발 방지. 탈락분은 다음 후보가 채운다.
  const copyFields = [stock.canonical, stock.headline, stock.whyShown, stock.reason, stock.insightTag, stock.sourceLabel];
  for (const field of copyFields) {
    if (typeof field === "string" && field.trim() && !isDiscoveryCopySafe(field)) return false;
  }
  return true;
}

/**
 * 신선도 로테이션(WO 미장·코인 확충) — 어제 30장 스냅샷 대비:
 * 같은 종목·같은 문구 → **최후순위 폴백**(신선한 후보가 항상 이기고, 30장을 못 채울 때만 재노출).
 * 같은 종목·다른 문구(신호 갱신) → 감점만(연속 등장은 갱신된 신호일 때만 정당).
 *
 * ⚠️ 하드 제외 금지: 주말·휴장일엔 시세·재료가 안 바뀌어 문구가 같을 수밖에 없는데,
 * 제외해버리면 덱이 마른다(프로덕션 실측 30→20 붕괴). "30장 유지"가 신선도보다 우선.
 */
export interface FreshnessSnapshot {
  /** canonical → 어제 헤드라인. */
  headlines: Map<string, string>;
}
const STALE_REPEAT_PENALTY = 8;
/** 이틀 연속 같은 문구 — 순위를 바닥으로 보내되 후보에서 빼지 않는다(30장 채움 폴백). */
const STALE_REPEAT_FLOOR = -1000;

function normalizeHeadline(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

export function stockCandidate(
  stock: DiscoveryStockPayload,
  front: DiscoveryFrontSeed | undefined,
  freshness?: FreshnessSnapshot
): Daily30Candidate | null {
  if (!meetsCardStandard(stock, front)) return null;
  // 유명주 강신호 게이트는 국장 발굴 정체성 전용 — 미장은 "시총 높은·아는 기업"이 제품(2026-07-12).
  if (stock.country !== "US" && FAMOUS_STOCKS.has(stock.canonical) && !strongQuietSignal(stock)) return null;
  const yesterdayHeadline = freshness?.headlines.get(stock.canonical);
  const repeatStale =
    typeof yesterdayHeadline === "string" && normalizeHeadline(yesterdayHeadline) === normalizeHeadline(stock.headline);
  const signalScore = computeStockSignal(stock, front);
  const hypePenalty =
    computeHypePenalty(stock, front) + (typeof yesterdayHeadline === "string" ? STALE_REPEAT_PENALTY : 0);
  let quietScore = signalScore - hypePenalty;
  if (!repeatStale && quietScore < 6) return null;
  if (repeatStale) quietScore = STALE_REPEAT_FLOOR + quietScore; // 신선 후보가 전부 소진된 뒤에만 뽑힘
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
  "macro-issue": 48,
  index: 42,
  macro: 38,
  whale: 34,
  // 2026-07-11 베리에이션 — 피드 전용 타입(덱 합류 없음)이지만 Record 완결성 유지.
  "coin-issue": 44,
  "hot-issue": 58,
  term: 20,
  event: 46,
  "daily-receipt": 66, // 후회 영수증 = 데일리 습관 훅(브리핑 다음). 덱 합류 없음(피드 전용)
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
  seen: Set<string>,
  freshness?: FreshnessSnapshot
): void {
  const cards = discovery.cards?.length ? discovery.cards : discovery.stocks.map((stock) => ({ kind: "stock", ...stock }) satisfies DiscoveryDeckCardPayload);
  for (const card of cards) {
    if (isStockCard(card)) {
      const stock = card;
      const id = stockId(stock);
      if (seen.has(id)) continue;
      seen.add(id);
      const candidate = stockCandidate(stock, discovery.fronts[stock.canonical], freshness);
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
    const candidate = stockCandidate(stock, discovery.fronts[stock.canonical], freshness);
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

  // 0) 자산군 최소 바닥 — KR 독식 방지(2026-07-12 미장 1장 사고). 바닥은 자산군 캡을 우선하되
  //    섹터 과밀 캡은 존중. 있는 후보만큼만 채운다(억지 생성 없음).
  for (const [assetClass, floor] of Object.entries(ASSET_FLOORS) as Array<[Daily30AssetClass, number]>) {
    let taken = 0;
    for (const candidate of ranked) {
      if (taken >= floor) break;
      if (candidate.assetClass !== assetClass || seen.has(candidate.id)) continue;
      if (candidate.sector && (sectorCounts.get(candidate.sector) ?? 0) >= 5) continue;
      const full = tryTake(candidate, false);
      taken += 1;
      if (full) return selected;
    }
  }
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
  asOf: string,
  targetCount = DAILY_CARD_TARGET
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
    const current = fronts[candidate.stock.canonical];
    if (current) {
      fronts[candidate.stock.canonical] = {
        ...current,
        companyScore: withCompanyQuietScore(
          current.companyScore,
          {
            quietScore: candidate.quietScore,
            signalScore: candidate.signalScore,
            hypePenalty: candidate.hypePenalty,
          },
          asOf
        ),
      };
    }
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
      targetCount,
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

interface Daily30PicksSnapshot {
  date: string;
  // R1 후회 영수증(2026-07-12): 발견가·식별자 추가 — 다음날 "어제의 영수증"이 발견가 대비 성과를
  // 계산한다(전향적, 소급 조작 없음). 구버전 스냅샷(price 없음)은 영수증에서 자연 제외.
  picks: Array<{ canonical: string; headline?: string; price?: number; symbol?: string; naverCode?: string; market?: string; country?: string }>;
}

/** 어제(가장 최근, 오늘 제외) 원장 선정분 — 신선도 로테이션 기준. 없으면 빈 맵(첫날). */
async function readYesterdayPicks(today: string): Promise<FreshnessSnapshot> {
  const yesterday = await readLatestSelectionSnapshotBefore(today).catch(() => []);
  const headlines = new Map<string, string>();
  for (const pick of yesterday) {
    if (pick.subject.canonical) headlines.set(pick.subject.canonical, pick.payload.headline ?? "");
  }
  return { headlines };
}

export interface Daily30BuildOptions {
  targetCount?: number;
  persistPicks?: boolean;
}

export async function buildDaily30ResponseWithOptions(options: Daily30BuildOptions = {}): Promise<Daily30Response> {
  const targetCount = Math.max(1, Math.min(50, options.targetCount ?? DAILY_CARD_TARGET));
  const persistPicks = options.persistPicks ?? true;
  const today = kstDateOf();
  const [kr, us, coin, rawContent, feedContent, freshness] = await Promise.all([
    buildDiscoveryResponse({ country: "KR", targetedMaterial: true, targetedMaterialLimit: 36, allowAiSynthesis: false }),
    buildDiscoveryResponse({ country: "US", targetedMaterial: true, targetedMaterialLimit: 16, allowAiSynthesis: false }),
    // 코인(WO 미장·코인 확충) — 시총 상위 30 커버리지. 신호 없으면 stocks 0(쿼터 강제 없음 — 정직).
    buildCoinDiscoveryResponse().catch(
      (): DiscoveryResponse => ({ asOf: "", stocks: [], fronts: {}, confidence: "L", source: "coin unavailable" })
    ),
    fetchDeckContentCards().catch(() => [] as DeckContentCard[]),
    // 피드 강화(WO) — 브리핑·버즈·회고. 크론이 채운 캐시만 읽는다(외부 fetch 0).
    readTodayFeedContent().catch((): TodayFeedContent => ({ cards: [], pinnedIds: new Set() })),
    readYesterdayPicks(kstDateOf()),
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
  addStockCandidates(candidates, kr, seen, freshness);
  addStockCandidates(candidates, us, seen, freshness);
  addStockCandidates(candidates, coin, seen, freshness);
  addContentCandidates(candidates, content, seen, feedContent.pinnedIds);

  // WO-GNB 두 표면 분리: 덱 = 종목 30장(내러티브·콘텐츠 제외), 피드 = 콘텐츠·내러티브(중요도순).
  const stockCandidates = candidates.filter((c) => c.kind === "stock");
  const feedCandidates = candidates
    .filter((c) => c.kind === "content" || c.kind === "narrative")
    .sort((a, b) => b.quietScore - a.quietScore || a.id.localeCompare(b.id))
    .slice(0, FEED_CARD_LIMIT);
  const deck = selectDaily30Candidates(stockCandidates, targetCount);

  // 신선도 스냅샷 저장 — 내일 빌드의 로테이션 기준. 실패해도 응답은 정상(fail-open).
  const picks: Daily30PicksSnapshot = {
    date: today,
    picks: deck
      .filter((c) => c.stock)
      .map((c) => {
        const stock = c.stock!;
        const price = parsePriceText(c.front?.priceText);
        return {
          canonical: stock.canonical,
          ...(stock.headline ? { headline: stock.headline } : {}),
          ...(typeof price === "number" ? { price } : {}),
          ...(stock.symbol ? { symbol: stock.symbol } : {}),
          ...(stock.naverCode ? { naverCode: stock.naverCode } : {}),
          ...(stock.market ? { market: stock.market } : {}),
          ...(stock.country ? { country: stock.country } : {}),
        };
      }),
  };
  // 중복률(어제 대비) — 수용 지표(≤50%) 모니터링용.
  const repeatCount = picks.picks.filter((p) => freshness.headlines.has(p.canonical)).length;
  const repeatRatio = picks.picks.length > 0 ? Math.round((repeatCount / picks.picks.length) * 100) / 100 : 0;

  const response = responseFromSelected(
    deck,
    feedCandidates,
    [kr, us, coin],
    kr.asOf > us.asOf ? kr.asOf : us.asOf,
    targetCount
  );
  // 2026-07-12 진단: US 파이프라인 각 단계 카운트 — 미장 1장 원인이 discovery/후보/셀렉션 어디인지.
  // 원인 설명률(WO 뎁스 재건 E — 해자의 측정): ±3% 무버 중 원인(원문 연결·재료 서술)이 붙은 비율.
  // 북극성 지표 ≥0.9 — 급등락 카드를 눌렀을 때 열에 아홉은 답이 있어야 BM을 붙일 자격이 생긴다.
  const movers = deck.filter((c) => {
    const change = frontSignals(c.front).changePct;
    return !!c.stock && typeof change === "number" && Math.abs(change) >= 3;
  });
  const explainedMovers = movers.filter((c) => {
    const s = c.stock!;
    return (
      Boolean(s.sourceUrl) ||
      /공시|실적|계약|수주|투자|증자|자사주|인수|합병|승인|허가|매출|가이던스|발표|보도|리포트|임상|매수|매도|배당|출시/.test(signalText(s))
    );
  });
  const causeCoverage = {
    movers: movers.length,
    explained: explainedMovers.length,
    ratio: movers.length > 0 ? Math.round((explainedMovers.length / movers.length) * 100) / 100 : 1,
  };
  if (causeCoverage.ratio < 0.9) {
    console.warn("[daily-30] 원인 설명률 미달", JSON.stringify({ ...causeCoverage, unexplained: movers.filter((c) => !explainedMovers.includes(c)).map((c) => c.stock!.canonical) }));
  }
  const debug = {
    usDiscoveryCards: (us.cards?.length ?? us.stocks.length),
    usStockCandidates: stockCandidates.filter((c) => c.assetClass === "us-stock").length,
    usDeck: deck.filter((c) => c.assetClass === "us-stock").length,
    krStockCandidates: stockCandidates.filter((c) => c.assetClass === "kr-stock").length,
    causeCoverage,
  };
  // 소스 장애 가드(fail-closed, WO-21 원칙) — 2026-07-17 실사고: 네이버 egress 장애 중 빌드가
  // KR 0장 덱을 12h 캐시에 박았다. KR 시세는 시총 리스트라 휴장일에도 0이 될 수 없다 —
  // 0이면 소스 장애로 보고 빌드를 실패시켜 캐시 오염을 막는다(다음 요청이 재시도).
  if (debug.krStockCandidates === 0) {
    throw new Error("daily-30 build aborted: KR 후보 0 — 시세 소스 장애 의심, 캐시 오염 방지");
  }
  const finalized = { ...response, meta: { ...response.meta, repeatRatio, debug } };
  // WO-M1: daily30-picks 업서트는 폐기했다. 선정·신호·판단·점수를 append-only 원장에 한 번만 남긴다.
  if (persistPicks) {
    await writeDaily30Ledger(finalized, "engine");
  }
  return finalized;
}

export async function buildDaily30Response(): Promise<Daily30Response> {
  return buildDaily30ResponseWithOptions();
}

/**
 * 위원회 크론 입력. 공개 요청에서 호출하지 않는다.
 * 기존 결정론 품질 게이트·quietScore·자산군 보정을 그대로 쓰되 편집장이 고를 여유 후보만 50장까지 만든다.
 */
export async function buildDaily30CandidatePoolResponse(targetCount = 50): Promise<Daily30Response> {
  return buildDaily30ResponseWithOptions({ targetCount, persistPicks: false });
}

export function daily30CardCount(response: Daily30Response | null | undefined): number {
  if (!response) return 0;
  return Math.max(response.cards?.length ?? 0, response.stocks?.length ?? 0);
}

function withFallbackMeta(
  response: Daily30Response,
  stale: NonNullable<Daily30Response["meta"]["stale"]>
): Daily30Response {
  return { ...response, meta: { ...response.meta, stale } };
}

export interface Daily30FallbackDependencies {
  today?: string;
  readToday?: () => Promise<PublishedCommitteeSnapshot | Daily30Response | null>;
  readRecent?: (today: string, maxAgeDays: number) => Promise<PublishedCommitteeSnapshot | Daily30Response | null>;
  buildDirect?: () => Promise<Daily30Response>;
}

function storedDaily30Response(value: PublishedCommitteeSnapshot | Daily30Response): Daily30Response {
  return "response" in value ? value.response : value;
}

function storedDaily30Date(value: PublishedCommitteeSnapshot | Daily30Response): string {
  return "report" in value ? value.report.date : value.asOf.slice(0, 10);
}

function dateMinusDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

/**
 * 공개 요청의 공급 체인. 위원회 장애는 사용자 장애로 전파하지 않고 최근 승인본,
 * 결정론 엔진 순서로 격리한다. 20장 미만 응답은 빈 덱과 동일하게 다음 단계로 넘긴다.
 */
export async function resolveDaily30Response(
  dependencies: Daily30FallbackDependencies = {}
): Promise<Daily30Response> {
  const today = dependencies.today ?? kstDateOf();
  const readToday = dependencies.readToday ?? (() => readDaily30ResponseFromLedger({ date: today }));
  const readRecent = dependencies.readRecent ?? ((date, maxAgeDays) =>
    readDaily30ResponseFromLedger({ fromDate: dateMinusDays(date, maxAgeDays) }));
  const buildDirect =
    dependencies.buildDirect ?? (() => buildDaily30ResponseWithOptions({ targetCount: DAILY_CARD_TARGET }));

  const active = await readToday().catch((error) => {
    console.warn("[daily-30] active committee snapshot unavailable", (error as Error)?.message);
    return null;
  });
  if (active && storedDaily30Date(active) === today && daily30CardCount(storedDaily30Response(active)) >= 20) {
    return storedDaily30Response(active);
  }

  const recent = await readRecent(today, 3).catch((error) => {
    console.warn("[daily-30] recent committee snapshot unavailable", (error as Error)?.message);
    return null;
  });
  if (recent && storedDaily30Date(recent) !== today && daily30CardCount(storedDaily30Response(recent)) >= 20) {
    return withFallbackMeta(storedDaily30Response(recent), "committee-yesterday");
  }

  const direct = await buildDirect();
  const directCount = daily30CardCount(direct);
  if (directCount >= 20) return withFallbackMeta(direct, "engine-direct");
  throw new Error(`daily-30 fallback exhausted: engine produced ${directCount}/20 cards`);
}

/**
 * 공유 캐시 getter — daily-30 라우트와 feed-hub 가 같은 캐시 엔트리를 쓴다(중복 빌드 방지).
 * feed-content 크론이 tags 로 즉시 무효화한다.
 */
export async function getCachedDaily30Response(): Promise<Daily30Response> {
  const load = unstable_cache(
    resolveDaily30Response,
    ["fomo-daily-30-approved", cacheVersion(), kstDateOf()],
    { revalidate: 60 * 5, tags: ["daily-30"] }
  );
  return load();
}
