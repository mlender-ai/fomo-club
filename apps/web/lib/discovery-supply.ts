import {
  STOCK_VOCAB,
  applyAxisRarity,
  buildAxisSignals,
  computeFomoScore,
  decodeHtmlEntities,
  discoveryWhy,
  eligibleUniverse,
  hasDisplayWhyEvent,
  hasPublicMaterialEvent,
  isDeckDisplayEvent,
  isFrontHookSafe,
  investorNetStreak,
  rankDiscoveryCandidates,
  resolveStock,
  sectorOf,
  selectMultiAxisHook,
  stockMentionRole,
  stockMatchesText,
  type AxisSignal,
  type CardFrontSignals,
  type DiscoveryCandidate,
  type DiscoveryEvent,
  type DiscoveryMarket,
  type FomoScoreResult,
  type InvestorFlow,
  type MultiAxisHookSelection,
  type SectorStock,
  type StockCountry,
  type StockSector,
  type RawArticle,
} from "@fomo/core";
import { fetchDartDisclosuresByStock, type DartDisclosureHit } from "./dart-disclosures";
import { fetchNaverCompanyResearch, fetchNaverStockNews } from "./fomo-news-sources";
import { fetchStockDaily } from "./stock-front";
import { computeStockAttentionSignals, type StockAttentionSignal } from "./stock-signal-coverage";
import { readSupplyDemandHistoryByTickers } from "./supply-demand-store";

const UA = { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/plain,*/*" };
const MARKETS: DiscoveryMarket[] = ["KOSPI", "KOSDAQ"];
const PAGE_SIZE = 100;
const PAGES_PER_MARKET = 5;
const SPARKLINE_CONCURRENCY = 8;
const TARGETED_MATERIAL_ENABLED = process.env.DISCOVERY_TARGETED_MATERIAL !== "0";
const DISCOVERY_FLOW_CACHE_ENABLED = process.env.DISCOVERY_FLOW_CACHE !== "0";
const TARGETED_MATERIAL_CANDIDATE_LIMIT = TARGETED_MATERIAL_ENABLED
  ? Math.max(0, Math.min(40, Number(process.env.DISCOVERY_TARGETED_MATERIAL_LIMIT ?? 24) || 24))
  : 0;
const TARGETED_MATERIAL_CONCURRENCY = 4;
const NON_STOCK_NAME_PATTERN = /ETF|ETN|KODEX|TIGER|ACE|RISE|SOL\s|PLUS|KBSTAR|HANARO|히어로즈|레버리지|인버스|선물/i;
const MATERIAL_NEWS_NOISE =
  /인기검색|검색\s?순위|주요\s?뉴스|오늘의\s?증시|마감\s?시황|장중\s?시황|특징주\s?모음|주식\s?초고수|초고수|단타|ETF|ETN|상장지수|레버리지|인버스|TOP\s?\d|상위\s?\d/i;
const DISCOVERY_SOURCE_LABEL = TARGETED_MATERIAL_ENABLED
  ? "네이버 시세·종목뉴스·리서치·DART 공시·수급 캐시"
  : "네이버 시세·뉴스 언급";
const MARKET_LABELS = new Set(["KOSPI", "KOSDAQ", "NASDAQ", "NYSE"]);
const INDUSTRY_HINTS: Array<{ label: string; pattern: RegExp }> = [
  { label: "반도체", pattern: /반도체|HBM|메모리|파운드리|MLCC|기판|웨이퍼|EUV|패키징|공정|테스/i },
  { label: "AI", pattern: /\b(?:AI|GPU|SW|Agentic|OS)\b|인공지능|클라우드|데이터센터|소프트웨어|문서|에이전틱|마키나락스|엠로/i },
  { label: "에너지", pattern: /에너지|태양광|풍력|신재생|VPP|발전|전력|수소|ESS/i },
  { label: "2차전지", pattern: /2차전지|이차전지|배터리|전지|리튬|양극재|음극재|전해질|분리막/i },
  { label: "방산", pattern: /방산|디펜스|국방|무기|유도무기|항공우주|군|KAI|LIG|로템|함정/i },
  { label: "바이오", pattern: /바이오|헬스케어|제약|신약|임상|항암|의료|진단|치료제|의약품|올릭스|한올바이오/i },
  { label: "원자력", pattern: /원전|원자력|SMR|소형모듈|한전|전력기술/i },
  { label: "인터넷", pattern: /네이버|카카오|플랫폼|포털|커머스|웹툰|콘텐츠/i },
  { label: "금융", pattern: /은행|보험|손해보험|증권|캐피탈|핀테크|결제/i },
  { label: "게임", pattern: /게임|엔씨|크래프톤|위메이드|넷마블/i },
  { label: "자동차", pattern: /자동차|현대차|기아|모비스|부품|전장|전기차|타이어|금호타이어/i },
  { label: "조선", pattern: /조선|중공업|선박|해양|조선소/i },
  { label: "로봇", pattern: /로봇|자동화|로보틱스/i },
  { label: "음식료", pattern: /식품|푸드|외식|급식|프레시웨이|음식료/i },
  { label: "화장품", pattern: /화장품|코스메틱|뷰티|제닉|한국콜마/i },
  { label: "건자재", pattern: /건자재|레미콘|시멘트|건설자재|유진기업/i },
  { label: "지주", pattern: /지주|홀딩스|SK디스커버리/i },
];

export interface DiscoveryFrontSeed {
  signals: CardFrontSignals;
  fomo: FomoScoreResult;
  sparkline: number[];
  priceText?: string;
  changeText?: string;
  changeDir?: "up" | "down" | "flat";
  axisSignals?: AxisSignal[];
  axisHook?: MultiAxisHookSelection;
}

export interface DiscoveryStockPayload extends Omit<SectorStock, "sector"> {
  sector: string;
  whyShown?: string;
  reason?: string;
}

export interface DiscoveryResponse {
  asOf: string;
  stocks: DiscoveryStockPayload[];
  fronts: Record<string, DiscoveryFrontSeed>;
  confidence: "L" | "M" | "H";
  source: string;
}

interface NaverMarketRow {
  canonical: string;
  naverCode: string;
  market: DiscoveryMarket;
  marketCapRank?: number;
  priceText?: string;
  changeText?: string;
  changeDir?: "up" | "down" | "flat";
  changePct?: number;
  tradingValue?: number;
}

interface RawNaverStock {
  itemCode?: string;
  stockName?: string;
  itemName?: string;
  closePrice?: string;
  compareToPreviousClosePrice?: string;
  fluctuationsRatio?: string;
  compareToPreviousPrice?: { code?: string; text?: string; name?: string };
  accumulatedTradingValue?: string;
  accumulatedTradingVolume?: string;
}

interface ThemeMoveSignal {
  sector: StockSector;
  rank: number;
  peerCount: number;
  averageChangePct: number;
  relativeChangePct: number;
  positiveCount: number;
}

function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function numberFromText(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value.replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(n) ? n : undefined;
}

function changeDirFrom(row: RawNaverStock, pct: number | undefined): "up" | "down" | "flat" {
  const raw = `${row.compareToPreviousPrice?.code ?? ""} ${row.compareToPreviousPrice?.text ?? ""} ${row.compareToPreviousPrice?.name ?? ""}`;
  if (/하락|DOWN|5/.test(raw) || (typeof pct === "number" && pct < 0)) return "down";
  if (/상승|UP|2/.test(raw) || (typeof pct === "number" && pct > 0)) return "up";
  return "flat";
}

function signedChangeText(row: RawNaverStock, dir: "up" | "down" | "flat", pct: number | undefined): string | undefined {
  const change = row.compareToPreviousClosePrice?.trim().replace(/^[+-]+/, "");
  if (!change && typeof pct !== "number") return undefined;
  const pctText = typeof pct === "number" ? `${pct.toFixed(2)}%` : undefined;
  const prefix = dir === "down" ? "-" : "";
  return change && pctText ? `${prefix}${change} (${pctText})` : pctText;
}

function parseMarketRow(row: RawNaverStock, market: DiscoveryMarket): NaverMarketRow | null {
  const canonical = (row.stockName ?? row.itemName ?? "").trim();
  const naverCode = row.itemCode?.trim();
  if (!canonical || !naverCode) return null;
  if (NON_STOCK_NAME_PATTERN.test(canonical)) return null;
  const rawPct = numberFromText(row.fluctuationsRatio);
  const dir = changeDirFrom(row, rawPct);
  const changePct = typeof rawPct === "number" ? (dir === "down" ? -Math.abs(rawPct) : Math.abs(rawPct)) : undefined;
  const changeText = signedChangeText(row, dir, changePct);
  const tradingValue = numberFromText(row.accumulatedTradingValue);
  return {
    canonical,
    naverCode,
    market,
    ...(row.closePrice ? { priceText: `${row.closePrice.replace(/원$/, "")}원` } : {}),
    ...(changeText ? { changeText } : {}),
    changeDir: dir,
    ...(typeof changePct === "number" ? { changePct } : {}),
    ...(tradingValue ? { tradingValue } : {}),
  };
}

async function fetchMarketPage(market: DiscoveryMarket, page: number): Promise<NaverMarketRow[]> {
  const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=${PAGE_SIZE}`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`naver market ${market} ${page} ${res.status}`);
  const data = (await res.json()) as { stocks?: RawNaverStock[] };
  return (data.stocks ?? []).map((row) => parseMarketRow(row, market)).filter((row): row is NaverMarketRow => row !== null);
}

async function fetchMarketRows(): Promise<NaverMarketRow[]> {
  const settled = await Promise.allSettled(
    MARKETS.flatMap((market) => Array.from({ length: PAGES_PER_MARKET }, (_, i) => fetchMarketPage(market, i + 1)))
  );
  const rows = settled.flatMap((row) => (row.status === "fulfilled" ? row.value : []));
  const byCode = new Map<string, NaverMarketRow>();
  for (const row of rows) if (!byCode.has(row.naverCode)) byCode.set(row.naverCode, row);
  const rankByMarket = new Map<DiscoveryMarket, number>();
  return [...byCode.values()].map((row) => {
    const rank = (rankByMarket.get(row.market) ?? 0) + 1;
    rankByMarket.set(row.market, rank);
    return { ...row, marketCapRank: rank };
  });
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        out[index] = { status: "fulfilled", value: await fn(items[index]!) };
      } catch (reason) {
        out[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function eventFromPrice(row: NaverMarketRow, asOf: string): DiscoveryEvent | null {
  if (typeof row.changePct !== "number" || Math.abs(row.changePct) < 5) return null;
  return {
    kind: "price_move",
    firstSeen: true,
    strength: Math.min(1, Math.abs(row.changePct) / 15),
    source: "네이버 시세",
    asOf,
    confidence: "H",
    label: `오늘 가격이 ${row.changePct > 0 ? "+" : ""}${row.changePct.toFixed(2)}% 움직였어요.`,
  };
}

function eventFromNews(attention: StockAttentionSignal | undefined, asOf: string): DiscoveryEvent | null {
  if (!attention?.newsEventLabel) return null;
  return {
    kind: "news_mention",
    firstSeen: true,
    strength: Math.min(1, Math.max(0.32, attention.mentionScore / 100)),
    source: attention.newsEventSource ?? "뉴스",
    asOf,
    confidence: attention.newsEventLabel ? "H" : "M",
    ...(attention.newsEventLabel ? { label: attention.newsEventLabel } : {}),
  };
}

function cleanMaterialTitle(title: string): string | undefined {
  const cleaned = decodeHtmlEntities(title)
    .replace(/^\s*(?:\[[^\]]+\]|【[^】]+】|\([^)]*\))\s*/g, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?。]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 6 || MATERIAL_NEWS_NOISE.test(cleaned)) return undefined;
  if (/[\[\]{}<>]/.test(cleaned)) return undefined;
  const compact = cleaned.length > 46 ? `${cleaned.slice(0, 44).trim()}…` : cleaned;
  return isFrontHookSafe(`${compact} 소식이 나왔어요.`) ? compact : undefined;
}

function isStockArticle(canonical: string, article: RawArticle): boolean {
  return stockMatchesText(canonical, `${article.title} ${article.summary ?? ""}`);
}

function isPrimaryStockArticle(canonical: string, article: RawArticle): boolean {
  return stockMentionRole(canonical, {
    title: article.title,
    ...(article.summary ? { summary: article.summary } : {}),
  }) === "primary";
}

function materialEventFromArticle(article: RawArticle, asOf: string, sourceFallback: string): DiscoveryEvent | null {
  const label = cleanMaterialTitle(article.title);
  if (!label) return null;
  const isResearch = /리서치|증권|투자증권|자산운용|Research/i.test(`${article.source} ${article.category ?? ""}`);
  return {
    kind: "news_mention",
    firstSeen: true,
    strength: isResearch ? 0.82 : 0.88,
    source: article.source || sourceFallback,
    asOf: article.publishedAt?.slice(0, 10) || asOf,
    confidence: "H",
    label,
  };
}

async function eventFromTargetedMaterial(row: NaverMarketRow, asOf: string): Promise<DiscoveryEvent | null> {
  if (!/^\d{6}$/.test(row.naverCode)) return null;
  const [newsResult, researchResult] = await Promise.allSettled([
    fetchNaverStockNews(row.naverCode, 8),
    fetchNaverCompanyResearch(row.naverCode, row.canonical, 4),
  ]);

  const stockNews =
    newsResult.status === "fulfilled"
      ? newsResult.value.find((article) => isPrimaryStockArticle(row.canonical, article))
      : undefined;
  if (stockNews) return materialEventFromArticle(stockNews, asOf, "네이버 종목뉴스");

  const research =
    researchResult.status === "fulfilled"
      ? researchResult.value.find((article) => isStockArticle(row.canonical, article))
      : undefined;
  if (research) return materialEventFromArticle(research, asOf, "네이버 증권 리서치");

  return null;
}

function buildThemeMoveSignals(rows: readonly NaverMarketRow[]): Map<string, ThemeMoveSignal> {
  const groups = new Map<StockSector, Array<{ ticker: string; changePct: number }>>();
  for (const row of rows) {
    const sector = sectorOf(row.canonical);
    if (!sector || typeof row.changePct !== "number") continue;
    const current = groups.get(sector) ?? [];
    current.push({ ticker: row.canonical, changePct: row.changePct });
    groups.set(sector, current);
  }

  const out = new Map<string, ThemeMoveSignal>();
  for (const [sector, peers] of groups) {
    if (peers.length < 3) continue;
    const avg = peers.reduce((sum, peer) => sum + peer.changePct, 0) / peers.length;
    const positiveCount = peers.filter((peer) => peer.changePct > 0).length;
    const sorted = [...peers].sort((a, b) => b.changePct - a.changePct || a.ticker.localeCompare(b.ticker));
    sorted.forEach((peer, index) => {
      out.set(peer.ticker, {
        sector,
        rank: index + 1,
        peerCount: sorted.length,
        averageChangePct: Math.round(avg * 10) / 10,
        relativeChangePct: Math.round((peer.changePct - avg) * 10) / 10,
        positiveCount,
      });
    });
  }
  return out;
}

function eventFromTheme(row: NaverMarketRow, theme: ThemeMoveSignal | undefined, asOf: string): DiscoveryEvent | null {
  if (!theme || typeof row.changePct !== "number") return null;
  const strongTheme = theme.averageChangePct >= 1.5 && theme.positiveCount >= 2;
  const leadingTheme = theme.rank <= 3 && row.changePct >= 5;
  const positiveOutperformer = row.changePct >= 1.5 && theme.relativeChangePct >= 2;
  const positiveStrongTheme = row.changePct >= 3 && strongTheme && theme.relativeChangePct >= 0;
  const positiveSectorSpike = row.changePct >= 7 && theme.relativeChangePct >= 0;
  if (!leadingTheme && !positiveOutperformer && !positiveStrongTheme && !positiveSectorSpike) return null;
  const label =
    theme.rank <= 3
      ? `오늘 ${theme.sector} ${theme.peerCount}개 종목 중 ${ordinalText(theme.rank)} 강했어요(${pctText(row.changePct)}).`
      : `오늘 ${theme.sector} 평균(${pctText(theme.averageChangePct)})보다 ${pointText(theme.relativeChangePct)}포인트 더 강했어요(${pctText(row.changePct)}).`;
  return {
    kind: "theme_link",
    firstSeen: true,
    strength: Math.min(0.92, 0.48 + Math.abs(theme.averageChangePct) / 10 + Math.abs(row.changePct) / 40),
    source: "FOMO 섹터맵·네이버 시세",
    asOf,
    confidence: "M",
    label,
  };
}

function pctText(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function pointText(value: number): string {
  return Math.abs(value).toFixed(1);
}

function ordinalText(rank: number): string {
  if (rank === 1) return "가장";
  if (rank === 2) return "두 번째로";
  if (rank === 3) return "세 번째로";
  return `${rank}번째로`;
}

function eventFromMarketContext(row: NaverMarketRow, theme: ThemeMoveSignal | undefined, asOf: string): DiscoveryEvent {
  const sector = theme?.sector ?? sectorOf(row.canonical);
  const rankText = row.marketCapRank ? `시총 ${row.marketCapRank}위권` : "시총 상위권";
  const changePct = row.changePct;
  const change = typeof changePct === "number" ? pctText(changePct) : undefined;
  const source = "네이버 시세";
  if (sector && theme && typeof changePct === "number") {
    const relativeLabel =
      theme.rank <= 3
        ? `${theme.peerCount}개 ${sector} 종목 중 ${ordinalText(theme.rank)} 강하게 움직였어요.`
        : changePct > 0
          ? `오늘 ${sector} 안에서 같이 오른 쪽이에요(${change}).`
          : `오늘 ${sector} 안에서 약한 쪽 흐름이에요(${change}).`;
    return {
      kind: "market_context",
      firstSeen: true,
      strength: Math.min(0.72, 0.38 + Math.abs(changePct) / 35 + Math.max(0, theme.relativeChangePct) / 30),
      source,
      asOf,
      confidence: "M",
      label: relativeLabel,
    };
  }
  if (typeof changePct === "number" && change) {
    return {
      kind: "market_context",
      firstSeen: true,
      strength: Math.min(0.66, 0.34 + Math.abs(changePct) / 40),
      source,
      asOf,
      confidence: "M",
      label: `${row.market} ${rankText}에서 오늘 ${change} 움직였어요.`,
    };
  }
  return {
    kind: "market_context",
    firstSeen: true,
    strength: 0.32,
    source,
    asOf,
    confidence: "L",
    label: `${row.market} ${rankText}이라 오늘 시장 흐름과 같이 확인해요.`,
  };
}

function eventFromFlowHistory(history: readonly InvestorFlow[]): DiscoveryEvent | null {
  if (history.length === 0) return null;
  const streak = investorNetStreak(history);
  const useForeign = streak.foreign >= streak.institution;
  const n = Math.max(streak.foreign, streak.institution);
  if (n < 2) return null;
  const actor = useForeign ? "외국인이" : "기관이";
  return {
    kind: "flow_entry",
    firstSeen: true,
    strength: Math.min(1, 0.52 + n / 10),
    source: "KRX 수급",
    asOf: history[0]?.date ?? todayKst(),
    confidence: "H",
    label: `${actor} ${n}일째 사는 중이에요.`,
  };
}

function cleanSectorLabel(label: string | undefined): string | undefined {
  const clean = label?.trim();
  if (!clean || MARKET_LABELS.has(clean)) return undefined;
  return clean;
}

export function inferDiscoverySectorLabel(
  ticker: string,
  events: readonly DiscoveryEvent[],
  theme?: ThemeMoveSignal,
  asOf?: string
): string {
  const curated = sectorOf(ticker);
  if (curated) return curated;
  if (theme?.sector) return theme.sector;
  const currentEvents = asOf ? events.filter((event) => event.asOf.slice(0, 10) === asOf.slice(0, 10)) : events;
  const text = [ticker, ...currentEvents.map((event) => event.label)]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .replace(/\b(?:KOSPI|KOSDAQ|NASDAQ|NYSE)\b/gi, " ");
  for (const hint of INDUSTRY_HINTS) {
    if (hint.pattern.test(text)) return hint.label;
  }
  return "기타 업종";
}

function eventAxisSignal(event: DiscoveryEvent, candidate: DiscoveryCandidate): AxisSignal | null {
  if (!isDeckDisplayEvent(event, candidate)) return null;
  if (
    event.kind !== "theme_link" &&
    event.kind !== "flow_entry" &&
    event.kind !== "disclosure" &&
    event.kind !== "news_mention"
  ) return null;
  const axis =
    event.kind === "theme_link" ? "herd" : event.kind === "flow_entry" ? "flow" : "time";
  const sourceKind =
    event.kind === "theme_link"
      ? "market"
      : event.kind === "news_mention"
        ? "news"
        : "official";
  const hookText = event.label?.trim();
  if (!hookText) return null;
  return {
    axis,
    fired: true,
    strength:
      event.kind === "theme_link"
          ? Math.max(0.91, event.strength)
          : event.kind === "news_mention"
            ? Math.max(0.94, event.strength)
            : Math.max(0.93, event.strength),
    rarity: 0,
    hookText,
    evidence: [{ text: hookText, sourceKind, source: event.source, asOf: event.asOf }],
  };
}

function stockPayload(row: NaverMarketRow, candidate: DiscoveryCandidate): DiscoveryStockPayload {
  const def = resolveStock(candidate.ticker);
  const sector = cleanSectorLabel(candidate.sector) ?? (def ? sectorOf(def.canonical) : undefined);
  const why = discoveryWhy(candidate);
  const hasMaterial = hasPublicMaterialEvent(candidate);
  const hasDisplayWhy = hasDisplayWhyEvent(candidate);
  return {
    canonical: candidate.ticker,
    market: row.market,
    country: def?.country ?? "KR",
    naverCode: row.naverCode,
    marquee: def?.marquee === true,
    sector: sector ?? inferDiscoverySectorLabel(candidate.ticker, candidate.events, undefined, candidate.asOf),
    whyShown: hasDisplayWhy
      ? why
      : "큰 가격 움직임은 보였지만, 연결된 공개 재료는 확인 안 됨.",
    ...(hasDisplayWhy ? { reason: why } : {}),
  };
}

function frontSeed(
  row: NaverMarketRow,
  candidate: DiscoveryCandidate,
  attention: StockAttentionSignal | undefined,
  theme: ThemeMoveSignal | undefined,
  sparkline: number[]
): DiscoveryFrontSeed {
  const currentNewsEvent = candidate.events.find(
    (event) => isDeckDisplayEvent(event, candidate) && (event.kind === "news_mention" || event.kind === "disclosure")
  );
  const signals: CardFrontSignals = {
    ...(typeof row.changePct === "number" ? { changePct: row.changePct } : {}),
    ...(attention ? { mentionCount: attention.mentionCount, mentionScore: attention.mentionScore } : {}),
    ...(currentNewsEvent?.label ? { newsEventLabel: currentNewsEvent.label } : {}),
    ...(currentNewsEvent?.source ? { newsEventSource: currentNewsEvent.source } : {}),
    ...(row.marketCapRank ? { marketCapRank: { scope: "market", market: row.market, rank: row.marketCapRank } } : {}),
    ...(theme ? {
      themeLabel: theme.sector,
      themeRelativeRank: theme.rank,
      themePeerCount: theme.peerCount,
      themeAverageChangePct: theme.averageChangePct,
      themeRelativeChangePct: theme.relativeChangePct,
    } : {}),
    asOf: candidate.asOf,
  };
  const fomo = computeFomoScore({
    ...(typeof signals.changePct === "number" ? { changePct: signals.changePct } : {}),
    ...(typeof signals.mentionScore === "number" ? { mentionScore: signals.mentionScore } : {}),
  });
  const eventSignals = candidate.events.map((event) => eventAxisSignal(event, candidate)).filter((signal): signal is AxisSignal => signal !== null);
  const axisSignals = [...buildAxisSignals({ signals }), ...eventSignals];
  const axisHook = selectMultiAxisHook(axisSignals);
  return {
    signals,
    fomo,
    sparkline,
    ...(row.priceText ? { priceText: row.priceText } : {}),
    ...(row.changeText ? { changeText: row.changeText } : {}),
    ...(row.changeDir ? { changeDir: row.changeDir } : {}),
    axisSignals,
    axisHook,
  };
}

export async function buildDiscoveryResponse(): Promise<DiscoveryResponse> {
  const asOf = todayKst();
  const [rows, attentionMap] = await Promise.all([
    fetchMarketRows(),
    computeStockAttentionSignals().catch((): Record<string, StockAttentionSignal> => ({})),
  ]);
  const vocabByCode = new Map(STOCK_VOCAB.filter((s) => s.naverCode).map((s) => [s.naverCode!, s]));
  const normalizedRows = rows.map((row) => {
    const def = vocabByCode.get(row.naverCode);
    return { ...row, canonical: def?.canonical ?? row.canonical };
  });
  const eligibleTickers = new Set(
    eligibleUniverse(
      normalizedRows.map((row) => ({
        ticker: row.canonical,
        ...(typeof row.tradingValue === "number" ? { avgTradingValue20d: row.tradingValue } : {}),
      }))
    ).map((row) => row.ticker)
  );
  const themeSignals = buildThemeMoveSignals(normalizedRows);
  const byTicker = new Map<string, { row: NaverMarketRow; events: DiscoveryEvent[] }>();

  for (const row of normalizedRows) {
    const ticker = row.canonical;
    if (!eligibleTickers.has(ticker)) continue;
    const theme = themeSignals.get(ticker);
    const events = [eventFromPrice(row, asOf), eventFromTheme(row, theme, asOf), eventFromMarketContext(row, theme, asOf)].filter(
      (event): event is DiscoveryEvent => event !== null
    );
    if (events.length > 0) byTicker.set(ticker, { row: { ...row, canonical: ticker }, events });
  }

  for (const [ticker, attention] of Object.entries(attentionMap)) {
    const def = resolveStock(ticker);
    const canonical = def?.canonical ?? ticker;
    if (!eligibleTickers.has(canonical)) continue;
    const row =
      normalizedRows.find((r) => r.canonical === canonical) ??
      (def?.naverCode ? normalizedRows.find((r) => r.naverCode === def.naverCode) : undefined) ??
      (def?.naverCode
        ? ({ canonical: def.canonical, naverCode: def.naverCode, market: def.market as DiscoveryMarket } satisfies NaverMarketRow)
        : undefined);
    if (!row) continue;
    const event = eventFromNews(attention, asOf);
    if (!event) continue;
    const current = byTicker.get(canonical);
    byTicker.set(canonical, { row: { ...row, canonical }, events: [...(current?.events ?? []), event] });
  }

  const disclosureMap = await fetchDartDisclosuresByStock(asOf).catch((): Record<string, DartDisclosureHit> => ({}));
  for (const [ticker, disclosure] of Object.entries(disclosureMap)) {
    const def = resolveStock(ticker);
    if (!def?.naverCode || !eligibleTickers.has(def.canonical)) continue;
    const row =
      normalizedRows.find((r) => r.naverCode === def.naverCode) ??
      ({ canonical: def.canonical, naverCode: def.naverCode, market: def.market as DiscoveryMarket } satisfies NaverMarketRow);
    const current = byTicker.get(def.canonical);
    const event: DiscoveryEvent = {
      kind: "disclosure",
      firstSeen: true,
      strength: 0.96,
      source: disclosure.source,
      asOf: disclosure.asOf,
      confidence: "H",
      label: disclosure.label,
    };
    byTicker.set(def.canonical, { row: { ...row, canonical: def.canonical }, events: [...(current?.events ?? []), event] });
  }

  const targetedRows = [...byTicker.entries()]
    .filter(([, value]) => !value.events.some((event) => event.kind === "disclosure" || event.kind === "news_mention"))
    .sort((a, b) => {
      const aPct = Math.abs(a[1].row.changePct ?? 0);
      const bPct = Math.abs(b[1].row.changePct ?? 0);
      const aHasTheme = Number(a[1].events.some((event) => event.kind === "theme_link"));
      const bHasTheme = Number(b[1].events.some((event) => event.kind === "theme_link"));
      return bHasTheme - aHasTheme || bPct - aPct || a[0].localeCompare(b[0]);
    })
    .slice(0, TARGETED_MATERIAL_CANDIDATE_LIMIT);
  const targetedMaterial = await mapLimit(targetedRows, TARGETED_MATERIAL_CONCURRENCY, async ([ticker, value]) => ({
    ticker,
    event: await eventFromTargetedMaterial(value.row, asOf),
  }));
  for (const result of targetedMaterial) {
    if (result.status !== "fulfilled" || !result.value.event) continue;
    const current = byTicker.get(result.value.ticker);
    if (!current) continue;
    byTicker.set(result.value.ticker, { ...current, events: [...current.events, result.value.event] });
  }

  if (DISCOVERY_FLOW_CACHE_ENABLED) {
    const histories = await readSupplyDemandHistoryByTickers([...byTicker.keys()], 10);
    for (const [ticker, history] of Object.entries(histories)) {
      const event = eventFromFlowHistory(history);
      if (!event) continue;
      const current = byTicker.get(ticker);
      if (!current) continue;
      byTicker.set(ticker, { ...current, events: [...current.events, event] });
    }
  }

  const candidates = [...byTicker.entries()].map(([ticker, { row, events }]): DiscoveryCandidate => {
    const def = resolveStock(ticker);
    const direction: NonNullable<DiscoveryEvent["direction"]> =
      typeof row.changePct !== "number" ? "flat" : row.changePct > 0 ? "up" : row.changePct < 0 ? "down" : "flat";
    const directedEvents: DiscoveryEvent[] = events.map((event) => event.direction ? event : { ...event, direction });
    const sector = inferDiscoverySectorLabel(ticker, directedEvents, themeSignals.get(ticker), asOf);
    const candidateBase: DiscoveryCandidate = {
      ticker,
      market: row.market,
      events: directedEvents,
      asOf,
      sector,
      ...(typeof row.marketCapRank === "number" ? { marketCapRank: row.marketCapRank } : {}),
    };
    const reason = discoveryWhy(candidateBase);
    return {
      ticker,
      market: row.market,
      country: (def?.country ?? "KR") as StockCountry,
      naverCode: row.naverCode,
      sector,
      events: directedEvents,
      asOf,
      ...(typeof row.marketCapRank === "number" ? { marketCapRank: row.marketCapRank } : {}),
      ...(hasDisplayWhyEvent(candidateBase) ? { reason } : {}),
      marquee: def?.marquee === true,
    };
  });
  const ranked = rankDiscoveryCandidates(candidates, { maxCandidates: 100 });
  const rowsByTicker = new Map([...byTicker.entries()].map(([ticker, value]) => [ticker, value.row]));
  const fronts: Record<string, DiscoveryFrontSeed> = {};
  const stocks: DiscoveryStockPayload[] = [];

  const sparklineRows = await mapLimit(
    ranked.slice(0, 100),
    SPARKLINE_CONCURRENCY,
    async (candidate) => ({
      ticker: candidate.ticker,
      sparkline: candidate.naverCode ? (await fetchStockDaily(candidate.naverCode, 110)).closes.slice(-42) : [],
    })
  );
  const sparklineByTicker = new Map(
    sparklineRows
      .filter((row): row is PromiseFulfilledResult<{ ticker: string; sparkline: number[] }> => row.status === "fulfilled")
      .map((row) => [row.value.ticker, row.value.sparkline] as const)
  );

  for (const candidate of ranked) {
    const row = rowsByTicker.get(candidate.ticker);
    if (!row) continue;
    const attention = attentionMap[candidate.ticker];
    stocks.push(stockPayload(row, candidate));
    fronts[candidate.ticker] = frontSeed(row, candidate, attention, themeSignals.get(candidate.ticker), sparklineByTicker.get(candidate.ticker) ?? []);
  }
  const raritySets = applyAxisRarity(stocks.map((stock) => fronts[stock.canonical]?.axisSignals ?? []));
  stocks.forEach((stock, index) => {
    const current = fronts[stock.canonical];
    const axisSignals = raritySets[index];
    if (!current || !axisSignals) return;
    fronts[stock.canonical] = {
      ...current,
      axisSignals,
      axisHook: selectMultiAxisHook(axisSignals),
    };
  });

  return {
    asOf,
    stocks,
    fronts,
    confidence: stocks.length >= 30 ? "H" : stocks.length >= 10 ? "M" : "L",
    source: DISCOVERY_SOURCE_LABEL,
  };
}
