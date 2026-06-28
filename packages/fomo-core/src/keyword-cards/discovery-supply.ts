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
  sourceTitle?: string;
  sourceName?: string;
  sourceUrl?: string;
  publishedAt?: string;
  /** Card-facing, stock-perspective hook derived from sourceTitle. Raw title/source stay in evidence only. */
  headlineHook?: string;
  /** Same-day price move attached by the discovery pipeline. */
  changePct?: number;
  /** Latest volume divided by recent normal volume. */
  volumeRatio?: number;
  /** Flow actor from confirmed supply-demand history. */
  flowActor?: "foreign" | "institution";
  /** Consecutive confirmed buy/sell days. Positive values mean buy-side streak. */
  flowDays?: number;
  /** Human-scale net amount, e.g. 12만주. */
  flowAmountText?: string;
  themeRank?: number;
  themePeerCount?: number;
  themeAverageChangePct?: number;
  themeRelativeChangePct?: number;
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
  synthesizedInsight?: DiscoveryInsightSynthesis;
}

export type DiscoverySynthesisTone = "material" | "lead" | "activity" | "context" | "empty";

export interface DiscoveryInsightSynthesis {
  headline: string;
  headlineState: string;
  headlineDetail?: string;
  tag: string;
  tone: DiscoverySynthesisTone;
  primary?: DiscoveryEvent;
  support?: DiscoveryEvent;
  observations: string[];
  synthesis: string;
  evidence: string[];
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
export const DISCOVERY_RECENT_MATERIAL_DAYS = 3;

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
  return candidate.events.some((event) => isDeckDisplayEvent(event, candidate) && isMaterialEvent(event));
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

function dayStart(value: string | undefined): number | undefined {
  const date = value?.slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) ? time : undefined;
}

function eventAgeDays(event: DiscoveryEvent, candidate: DiscoveryCandidate): number | undefined {
  const eventDay = dayStart(event.asOf);
  const deckDay = dayStart(candidate.asOf);
  if (typeof eventDay !== "number" || typeof deckDay !== "number") return undefined;
  return Math.round((deckDay - eventDay) / 86_400_000);
}

function isCurrentDeckEvent(event: DiscoveryEvent, candidate: DiscoveryCandidate): boolean {
  return sameDay(event.asOf, candidate.asOf);
}

function isRecentDeckEvent(event: DiscoveryEvent, candidate: DiscoveryCandidate, maxDays: number): boolean {
  const age = eventAgeDays(event, candidate);
  return typeof age === "number" && age >= 0 && age <= maxDays;
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
  if (isMaterialEvent(event)) return isRecentDeckEvent(event, candidate, DISCOVERY_RECENT_MATERIAL_DAYS);
  if (!isCurrentDeckEvent(event, candidate)) return false;
  return isDisplayVolumeEvent(event);
}

function hasConcreteContextLabel(event: DiscoveryEvent): boolean {
  const label = event.label?.trim();
  if (!label) return false;
  if (/더\s*(?:살펴볼|확인할)|발견\s*풀|조용한\s*자리|오늘\s*가격이/.test(label)) return false;
  if (/^(?:KOSPI|KOSDAQ|NASDAQ|NYSE)\s/i.test(label)) return false;
  return true;
}

function isContextDisplayEvent(event: DiscoveryEvent, candidate: DiscoveryCandidate): boolean {
  if (!isCurrentDeckEvent(event, candidate)) return false;
  if (event.kind !== "theme_link" && event.kind !== "market_context") return false;
  if (event.direction === "down" || event.direction === "flat") return false;
  return hasConcreteContextLabel(event);
}

export function hasDeckDisplayEvent(candidate: DiscoveryCandidate): boolean {
  return candidate.events.some((event) => isDeckDisplayEvent(event, candidate));
}

export function hasDisplayWhyEvent(candidate: DiscoveryCandidate): boolean {
  return candidate.events.some((event) => isDeckDisplayEvent(event, candidate) || isContextDisplayEvent(event, candidate));
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
  return !hasDisplayWhyEvent(candidate);
}

const WHY_KIND_PRIORITY: Record<DiscoveryEventKind, number> = {
  disclosure: 0,
  news_mention: 1,
  volume_spike: 2,
  flow_entry: 3,
  new_high: 4,
  theme_link: 5,
  price_move: 6,
  market_context: 99,
};

function eventTimePrefix(event: DiscoveryEvent, candidate: DiscoveryCandidate): "오늘" | "최근" {
  return event.asOf.slice(0, 10) === candidate.asOf.slice(0, 10) ? "오늘" : "최근";
}

function labelOf(event: DiscoveryEvent | undefined): string {
  return (event?.label ?? "").replace(/\s+/g, " ").trim();
}

function stripTimePrefix(text: string): string {
  return text.replace(/^(?:오늘|최근)\s+/, "").trim();
}

function isPriceRestatement(text: string): boolean {
  const oldPriceLeadLabel = ["가격 먼저", "움직" + "임"].join(" ");
  const oldPricePctPrefix = ["오늘", "가격이"].join(" ");
  return text.startsWith(oldPricePctPrefix) || text === oldPriceLeadLabel;
}

function displayEventsFor(candidate: DiscoveryCandidate): DiscoveryEvent[] {
  return candidate.events.filter(
    (event) => isDeckDisplayEvent(event, candidate) || isContextDisplayEvent(event, candidate)
  );
}

function eventKindTone(event: DiscoveryEvent | undefined): DiscoverySynthesisTone {
  if (!event) return "empty";
  if (event.kind === "disclosure" || event.kind === "news_mention" || event.kind === "new_high") return "material";
  if (event.kind === "flow_entry") return "lead";
  if (event.kind === "volume_spike") return "activity";
  if (event.kind === "theme_link" || event.kind === "market_context") return "context";
  return "empty";
}

function displayTag(event: DiscoveryEvent | undefined): string {
  if (!event) return "아직 공개된 계기 없음";
  if (event.kind === "disclosure") return "공시 재료";
  if (event.kind === "news_mention") return "뉴스 재료";
  if (event.kind === "flow_entry") return "💎 수급 선행";
  if (event.kind === "volume_spike") return "거래 증가";
  if (event.kind === "new_high") return "새 가격대";
  if (event.kind === "theme_link") return "동종 종목 대비";
  if (event.kind === "market_context") return "시장 안 흐름";
  return "확인 신호";
}

function eventGroup(event: DiscoveryEvent): "material" | "flow" | "volume" | "context" | "price" {
  if (event.kind === "disclosure" || event.kind === "news_mention") return "material";
  if (event.kind === "flow_entry") return "flow";
  if (event.kind === "volume_spike") return "volume";
  if (event.kind === "theme_link" || event.kind === "market_context") return "context";
  return "price";
}

function isObscureCandidate(candidate: DiscoveryCandidate): boolean {
  const rank = candidate.marketCapRank;
  return typeof rank === "number" && Number.isFinite(rank) && rank >= DISCOVERY_AWAKENING_RANK_MIN;
}

function compactSourceName(event: DiscoveryEvent): string {
  return (event.sourceName ?? event.source ?? "").replace(/\s+/g, " ").trim();
}

function sourceTitleOf(event: DiscoveryEvent | undefined): string | undefined {
  if (!event) return undefined;
  const title = (event.sourceTitle ?? "").replace(/\s+/g, " ").trim();
  if (title) return title;
  const label = stripTimePrefix(labelOf(event));
  if (!label || /^(?:이 종목을 직접 언급한 뉴스|뉴스가 있어요|소식이 나왔어요)/.test(label)) return undefined;
  return label;
}

function headlineHookOf(event: DiscoveryEvent | undefined): string | undefined {
  const hook = (event?.headlineHook ?? "").replace(/\s+/g, " ").trim();
  if (!hook || hook.length > 36) return undefined;
  if (event?.sourceName && hook.includes(event.sourceName)) return undefined;
  if (event?.source && hook.includes(event.source)) return undefined;
  const rawTitle = sourceTitleOf(event);
  if (rawTitle && (hook === rawTitle || rawTitle.includes(hook))) return undefined;
  return hook;
}

const ABSTRACT_FILLER_PATTERN = new RegExp(
  [
    "흐름\\s*(?:도\\s*)?붙",
    "주" + "목",
    "확인되는\\s*화면",
    "눈에\\s*띄었어요",
    "한\\s*가지\\s*숫자만",
    "근거는\\s*얇",
    "이유\\s*얇",
    "재료\\s*붙은\\s*섹터선두",
    "공개\\s*원문도\\s*같이",
    "동종\\s*흐름도",
  ].join("|")
);

export function hasAbstractDiscoveryFiller(text: string | undefined): boolean {
  return ABSTRACT_FILLER_PATTERN.test(text ?? "");
}

function userFacingLabel(event: DiscoveryEvent | undefined, candidate?: DiscoveryCandidate): string {
  const raw = stripTimePrefix(labelOf(event));
  if (!event || !raw) return "";
  const sector = candidate?.sector ?? "동종";
  const escapedSector = sector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const relativeStrength = `${"상대"}${"강도"}`;
  const marketPosition = `${"시장"} ${"위치"}`;
  return raw
    .replace(/시총\s*\d+위권\s*종목의\s*/g, "")
    .replace(/시총\s*상위권\s*종목의\s*/g, "")
    .replace(new RegExp(`^${escapedSector}\\s+\\d+개\\s*종목\\s*중\\s*(?:제일|가장)\\s*(?:셌어요|강했어요|먼저.+)\\.?$`), `같은 ${sector} 종목들 중 오늘 변동성이 가장 컸어요.`)
    .replace(new RegExp(`^${escapedSector}\\s+\\d+개\\s*종목\\s*중\\s*(.+)$`), `같은 ${sector} 종목들 중 오늘 변동성이 상위권이에요.`)
    .replace(new RegExp(`${relativeStrength}\\s*1위예요\\.?`, "g"), `같은 ${sector} 종목들 중 오늘 변동성이 가장 컸어요.`)
    .replace(new RegExp(`${relativeStrength}\\s*(\\d+)위권이에요\\.?`, "g"), `같은 ${sector} 종목들 중 오늘 변동성이 상위권이에요.`)
    .replace(new RegExp(`주변보다 ${relativeStrength}가 높아요\\.?`, "g"), "주변 종목보다 오늘 변동성이 더 컸어요.")
    .replace(new RegExp(`테마 ${relativeStrength}`, "g"), "동종 종목 비교")
    .replace(new RegExp(marketPosition, "g"), "시장 안 비교")
    .replace(new RegExp(`^${escapedSector}\\s+안에서\\s+변동성이\\s+크게\\s+잡혔어요\\.?$`), `${sector} 종목 중 오늘 변동성이 크게 잡혔어요.`)
    .replace(/흐름\s+흐름/g, "흐름")
    .replace(/흐름\s*안에서\s*가장\s*먼저\s*눈에\s*띄었어요\.?/g, "종목들 중 오늘 변동성이 가장 컸어요.")
    .replace(/흐름보다\s*먼저\s*반응했어요\.?/g, "종목들보다 오늘 변동성이 더 컸어요.")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSentence(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").replace(/[.。]+$/g, "").trim();
}

function signedPct(value: number | undefined, digits = 1): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

function ratioText(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function volumeRatioOf(event: DiscoveryEvent): number | undefined {
  if (typeof event.volumeRatio === "number") return event.volumeRatio;
  const match = labelOf(event).match(/평소\s*(\d+(?:\.\d+)?)배/);
  return match?.[1] ? Number(match[1]) : undefined;
}

function changePctOf(candidate: DiscoveryCandidate, event?: DiscoveryEvent): number | undefined {
  if (typeof event?.changePct === "number") return event.changePct;
  const price = candidate.events.find((row) => typeof row.changePct === "number" || row.kind === "price_move");
  if (typeof price?.changePct === "number") return price.changePct;
  const match = candidate.events.map(labelOf).join(" ").match(/([+-]\d+(?:\.\d+)?)%/);
  return match?.[1] ? Number(match[1]) : undefined;
}

function themeRankOf(event: DiscoveryEvent): number | undefined {
  if (typeof event.themeRank === "number") return event.themeRank;
  const label = labelOf(event);
  if (/제일|가장/.test(label)) return 1;
  if (/두 번째/.test(label)) return 2;
  if (/세 번째/.test(label)) return 3;
  const fraction = label.match(/(\d+)\s*\/\s*(\d+)/);
  if (fraction?.[1]) return Number(fraction[1]);
  return undefined;
}

function themePeerCountOf(event: DiscoveryEvent): number | undefined {
  if (typeof event.themePeerCount === "number") return event.themePeerCount;
  const label = labelOf(event);
  const count = label.match(/(\d+)개\s*(?:종목)?\s*중/);
  if (count?.[1]) return Number(count[1]);
  const fraction = label.match(/(\d+)\s*\/\s*(\d+)/);
  if (fraction?.[2]) return Number(fraction[2]);
  return undefined;
}

function flowActorText(event: DiscoveryEvent): string | undefined {
  if (event.flowActor === "foreign") return "외국인";
  if (event.flowActor === "institution") return "기관";
  const label = labelOf(event);
  if (/외국인/.test(label)) return "외국인";
  if (/기관/.test(label)) return "기관";
  return undefined;
}

function flowDaysOf(event: DiscoveryEvent): number | undefined {
  if (typeof event.flowDays === "number") return Math.abs(event.flowDays);
  const match = labelOf(event).match(/(\d+)일째/);
  return match?.[1] ? Number(match[1]) : undefined;
}

function sectorFromEventLabel(event: DiscoveryEvent): string | undefined {
  const label = labelOf(event);
  return label.match(/오늘\s+([가-힣A-Za-z0-9]+)\s+(?:\d+개|흐름|안에서)/)?.[1]?.trim();
}

function hasMaterialSupport(candidate: DiscoveryCandidate, primary: DiscoveryEvent): boolean {
  return candidate.events.some(
    (event) =>
      event !== primary &&
      (event.kind === "news_mention" ||
        event.kind === "disclosure" ||
        event.kind === "flow_entry" ||
        event.kind === "volume_spike")
  );
}

interface WhyFact {
  headline: string;
  state: string;
  observation: string;
  synthesis: string;
  evidence: string;
}

function whyFactFor(event: DiscoveryEvent, candidate: DiscoveryCandidate): WhyFact | undefined {
  const ticker = candidate.ticker;
  const sector = candidate.sector ?? sectorFromEventLabel(event) ?? "동종";
  const prefix = eventTimePrefix(event, candidate);
  const change = signedPct(changePctOf(candidate, event));
  const hook = headlineHookOf(event);

  if ((event.kind === "news_mention" || event.kind === "disclosure") && hook) {
    const headline = change ? `${ticker} ${change}, ${hook}` : `${ticker}, ${hook}`;
    return {
      headline,
      state: event.kind === "disclosure" ? "공시 사건" : "뉴스 사건",
      observation: `${prefix} ${hook}${change ? ` / ${ticker} ${change}` : ""}.`,
      synthesis: change
        ? `기사 제목보다 '${hook}' 사건과 ${ticker} ${change} 반응을 분리해서 봅니다.`
        : `기사 제목보다 '${hook}' 사건 자체를 먼저 봅니다.`,
      evidence: evidenceFor(event),
    };
  }

  if (event.kind === "volume_spike") {
    const ratio = ratioText(volumeRatioOf(event));
    if (!ratio) return undefined;
    const headline = `${ticker} 거래가 평소 ${ratio}배로 늘었어요`;
    return {
      headline,
      state: "거래량",
      observation: `${ticker}: 평소 ${ratio}배 거래량${change ? ` / ${change}` : ""}.`,
      synthesis: `평소보다 거래가 크게 늘어, 가격만이 아니라 거래 쪽 변화도 같이 보는 카드예요.`,
      evidence: `${event.source} · ${event.asOf.slice(0, 10)} · 거래량 ${ratio}배`,
    };
  }

  if (event.kind === "flow_entry") {
    const actor = flowActorText(event);
    const days = flowDaysOf(event);
    if (!actor || !days) return undefined;
    const amount = event.flowAmountText ? ` ${event.flowAmountText}` : "";
    const headline = `${actor} ${days}일째${amount} 담는 ${ticker}`;
    return {
      headline,
      state: "수급",
      observation: `${actor} ${days}일 연속 순매수${event.flowAmountText ? ` / ${event.flowAmountText}` : ""}.`,
      synthesis: `핵심 숫자는 ${actor} ${days}일 연속 수급입니다. 장마감 확정 자료라 장중 추정과 분리해서 봅니다.`,
      evidence: `${event.source} · ${event.asOf.slice(0, 10)} · ${actor} ${days}일`,
    };
  }

  if (event.kind === "new_high") {
    const headline = change ? `${ticker} 52주 최고 근처, ${change}` : `${ticker} 52주 최고 근처`;
    return {
      headline,
      state: "52주 위치",
      observation: `${ticker}: 52주 최고 근처${change ? ` / ${change}` : ""}.`,
      synthesis: "핵심은 52주 가격 위치입니다. 새 가격대에 닿은 사실만 보고, 이후 방향은 단정하지 않습니다.",
      evidence: `${event.source} · ${event.asOf.slice(0, 10)} · 52주 위치`,
    };
  }

  if (event.kind === "theme_link" || event.kind === "market_context") {
    const marketRank = candidate.marketCapRank;
    const label = userFacingLabel(event, candidate);
    const position =
      label ||
      (change
        ? `${ticker}에서 같은 ${sector} 종목들과 다른 변동성이 잡혔어요.`
        : `같은 ${sector} 종목들과 비교할 변화가 잡혔어요.`);
    const pct = change ?? signedPct(event.changePct);
    if (!pct && !marketRank && !label && !sector) return undefined;
    const headline = position.replace(/[.。]$/, "");
    const noBacker = hasMaterialSupport(candidate, event) ? "" : " 뉴스·공시·수급 근거는 아직 확인되지 않았어요.";
    return {
      headline,
      state: "동종 비교",
      observation: `${ticker}: ${position.replace(/[.。]$/, "")}${pct ? ` / ${pct}` : ""}.`,
      synthesis: `같은 ${sector} 종목들과 비교해 달라진 점이 카드의 이유입니다.${noBacker}`,
      evidence: `${event.source} · ${event.asOf.slice(0, 10)}${pct ? ` · ${pct}` : ""}`,
    };
  }

  return undefined;
}

function supportEligible(event: DiscoveryEvent | undefined, primary: DiscoveryEvent, candidate: DiscoveryCandidate): boolean {
  if (!event || event === primary || eventGroup(event) === eventGroup(primary)) return false;
  if (isPriceRestatement(labelOf(event))) return false;
  return !!whyFactFor(event, candidate);
}

function choosePrimaryEvent(candidate: DiscoveryCandidate): DiscoveryEvent | undefined {
  return displayEventsFor(candidate).filter((event) => {
    if (event.kind !== "news_mention") return true;
    return !!headlineHookOf(event);
  }).sort(
    (a, b) => WHY_KIND_PRIORITY[a.kind] - WHY_KIND_PRIORITY[b.kind] || b.strength - a.strength || a.kind.localeCompare(b.kind)
  )[0];
}

function chooseSupportEvent(candidate: DiscoveryCandidate, primary: DiscoveryEvent | undefined): DiscoveryEvent | undefined {
  if (!primary) return undefined;
  return displayEventsFor(candidate)
    .filter((event) => supportEligible(event, primary, candidate))
    .sort((a, b) => {
      const supportRank = (event: DiscoveryEvent) => {
        if (event.kind === "volume_spike") return 0;
        if (event.kind === "flow_entry") return 1;
        if (event.kind === "theme_link" || event.kind === "market_context") return 2;
        if (event.kind === "disclosure" || event.kind === "news_mention") return 3;
        return 9;
      };
      return supportRank(a) - supportRank(b) || b.strength - a.strength || a.kind.localeCompare(b.kind);
    })[0];
}

function observationFor(event: DiscoveryEvent, candidate: DiscoveryCandidate): string {
  return whyFactFor(event, candidate)?.observation ?? (userFacingLabel(event, candidate) || cleanSentence(labelOf(event))) + ".";
}

function evidenceFor(event: DiscoveryEvent): string {
  const title = sourceTitleOf(event);
  const sourceName = compactSourceName(event);
  const date = (event.publishedAt ?? event.asOf).slice(0, 10);
  if ((event.kind === "news_mention" || event.kind === "disclosure") && title) {
    return `${title}${sourceName ? ` · ${sourceName}` : ""} · ${date}`;
  }
  return `${sourceName || "확인 자료"} · ${date} · 신뢰도 ${event.confidence}`;
}

export function synthesizeDiscoveryInsight(candidate: DiscoveryCandidate): DiscoveryInsightSynthesis {
  if (candidate.synthesizedInsight) return candidate.synthesizedInsight;
  const primary = choosePrimaryEvent(candidate);
  const support = chooseSupportEvent(candidate, primary);
  if (!primary) {
    return {
      headline: "아직 공개된 계기 없음",
      headlineState: "빈 신호",
      tag: "정직한 빈 신호",
      tone: "empty",
      observations: [],
      synthesis: "가격만으로 이유를 만들지 않습니다. 사건·거래량·수급·시총 위치 중 하나가 잡힐 때만 카드 이유를 씁니다.",
      evidence: [],
    };
  }

  const primaryFact = whyFactFor(primary, candidate);
  const supportFact = support ? whyFactFor(support, candidate) : undefined;
  const headline = primaryFact?.headline ?? `${candidate.ticker} 계기는 더 확인해야 해요`;
  const observations = [primary, support]
    .filter((event): event is DiscoveryEvent => !!event)
    .map((event) => observationFor(event, candidate))
    .filter((text, index, list) => !!text && !hasAbstractDiscoveryFiller(text) && list.indexOf(text) === index);
  const evidence = [primaryFact?.evidence, supportFact?.evidence]
    .filter((text): text is string => !!text)
    .filter((text, index, list) => list.indexOf(text) === index);
  const synthesis = [primaryFact?.synthesis, supportFact ? `보조 숫자: ${supportFact.observation}` : undefined]
    .filter((text): text is string => !!text && !hasAbstractDiscoveryFiller(text))
    .join(" ");

  return {
    headline,
    headlineState: primaryFact?.state ?? "확인 필요",
    tag: displayTag(primary),
    tone: eventKindTone(primary),
    primary,
    ...(support ? { support } : {}),
    observations,
    synthesis,
    evidence,
  };
}

export function discoveryWhy(candidate: DiscoveryCandidate): string {
  return synthesizeDiscoveryInsight(candidate).headline;
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
    .filter(hasDisplayWhyEvent)
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
