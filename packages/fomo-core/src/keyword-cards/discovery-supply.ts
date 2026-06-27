import type { StockCountry, StockMarket } from "./stocks";

export type DiscoveryMarket = Extract<StockMarket, "KOSPI" | "KOSDAQ" | "NASDAQ" | "NYSE">;

export type DiscoveryEventKind =
  | "price_move"
  | "new_high"
  | "volume_spike"
  | "flow_entry"
  | "news_mention"
  | "disclosure"
  | "theme_link"
  | "market_context";

export interface DiscoveryEvent {
  kind: DiscoveryEventKind;
  firstSeen: boolean;
  strength: number;
  source: string;
  asOf: string;
  confidence: "L" | "M" | "H";
  label?: string;
  direction?: "up" | "down" | "flat";
}

export interface DiscoveryCandidate {
  ticker: string;
  market: DiscoveryMarket;
  country?: StockCountry;
  naverCode?: string;
  sector?: string;
  events: DiscoveryEvent[];
  asOf: string;
  reason?: string;
  marquee?: boolean;
  marketCapRank?: number;
}

export type DiscoveryRelationKind = "customer" | "supplier" | "material" | "peer" | "beneficiary";

export interface DiscoveryThemeBundleItem {
  ticker: string;
  label: string;
  market: DiscoveryMarket;
  country?: StockCountry;
  sector?: string;
  relation: DiscoveryRelationKind;
  reason: string;
  source: string;
  confidence: "L" | "M" | "H";
  changePct?: number;
  naverCode?: string;
  symbol?: string;
}

export interface DiscoveryThemeBundleCard {
  kind: "theme_bundle";
  id: string;
  title: string;
  subtitle: string;
  source: string;
  asOf: string;
  confidence: "L" | "M" | "H";
  anchorTicker: string;
  relation: "event_bundle";
  items: DiscoveryThemeBundleItem[];
}

export interface UniverseStock {
  ticker: string;
  riskFlags?: readonly string[];
  avgTradingValue20d?: number;
}

export interface EligibleUniverseOptions {
  liquidityMedianRatioCut?: number;
}

export interface SeenRecord {
  ticker: string;
  daysAgo: number;
}

export interface RankDiscoveryOptions {
  maxCandidates?: number;
  seen?: readonly SeenRecord[];
  watched?: readonly string[];
}

export const DISCOVERY_MAX_CANDIDATES = 100;
export const DISCOVERY_LIQUIDITY_MEDIAN_RATIO_CUT = 0.1;
export const DISCOVERY_SEEN_DECAY_DAYS = 3;
export const DISCOVERY_TOP_BAND_EVENT_REQUIRED = 10;
export const DISCOVERY_TOP_BAND_WHY_REQUIRED = DISCOVERY_TOP_BAND_EVENT_REQUIRED;
export const DISCOVERY_WEAK_MIN_STRENGTH = 0.85;
export const DISCOVERY_FAME_MAX_PENALTY = 0.5;
export const DISCOVERY_FAME_RANK_FLOOR = 120;
export const DISCOVERY_AWAKENING_MAX_BOOST = 0.3;
export const DISCOVERY_DIR_DOWN_NOISE_PENALTY = 0.5;
export const DISCOVERY_DIR_DOWN_MATERIAL_PENALTY = 0.15;
export const DISCOVERY_STRENGTH_WEIGHT = 0.65;
export const DISCOVERY_FAMOUS_FRONT_RANK_CUTOFF = 30;
export const DISCOVERY_FAMOUS_FRONT_BAND_SIZE = 16;
export const DISCOVERY_FAMOUS_DECK_MIX_COUNT = 4;
export const DISCOVERY_AWAKENING_RANK_MIN = 150;

const RISK_FLAG_PATTERN = /관리|투자경고|투자위험|거래정지|단기과열|이상급등/;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function median(values: number[]): number | undefined {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function eligibleUniverse(
  stocks: readonly UniverseStock[],
  opts: EligibleUniverseOptions = {}
): UniverseStock[] {
  const ratioCut = opts.liquidityMedianRatioCut ?? DISCOVERY_LIQUIDITY_MEDIAN_RATIO_CUT;
  const med = median(stocks.map((s) => s.avgTradingValue20d ?? 0));
  const liquidityCut = med ? med * ratioCut : undefined;
  return stocks.filter((stock) => {
    if (stock.riskFlags?.some((flag) => RISK_FLAG_PATTERN.test(flag))) return false;
    if (liquidityCut && typeof stock.avgTradingValue20d === "number" && stock.avgTradingValue20d < liquidityCut) {
      return false;
    }
    return true;
  });
}

export function hasPublicMaterialEvent(candidate: DiscoveryCandidate): boolean {
  return candidate.events.some((event) => isCurrentDeckEvent(event, candidate) && isMaterialEvent(event));
}

function isConstructiveThemeEvent(event: DiscoveryEvent): boolean {
  return event.kind === "theme_link" && event.direction !== "down" && event.direction !== "flat";
}

export function hasThemeLinkEvent(candidate: DiscoveryCandidate): boolean {
  return candidate.events.some((event) => isCurrentDeckEvent(event, candidate) && isConstructiveThemeEvent(event));
}

function sameDay(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

function isCurrentDeckEvent(event: DiscoveryEvent, candidate: DiscoveryCandidate): boolean {
  return sameDay(event.asOf, candidate.asOf);
}

function isMaterialEvent(event: DiscoveryEvent): boolean {
  return (
    event.kind === "disclosure" ||
    event.kind === "news_mention" ||
    event.kind === "flow_entry" ||
    event.kind === "new_high"
  );
}

function isLinkedNewsEvent(event: DiscoveryEvent): boolean {
  return event.kind === "news_mention" && /종목뉴스\s?연결/i.test(event.source);
}

function isDisplayVolumeEvent(event: DiscoveryEvent): boolean {
  return event.kind === "volume_spike" && event.firstSeen && event.direction !== "down" && event.direction !== "flat";
}

export function isDeckDisplayEvent(event: DiscoveryEvent, candidate: DiscoveryCandidate): boolean {
  if (!isCurrentDeckEvent(event, candidate)) return false;
  return isMaterialEvent(event) || isConstructiveThemeEvent(event) || isDisplayVolumeEvent(event);
}

export function hasDeckDisplayEvent(candidate: DiscoveryCandidate): boolean {
  return candidate.events.some((event) => isDeckDisplayEvent(event, candidate));
}

export function hasDisplayWhyEvent(candidate: DiscoveryCandidate): boolean {
  return hasDeckDisplayEvent(candidate);
}

export function isDiscoveryAwakening(candidate: DiscoveryCandidate): boolean {
  const rank = candidate.marketCapRank;
  if (typeof rank === "number" && Number.isFinite(rank) && rank > 0 && rank < DISCOVERY_AWAKENING_RANK_MIN) {
    return false;
  }
  return candidate.events.some(
    (event) =>
      isCurrentDeckEvent(event, candidate) &&
      event.firstSeen &&
      event.direction !== "down" &&
      (event.kind === "volume_spike" || event.kind === "flow_entry" || event.kind === "disclosure")
  );
}

export function isWeakDiscoveryCandidate(candidate: DiscoveryCandidate): boolean {
  return !hasDeckDisplayEvent(candidate);
}

const WHY_KIND_PRIORITY: Record<DiscoveryEventKind, number> = {
  disclosure: 0,
  news_mention: 1,
  flow_entry: 2,
  theme_link: 3,
  new_high: 4,
  volume_spike: 5,
  price_move: 6,
  market_context: 99,
};

function eventTimePrefix(event: DiscoveryEvent, candidate: DiscoveryCandidate): "오늘" | "최근" {
  return event.asOf.slice(0, 10) === candidate.asOf.slice(0, 10) ? "오늘" : "최근";
}

export function discoveryWhy(candidate: DiscoveryCandidate): string {
  const displayEvents = candidate.events.filter((event) => isDeckDisplayEvent(event, candidate));
  const strongest = displayEvents.sort(
    (a, b) => WHY_KIND_PRIORITY[a.kind] - WHY_KIND_PRIORITY[b.kind] || b.strength - a.strength || a.kind.localeCompare(b.kind)
  )[0];
  if (!strongest) return "오늘 확인된 사건이 아직 없어요.";
  if (strongest.kind === "disclosure") {
    const prefix = eventTimePrefix(strongest, candidate);
    return strongest.label
      ? `${prefix} ${strongest.label}`
      : `${prefix} 이 종목의 공시가 확인됐어요.`;
  }
  if (strongest.kind === "news_mention") {
    const prefix = eventTimePrefix(strongest, candidate);
    return strongest.label
      ? `${prefix} ${strongest.label}`
      : `${prefix} 이 종목을 직접 언급한 뉴스가 있어요.`;
  }
  if (strongest.kind === "flow_entry") return strongest.label ?? "수급이 새로 감지된 종목이에요.";
  if (strongest.kind === "new_high") return strongest.label ?? "새로운 가격 위치가 확인된 종목이에요.";
  if (strongest.kind === "volume_spike") {
    return strongest.label ?? "오늘 거래량이 새로 늘었어요.";
  }
  return strongest.label ?? "오늘 가격 움직임이 커졌고, 뚜렷한 공개 재료는 확인 안 됨.";
}

function freshnessBoost(candidate: DiscoveryCandidate): number {
  return candidate.events.some((event) => event.firstSeen) ? 0.16 : 0;
}

export function famePenalty(rank?: number): number {
  if (typeof rank !== "number" || !Number.isFinite(rank) || rank <= 0) return 0;
  const fameRatio = clamp01((DISCOVERY_FAME_RANK_FLOOR - Math.min(rank, DISCOVERY_FAME_RANK_FLOOR)) / DISCOVERY_FAME_RANK_FLOOR);
  return -DISCOVERY_FAME_MAX_PENALTY * fameRatio;
}

export function awakeningBoost(candidate: DiscoveryCandidate): number {
  if (!candidate.events.some((event) => event.firstSeen)) return 0;
  const rank = candidate.marketCapRank;
  const obscure =
    typeof rank === "number" && Number.isFinite(rank)
      ? clamp01((Math.min(rank, 300) - 80) / 220)
      : 0.4;
  return DISCOVERY_AWAKENING_MAX_BOOST * obscure;
}

export function directionPenalty(candidate: DiscoveryCandidate): number {
  const hasDownShapeEvent = candidate.events.some(
    (event) =>
      event.direction === "down" &&
      (event.kind === "price_move" || event.kind === "volume_spike" || event.kind === "market_context" || event.kind === "theme_link")
  );
  if (!hasDownShapeEvent) return 0;
  return hasPublicMaterialEvent(candidate) ? -DISCOVERY_DIR_DOWN_MATERIAL_PENALTY : -DISCOVERY_DIR_DOWN_NOISE_PENALTY;
}

function eventScore(candidate: DiscoveryCandidate): number {
  const displayEvents = candidate.events.filter((event) => isDeckDisplayEvent(event, candidate));
  const scoreEvents = displayEvents.length > 0 ? displayEvents : candidate.events;
  const maxStrength = Math.max(0, ...scoreEvents.map((event) => clamp01(event.strength)));
  const diversity = new Set(scoreEvents.map((event) => event.kind)).size;
  const materialBoost = hasPublicMaterialEvent(candidate) ? 0.22 : hasThemeLinkEvent(candidate) ? 0.08 : hasDisplayWhyEvent(candidate) ? -0.03 : -0.25;
  return (
    DISCOVERY_STRENGTH_WEIGHT * maxStrength +
    freshnessBoost(candidate) +
    Math.min(0.12, diversity * 0.03) +
    materialBoost +
    famePenalty(candidate.marketCapRank) +
    awakeningBoost(candidate) +
    directionPenalty(candidate)
  );
}

function eventTier(candidate: DiscoveryCandidate): number {
  const displayEvents = candidate.events.filter((event) => isDeckDisplayEvent(event, candidate));
  if (displayEvents.some((event) => isMaterialEvent(event) && !isLinkedNewsEvent(event))) return 0;
  if (displayEvents.some(isLinkedNewsEvent)) return 1;
  if (displayEvents.some((event) => event.kind === "volume_spike")) return 1;
  return 9;
}

function fameTier(candidate: DiscoveryCandidate): number {
  if (candidate.marquee) return 1;
  const rank = candidate.marketCapRank;
  if (typeof rank === "number" && Number.isFinite(rank) && rank > 0 && rank <= DISCOVERY_FAMOUS_FRONT_RANK_CUTOFF) return 1;
  return 0;
}

function seenPenalty(ticker: string, seen: readonly SeenRecord[], watched: ReadonlySet<string>): number {
  if (watched.has(ticker)) return 0;
  const row = seen.find((s) => s.ticker === ticker);
  if (!row || row.daysAgo >= DISCOVERY_SEEN_DECAY_DAYS) return 0;
  const left = DISCOVERY_SEEN_DECAY_DAYS - Math.max(0, row.daysAgo);
  return (left / DISCOVERY_SEEN_DECAY_DAYS) * 0.3;
}

interface RankedDiscoveryRow {
  candidate: DiscoveryCandidate;
  index: number;
  score: number;
  tier: number;
  fameTier: number;
}

function mixFamousRowsIntoDeck(sorted: readonly RankedDiscoveryRow[], max: number): RankedDiscoveryRow[] {
  const deck = sorted.slice(0, max);
  const frontBand = Math.min(DISCOVERY_FAMOUS_FRONT_BAND_SIZE, max);
  const used = new Set(deck.map((row) => row.candidate.ticker));
  const famousRows = sorted
    .filter((row) => row.fameTier === 1 && !used.has(row.candidate.ticker))
    .slice(0, DISCOVERY_FAMOUS_DECK_MIX_COUNT);

  for (const famous of famousRows) {
    for (let i = deck.length - 1; i >= frontBand; i -= 1) {
      const current = deck[i];
      if (!current || current.fameTier === 1) continue;
      used.delete(current.candidate.ticker);
      deck[i] = famous;
      used.add(famous.candidate.ticker);
      break;
    }
  }

  for (let i = 0; i < Math.min(frontBand, deck.length); i += 1) {
    if (deck[i]?.fameTier !== 1) continue;
    const replacement = deck.findIndex((row, index) => index >= frontBand && row.fameTier !== 1);
    if (replacement < 0) break;
    const current = deck[i]!;
    deck[i] = deck[replacement]!;
    deck[replacement] = current;
  }

  return deck;
}

export function rankDiscoveryCandidates(
  candidates: readonly DiscoveryCandidate[],
  opts: RankDiscoveryOptions = {}
): DiscoveryCandidate[] {
  const max = opts.maxCandidates ?? DISCOVERY_MAX_CANDIDATES;
  const watched = new Set(opts.watched ?? []);
  const sorted = candidates
    .filter(hasDeckDisplayEvent)
    .map((candidate, index) => ({
      candidate,
      index,
      score: eventScore(candidate) - seenPenalty(candidate.ticker, opts.seen ?? [], watched),
      tier: eventTier(candidate),
      fameTier: fameTier(candidate),
    }))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        Number(hasDisplayWhyEvent(b.candidate)) - Number(hasDisplayWhyEvent(a.candidate)) ||
        b.score - a.score ||
        Number(hasPublicMaterialEvent(b.candidate)) - Number(hasPublicMaterialEvent(a.candidate)) ||
        a.index - b.index ||
        a.candidate.ticker.localeCompare(b.candidate.ticker)
    );
  return mixFamousRowsIntoDeck(sorted, max)
    .map((row) => row.candidate);
}
