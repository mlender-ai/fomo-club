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
export const DISCOVERY_TOP_BAND_WHY_REQUIRED = 30;
export const DISCOVERY_WEAK_MIN_STRENGTH = 0.85;

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
  return candidate.events.some((event) =>
    event.kind === "disclosure" || event.kind === "news_mention" || event.kind === "flow_entry" || event.kind === "new_high"
  );
}

export function hasThemeLinkEvent(candidate: DiscoveryCandidate): boolean {
  return candidate.events.some((event) => event.kind === "theme_link");
}

export function hasDisplayWhyEvent(candidate: DiscoveryCandidate): boolean {
  return hasPublicMaterialEvent(candidate) || candidate.events.some((event) => event.kind === "theme_link");
}

export function isWeakDiscoveryCandidate(candidate: DiscoveryCandidate): boolean {
  return !hasDisplayWhyEvent(candidate) && candidate.events.every((event) => event.kind === "price_move" || event.kind === "volume_spike" || event.kind === "market_context");
}

const WHY_KIND_PRIORITY: Record<DiscoveryEventKind, number> = {
  disclosure: 0,
  news_mention: 1,
  flow_entry: 2,
  theme_link: 3,
  market_context: 4,
  new_high: 5,
  volume_spike: 6,
  price_move: 7,
};

export function discoveryWhy(candidate: DiscoveryCandidate): string {
  const strongest = [...candidate.events].sort(
    (a, b) => WHY_KIND_PRIORITY[a.kind] - WHY_KIND_PRIORITY[b.kind] || b.strength - a.strength || a.kind.localeCompare(b.kind)
  )[0];
  if (!strongest) return "오늘 확인된 사건이 아직 없어요.";
  if (strongest.kind === "disclosure") {
    return strongest.label
      ? `오늘 공시가 확인됐어요: ${strongest.label}`
      : "오늘 이 종목의 공시가 확인됐어요.";
  }
  if (strongest.kind === "news_mention") {
    const isResearch = /리서치|증권|투자증권|자산운용|Research/i.test(strongest.source);
    if (isResearch) {
      return strongest.label
        ? `오늘 이 종목을 직접 다룬 리서치가 있어요: ${strongest.label}`
        : "오늘 이 종목을 직접 다룬 리서치가 있어요.";
    }
    return strongest.label
      ? `오늘 이 종목을 직접 언급한 뉴스가 있어요: ${strongest.label}`
      : "오늘 이 종목을 직접 언급한 뉴스가 있어요.";
  }
  if (strongest.kind === "flow_entry") return strongest.label ?? "수급이 새로 감지된 종목이에요.";
  if (strongest.kind === "theme_link") return strongest.label ?? "오늘 강한 테마 흐름에 같이 묶여 있어요.";
  if (strongest.kind === "market_context") return strongest.label ?? "오늘 시장 흐름 안에서 확인하는 종목이에요.";
  if (strongest.kind === "new_high") return strongest.label ?? "새로운 가격 위치가 확인된 종목이에요.";
  if (strongest.kind === "volume_spike") {
    return strongest.label ?? "오늘 거래량 급증, 뚜렷한 공개 재료는 확인 안 됨.";
  }
  return strongest.label ?? "오늘 가격 움직임이 커졌고, 뚜렷한 공개 재료는 확인 안 됨.";
}

function freshnessBoost(candidate: DiscoveryCandidate): number {
  return candidate.events.some((event) => event.firstSeen) ? 0.16 : 0;
}

function eventScore(candidate: DiscoveryCandidate): number {
  const maxStrength = Math.max(0, ...candidate.events.map((event) => clamp01(event.strength)));
  const diversity = new Set(candidate.events.map((event) => event.kind)).size;
  const materialBoost = hasPublicMaterialEvent(candidate) ? 0.22 : hasThemeLinkEvent(candidate) ? 0.08 : hasDisplayWhyEvent(candidate) ? -0.03 : -0.25;
  return maxStrength + freshnessBoost(candidate) + Math.min(0.12, diversity * 0.03) + materialBoost;
}

function seenPenalty(ticker: string, seen: readonly SeenRecord[], watched: ReadonlySet<string>): number {
  if (watched.has(ticker)) return 0;
  const row = seen.find((s) => s.ticker === ticker);
  if (!row || row.daysAgo >= DISCOVERY_SEEN_DECAY_DAYS) return 0;
  const left = DISCOVERY_SEEN_DECAY_DAYS - Math.max(0, row.daysAgo);
  return (left / DISCOVERY_SEEN_DECAY_DAYS) * 0.3;
}

export function rankDiscoveryCandidates(
  candidates: readonly DiscoveryCandidate[],
  opts: RankDiscoveryOptions = {}
): DiscoveryCandidate[] {
  const max = opts.maxCandidates ?? DISCOVERY_MAX_CANDIDATES;
  const watched = new Set(opts.watched ?? []);
  return candidates
    .filter((candidate) => candidate.events.length > 0)
    .filter((candidate) => !isWeakDiscoveryCandidate(candidate) || Math.max(0, ...candidate.events.map((event) => event.strength)) >= DISCOVERY_WEAK_MIN_STRENGTH)
    .map((candidate, index) => ({
      candidate,
      index,
      score: eventScore(candidate) - seenPenalty(candidate.ticker, opts.seen ?? [], watched),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(hasPublicMaterialEvent(b.candidate)) - Number(hasPublicMaterialEvent(a.candidate)) ||
        a.index - b.index ||
        a.candidate.ticker.localeCompare(b.candidate.ticker)
    )
    .slice(0, max)
    .map((row) => row.candidate);
}
