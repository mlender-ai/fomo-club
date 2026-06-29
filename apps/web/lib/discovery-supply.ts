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
  synthesizeDiscoveryInsight,
  type AxisSignal,
  type CardFrontSignals,
  type DiscoveryCandidate,
  type DiscoveryThemeBundleCard,
  type DiscoveryThemeBundleItem,
  type DiscoveryEvent,
  type DiscoveryMarket,
  type FomoScoreResult,
  type InvestorFlow,
  type MultiAxisHookSelection,
  type SectorStock,
  type StockCountry,
  type RawArticle,
} from "@fomo/core";
import { fetchDartDisclosuresByStock, fetchDartDisclosuresForCode, type DartDisclosureHit } from "./dart-disclosures";
import { fetchNaverCompanyResearch, fetchNaverStockNews, fetchYahooStockNews } from "./fomo-news-sources";
import type { DiscoveryCountryScope, DiscoveryMarketRow } from "./market-source-types";
import { relatedTo, type RelatedNode } from "./relation-graph";
import { fetchRecentSecFilings } from "./sec-edgar";
import { fetchStockDaily } from "./stock-front";
import { computeStockAttentionSignals, type StockAttentionSignal } from "./stock-signal-coverage";
import { resolveCardHeadline, type CardHeadline } from "./card-headline";
import { readSupplyDemandHistoryByTickers } from "./supply-demand-store";
import { fetchUsMarketRows, latestUsSessionAsOf } from "./us-market-source";
import { US_DISCOVERY_SYMBOLS } from "./us-symbols";
import { reprocessNewsHook, ruleReprocessNewsHook, type NewsHookInput } from "./news-reprocess";
import { synthesizeWhyDrivenInsight } from "./insight-synthesis";
import { isAbstractTemplate } from "./copy-guards";

const UA = { "User-Agent": "Mozilla/5.0", Accept: "application/json,text/plain,*/*" };
const MARKETS: DiscoveryMarket[] = ["KOSPI", "KOSDAQ"];
const PAGE_SIZE = 100;
const PAGES_PER_MARKET = 10;
const SPARKLINE_CONCURRENCY = 8;
const DISCOVERY_DECK_CARD_COUNT = 50;
const DISCOVERY_RECOVERY_MIN_CARDS = 12;
const DISCOVERY_RECOVERY_FAMOUS_FRONT_CUTOFF = 30;
const TARGETED_MATERIAL_DEFAULT_ENABLED = process.env.DISCOVERY_TARGETED_MATERIAL !== "0";
const DISCOVERY_FLOW_CACHE_ENABLED = process.env.DISCOVERY_FLOW_CACHE !== "0";
const THEME_BUNDLE_MAX_CARDS = 2;
const THEME_BUNDLE_MIN_ITEMS = 2;
const THEME_BUNDLE_MAX_ITEMS = 4;
const TARGETED_MATERIAL_CANDIDATE_LIMIT = TARGETED_MATERIAL_DEFAULT_ENABLED
  ? Math.max(0, Math.min(720, Number(process.env.DISCOVERY_TARGETED_MATERIAL_LIMIT ?? 720) || 720))
  : 0;
const TARGETED_MATERIAL_CONCURRENCY = 4;
const NON_STOCK_NAME_PATTERN = /ETF|ETN|KODEX|TIGER|ACE|RISE|SOL\s|PLUS|KBSTAR|HANARO|히어로즈|레버리지|인버스|선물/i;
const MATERIAL_NEWS_NOISE =
  /인기검색|검색\s?순위|주요\s?뉴스|오늘의\s?증시|마감\s?시황|장중\s?시황|특징주\s?모음|주식\s?초고수|초고수|단타|ETF|ETN|상장지수|레버리지|인버스|TOP\s?\d|상위\s?\d|회장|최고경영자|CEO|고백|회고|소회|인터뷰|기부|ESG|봉사|사회공헌|미담|창업주|오너|가문|고향|강연|도서|출간|어려울\s?때마다|찾았다/i;
const MATERIAL_NEWS_CATALYST =
  /공시|계약|공급계약|수주|납품|실적|매출|영업이익|순이익|가이던스|전망치|컨센서스|어닝|흑자|적자|턴어라운드|임상|허가|승인|FDA|품목허가|신약|치료제|기술이전|라이선스|증설|공장|양산|수율|수주잔고|M&A|인수|합병|지분|투자|유상증자|무상증자|자사주|배당|분할|상장|정부|정책|규제|지원|보조금|관세|제재|신제품|출시|개발|특허|공급|독점|선정|채택|수출|수입|국책|프로젝트|수혜|클러스터|산단|거점|밸류체인|관련주|부각|모멘텀|호재|주목|협력|제휴/i;
const US_MATERIAL_NEWS_NOISE =
  /price\s?target|target price|\braises?\s+PT\b|\bPT\s+on\b|analyst|rating|upgrade|downgrade|initiates?|maintains?|reiterates?|buybacks?\s+explained|history of|buy,\s*sell,\s*or\s*hold|should you buy|stock to buy|better buy|which .* stock|what investors should know|\b[A-Z]{1,6}\s+investors?\b|investors?\s+(?:have|can|should|alert|deadline|opportunity|reminder|notice)|shareholders?|class action|lawsuit|law firm|securities fraud|motley fool|zacks|benzinga|investorplace|approach with caution|missing link|strain inside|what you|can it|market rotation|running out of power|internet.?s .+ odd duck|all-time low|gaining ground|more significant dip|boom is|fears hit|gains as market dips|limps along|afterglow is gone|and more stocks|more stocks that|stocks that|stock market today|market roundup|why .* stock (?:is )?(?:up|down|rising|falling)|\b(?:is|are|was|were)?\s*(?:up|down|higher|lower|gains?|loses?|rises?|falls?)\s+\d+(?:\.\d+)?%|\b(?:is|are|was|were)\s+(?:up|down|higher|lower)\b|shares? (?:rise|fall|slip|jump|gain|lose) after hours/i;
const US_MATERIAL_NEWS_CATALYST =
  /earnings|results|revenue|profit|margin|guidance|forecast|quarter|q[1-4]|contract|deal|order|supply|supplier|customer|partnership|launch|unveil|product|chip|gpu|ai|data center|approval|fda|trial|drug|sec|8-k|10-q|filing|acquisition|merger|stake|investment|buyback authorization|dividend/i;
const DISCOVERY_SOURCE_LABEL = TARGETED_MATERIAL_DEFAULT_ENABLED
  ? "네이버/KR 시세·DART·수급 캐시·Twelve Data/US 시세·SEC"
  : "시장 시세·공시·수급 캐시";
const MARKET_LABELS = new Set(["KOSPI", "KOSDAQ", "NASDAQ", "NYSE"]);
const INDUSTRY_HINTS: Array<{ label: string; pattern: RegExp }> = [
  { label: "유통", pattern: /유통|백화점|신세계|광주신세계|대형마트|편의점/i },
  { label: "화학", pattern: /화학|케미칼|석유화학|롯데케미칼/i },
  { label: "에너지", pattern: /에너지|태양광|풍력|신재생|VPP|발전|전력|수소|ESS|일진전기|LS ELECTRIC|LS\b|현대일렉트릭/i },
  { label: "금융", pattern: /SK증권|유안타증권|교보증권|대신증권|현대차증권|유진투자증권|한화투자증권|키움증권|NH투자증권|미래에셋증권|한국금융지주|DB손해보험|현대해상|한화생명|케이뱅크/i },
  { label: "반도체", pattern: /반도체|HBM|메모리|파운드리|MLCC|기판|웨이퍼|EUV|패키징|공정|테스|심텍/i },
  { label: "건설", pattern: /건설|건설사|대우건설|현대건설|삼성E&A/i },
  { label: "AI", pattern: /\b(?:AI|GPU|SW|Agentic|OS)\b|인공지능|클라우드|데이터센터|소프트웨어|문서|에이전틱|마키나락스|엠로/i },
  { label: "2차전지", pattern: /2차전지|이차전지|배터리|전지|리튬|양극재|음극재|전해질|분리막/i },
  { label: "방산", pattern: /방산|디펜스|국방|무기|유도무기|항공우주|군|KAI|LIG|로템|함정/i },
  { label: "바이오", pattern: /바이오|헬스케어|제약|신약|임상|항암|의료|진단|치료제|의약품|올릭스|한올바이오/i },
  { label: "원자력", pattern: /원전|원자력|SMR|소형모듈|한전|전력기술/i },
  { label: "인터넷", pattern: /네이버|카카오|플랫폼|포털|커머스|웹툰|콘텐츠/i },
  { label: "금융", pattern: /금융|은행|보험|손해보험|증권|캐피탈|핀테크|결제/i },
  { label: "게임", pattern: /게임|엔씨|크래프톤|위메이드|넷마블|넵튠/i },
  { label: "자동차", pattern: /자동차|현대차|기아|모비스|부품|전장|전기차|타이어|금호타이어/i },
  { label: "조선", pattern: /조선|중공업|선박|해양|조선소/i },
  { label: "로봇", pattern: /로봇|자동화|로보틱스/i },
  { label: "음식료", pattern: /식품|푸드|외식|급식|프레시웨이|음식료/i },
  { label: "화장품", pattern: /화장품|코스메틱|뷰티|제닉|한국콜마|애경산업/i },
  { label: "건자재", pattern: /건자재|레미콘|시멘트|건설자재|유진기업/i },
  { label: "디스플레이", pattern: /디스플레이|OLED|LCD|LG디스플레이/i },
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
  symbol?: string;
  headline?: string;
  headlineProvenance?: CardHeadline;
  whyShown?: string;
  reason?: string;
  insightTag?: string;
  sourceLabel?: string;
  sourceUrl?: string;
}

export type DiscoveryDeckCardPayload =
  | ({ kind: "stock" } & DiscoveryStockPayload)
  | DiscoveryThemeBundleCard;

export interface DiscoveryResponse {
  asOf: string;
  country?: DiscoveryCountryScope;
  stocks: DiscoveryStockPayload[];
  cards?: DiscoveryDeckCardPayload[];
  fronts: Record<string, DiscoveryFrontSeed>;
  confidence: "L" | "M" | "H";
  source: string;
}

export interface BuildDiscoveryResponseOptions {
  targetedMaterial?: boolean;
  targetedMaterialLimit?: number;
  country?: DiscoveryCountryScope;
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
  sector: string;
  rank: number;
  peerCount: number;
  averageChangePct: number;
  relativeChangePct: number;
  positiveCount: number;
}

function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function discoveryAsOf(scope: DiscoveryCountryScope): string {
  return scope === "US" ? latestUsSessionAsOf().date : todayKst();
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

function parseMarketRow(row: RawNaverStock, market: DiscoveryMarket): DiscoveryMarketRow | null {
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
    symbol: naverCode,
    naverCode,
    market,
    country: "KR",
    currency: "KRW",
    ...(row.closePrice ? { priceText: `${row.closePrice.replace(/원$/, "")}원` } : {}),
    ...(changeText ? { changeText } : {}),
    changeDir: dir,
    ...(typeof changePct === "number" ? { changePct } : {}),
    ...(tradingValue ? { tradingValue } : {}),
  };
}

async function fetchMarketPage(market: DiscoveryMarket, page: number): Promise<DiscoveryMarketRow[]> {
  const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=${PAGE_SIZE}`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`naver market ${market} ${page} ${res.status}`);
  const data = (await res.json()) as { stocks?: RawNaverStock[] };
  return (data.stocks ?? []).map((row) => parseMarketRow(row, market)).filter((row): row is DiscoveryMarketRow => row !== null);
}

async function fetchKrMarketRows(): Promise<DiscoveryMarketRow[]> {
  const settled = await Promise.allSettled(
    MARKETS.flatMap((market) => Array.from({ length: PAGES_PER_MARKET }, (_, i) => fetchMarketPage(market, i + 1)))
  );
  const rows = settled.flatMap((row) => (row.status === "fulfilled" ? row.value : []));
  const byCode = new Map<string, DiscoveryMarketRow>();
  for (const row of rows) if (row.naverCode && !byCode.has(row.naverCode)) byCode.set(row.naverCode, row);
  const rankByMarket = new Map<DiscoveryMarket, number>();
  return [...byCode.values()].map((row) => {
    const rank = (rankByMarket.get(row.market) ?? 0) + 1;
    rankByMarket.set(row.market, rank);
    return { ...row, marketCapRank: rank };
  });
}

async function fetchMarketRows(scope: DiscoveryCountryScope): Promise<DiscoveryMarketRow[]> {
  const sources: Array<Promise<DiscoveryMarketRow[]>> =
    scope === "US" ? [fetchUsMarketRows()] : scope === "all" ? [fetchKrMarketRows(), fetchUsMarketRows()] : [fetchKrMarketRows()];
  const settled = await Promise.allSettled(sources);
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

export function isDiscoveryRowAllowedForScope(row: DiscoveryMarketRow, scope: DiscoveryCountryScope): boolean {
  if (scope === "all") return true;
  if (scope === "KR") return row.country === "KR" && (row.market === "KOSPI" || row.market === "KOSDAQ");
  return (
    row.country === "US" &&
    (row.market === "NASDAQ" || row.market === "NYSE") &&
    row.currency === "USD" &&
    !row.naverCode &&
    /^[A-Z.]{1,6}$/.test(row.symbol)
  );
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

function eventFromPrice(row: DiscoveryMarketRow, asOf: string): DiscoveryEvent | null {
  if (typeof row.changePct !== "number" || Math.abs(row.changePct) < 5) return null;
  return {
    kind: "price_move",
    firstSeen: true,
    strength: Math.min(1, Math.abs(row.changePct) / 15),
    source: row.country === "US" ? row.sessionLabel ?? "Twelve Data 시세" : "네이버 시세",
    asOf,
    confidence: "H",
    label: `오늘 가격이 ${row.changePct > 0 ? "+" : ""}${row.changePct.toFixed(2)}% 움직였어요.`,
    changePct: row.changePct,
  };
}

export function cleanMaterialTitle(title: string): string | undefined {
  const cleaned = decodeHtmlEntities(title)
    .replace(/^\s*(?:\[[^\]]+\]|【[^】]+】|\([^)]*\))\s*/g, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?。]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 6 || MATERIAL_NEWS_NOISE.test(cleaned)) return undefined;
  if (!MATERIAL_NEWS_CATALYST.test(cleaned)) return undefined;
  if (/[\[\]{}<>]/.test(cleaned)) return undefined;
  const compact = cleaned.length > 46 ? `${cleaned.slice(0, 44).replace(/\s+\S*$/, "").trim()}…` : cleaned;
  return isFrontHookSafe(`${compact} 소식이 나왔어요.`) ? compact : undefined;
}

export function cleanUsMaterialTitle(title: string): string | undefined {
  const cleaned = decodeHtmlEntities(title)
    .replace(/^\s*(?:\[[^\]]+\]|【[^】]+】|\([^)]*\))\s*/g, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?。]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 6 || MATERIAL_NEWS_NOISE.test(cleaned) || US_MATERIAL_NEWS_NOISE.test(cleaned)) {
    return undefined;
  }
  if (!US_MATERIAL_NEWS_CATALYST.test(cleaned)) return undefined;
  if (/[\[\]{}<>]/.test(cleaned)) return undefined;
  return cleaned;
}

function isPrimaryStockArticle(canonical: string, article: RawArticle): boolean {
  return stockMentionRole(canonical, {
    title: article.title,
    ...(article.summary ? { summary: article.summary } : {}),
  }) === "primary";
}

function isMentionedStockArticle(canonical: string, article: RawArticle): boolean {
  return stockMentionRole(canonical, {
    title: article.title,
    ...(article.summary ? { summary: article.summary } : {}),
  }) !== "none";
}

function pickTargetedMaterialArticle(canonical: string, articles: readonly RawArticle[]): RawArticle | undefined {
  const materialArticles = articles.filter((article) => cleanMaterialTitle(article.title));
  return (
    materialArticles.find((article) => isPrimaryStockArticle(canonical, article)) ??
    materialArticles.find((article) => isMentionedStockArticle(canonical, article))
  );
}

const US_ARTICLE_ALIAS_OVERRIDES: Record<string, string[]> = {
  AMD: ["Advanced Micro Devices"],
  ARM: ["Arm Holdings"],
  APP: ["AppLovin"],
  AVGO: ["Broadcom"],
  BBAI: ["BigBear.ai", "BigBear AI"],
  BE: ["Bloom Energy"],
  COIN: ["Coinbase"],
  CRWD: ["CrowdStrike"],
  DDOG: ["Datadog"],
  DUOL: ["Duolingo"],
  GEV: ["GE Vernova"],
  HOOD: ["Robinhood"],
  IONQ: ["IonQ"],
  LCID: ["Lucid", "Lucid Group"],
  MDB: ["MongoDB"],
  MRVL: ["Marvell"],
  MU: ["Micron"],
  NIO: ["NIO"],
  NVDA: ["Nvidia", "NVIDIA"],
  PLTR: ["Palantir"],
  QBTS: ["D-Wave", "D-Wave Quantum"],
  RGTI: ["Rigetti"],
  RIVN: ["Rivian"],
  RKLB: ["Rocket Lab"],
  SMCI: ["Super Micro", "Supermicro"],
  SOFI: ["SoFi"],
  SOUN: ["SoundHound", "SoundHound AI"],
  SQ: ["Block"],
  TSM: ["Taiwan Semiconductor", "TSMC"],
  TSLA: ["Tesla"],
  UPST: ["Upstart"],
  VRT: ["Vertiv"],
  VST: ["Vistra"],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function usAliasesForRow(row: DiscoveryMarketRow): string[] {
  const symbol = row.symbol.trim().toUpperCase();
  const symbolDef = US_DISCOVERY_SYMBOLS.find((item) => item.symbol === symbol || item.canonical === row.canonical);
  return [
    symbol,
    row.canonical,
    ...(symbolDef ? [symbolDef.canonical] : []),
    ...(US_ARTICLE_ALIAS_OVERRIDES[symbol] ?? []),
  ]
    .map((alias) => alias.trim())
    .filter((alias, index, all) => alias.length >= 2 && all.indexOf(alias) === index);
}

function usAliasMatchScore(text: string, aliases: readonly string[]): number {
  const clean = decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
  if (!clean) return 0;
  let score = 0;
  for (const alias of aliases) {
    if (/^[A-Z0-9.]{1,6}$/.test(alias)) {
      const pattern = new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegExp(alias)}(?:$|[^A-Za-z0-9])`, "i");
      if (pattern.test(clean)) score = Math.max(score, 5);
      continue;
    }
    if (/^[가-힣]/.test(alias)) {
      if (clean.includes(alias)) score = Math.max(score, 3);
      continue;
    }
    const pattern = new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegExp(alias)}(?:$|[^A-Za-z0-9])`, "i");
    if (pattern.test(clean)) score = Math.max(score, Math.min(8, Math.max(4, alias.length / 4)));
  }
  return score;
}

function usArticleMatchScore(row: DiscoveryMarketRow, article: RawArticle): number {
  if (!cleanUsMaterialTitle(article.title)) return 0;
  if (isUsBundleArticleTitle(article.title)) return 0;
  const aliases = usAliasesForRow(row);
  const titleScore = usAliasMatchScore(article.title, aliases);
  const summaryScore = article.summary ? usAliasMatchScore(article.summary, aliases) : 0;
  if (titleScore <= 0) return 0;
  return titleScore * 3 + Math.min(summaryScore, titleScore);
}

function isUsBundleArticleTitle(title: string | undefined): boolean {
  const clean = decodeHtmlEntities(title ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return false;
  const beforeColon = clean.split(":")[0] ?? "";
  const tickers = beforeColon.match(/\b[A-Z]{2,5}\b/g) ?? [];
  if (tickers.length >= 2 && /,|and|&/i.test(beforeColon)) return true;
  return /\bwhy\s+these\s+stocks\b/i.test(clean) && tickers.length >= 2;
}

function cleanMaterialSummary(summary: string | undefined): string | undefined {
  const clean = decodeHtmlEntities(summary ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean || clean.length < 12) return undefined;
  return clean.slice(0, 420);
}

function pickUsTargetedMaterialArticle(row: DiscoveryMarketRow, articles: readonly RawArticle[]): RawArticle | undefined {
  return articles
    .map((article) => ({ article, score: usArticleMatchScore(row, article) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.article;
}

function materialEventFromArticle(article: RawArticle, asOf: string, sourceFallback: string): DiscoveryEvent | null {
  const label = cleanMaterialTitle(article.title);
  if (!label) return null;
  const isResearch = /리서치|증권|투자증권|자산운용|Research/i.test(`${article.source} ${article.category ?? ""}`);
  const isLinked = /종목뉴스\s?연결/i.test(article.source || sourceFallback);
  const sourceName = article.source || sourceFallback;
  const summary = cleanMaterialSummary(article.summary);
  return {
    kind: "news_mention",
    firstSeen: true,
    strength: isLinked ? 0.56 : isResearch ? 0.82 : 0.88,
    source: sourceName,
    asOf: article.publishedAt?.slice(0, 10) || asOf,
    confidence: "H",
    label,
    sourceTitle: label,
    ...(summary ? { summary } : {}),
    sourceName,
    sourceUrl: article.url,
    publishedAt: article.publishedAt,
  };
}

function materialEventFromDisclosure(disclosure: DartDisclosureHit): DiscoveryEvent {
  return {
    kind: "disclosure",
    firstSeen: true,
    strength: 0.96,
    source: disclosure.source,
    asOf: disclosure.asOf,
    confidence: "H",
    label: disclosure.label,
    sourceTitle: disclosure.label,
    summary: disclosure.label,
    sourceName: disclosure.source,
    ...(disclosure.url ? { sourceUrl: disclosure.url } : {}),
  };
}

function materialEventFromUsArticle(article: RawArticle, asOf: string, sourceFallback: string): DiscoveryEvent | null {
  const label = cleanUsMaterialTitle(article.title);
  if (!label) return null;
  const sourceName = article.source || sourceFallback;
  const sourceTitle = decodeHtmlEntities(article.title).replace(/\s+/g, " ").trim();
  const summary = cleanMaterialSummary(article.summary);
  return {
    kind: "news_mention",
    firstSeen: true,
    strength: 0.82,
    source: sourceName,
    asOf: article.publishedAt?.slice(0, 10) || asOf,
    confidence: "M",
    label,
    sourceTitle: sourceTitle || label,
    ...(summary ? { summary } : {}),
    sourceName,
    sourceUrl: article.url,
    publishedAt: article.publishedAt,
  };
}

function materialEventFromAttentionSignal(attention: StockAttentionSignal | undefined, asOf: string): DiscoveryEvent | null {
  const rawLabel = attention?.newsEventLabel?.trim();
  const label = rawLabel ? cleanMaterialTitle(rawLabel) : undefined;
  if (!label || /^오늘 가격이/.test(label)) return null;
  return {
    kind: "news_mention",
    firstSeen: true,
    strength: 0.7,
    source: attention?.newsEventSource || "뉴스 언급",
    asOf,
    confidence: "M",
    label,
    sourceTitle: label,
    summary: label,
    sourceName: attention?.newsEventSource || "뉴스 언급",
  };
}

function newsHookInputFor(
  event: DiscoveryEvent,
  stock: string,
  sector: string | undefined,
  row: DiscoveryMarketRow | undefined,
  asOf: string
): NewsHookInput | undefined {
  if (event.kind !== "news_mention" && event.kind !== "disclosure") return undefined;
  const title = (event.sourceTitle ?? event.label ?? "").trim();
  if (!title) return undefined;
  return {
    stock,
    ...(sector ? { sector } : {}),
    title,
    summary: event.summary,
    source: event.sourceName ?? event.source,
    ...(typeof row?.changePct === "number" ? { changePct: row.changePct } : {}),
    asOf,
  };
}

function withRuleHeadlineHook(
  event: DiscoveryEvent,
  stock: string,
  sector: string | undefined,
  row: DiscoveryMarketRow | undefined,
  asOf: string
): DiscoveryEvent {
  if (event.headlineHook) return event;
  const input = newsHookInputFor(event, stock, sector, row, asOf);
  if (!input) return event;
  const hook = ruleReprocessNewsHook(input);
  return hook ? { ...event, headlineHook: hook } : event;
}

async function eventFromTargetedMaterial(row: DiscoveryMarketRow, asOf: string): Promise<DiscoveryEvent | null> {
  if (row.country !== "KR") {
    const [filingResult, newsResult] = await Promise.allSettled([
      fetchRecentSecFilings(row.symbol, 2),
      fetchYahooStockNews(row.symbol, 6),
    ]);
    const filing = filingResult.status === "fulfilled" ? filingResult.value[0] : undefined;
    if (filing) {
      return {
        kind: "disclosure",
        firstSeen: true,
        strength: 0.92,
        source: filing.source,
        asOf: filing.asOf,
        confidence: "H",
        label: filing.label,
        sourceTitle: filing.label,
        summary: filing.label,
        sourceName: filing.source,
      };
    }
    const stockNews = newsResult.status === "fulfilled" ? pickUsTargetedMaterialArticle(row, newsResult.value) : undefined;
    return stockNews ? materialEventFromUsArticle(stockNews, asOf, "Yahoo Finance") : null;
  }
  if (!row.naverCode || !/^\d{6}$/.test(row.naverCode)) return null;
  const disclosure = (await fetchDartDisclosuresForCode(row.naverCode, row.canonical, asOf).catch(
    (): DartDisclosureHit[] => []
  ))[0];
  if (disclosure) return materialEventFromDisclosure(disclosure);

  const news = await fetchNaverStockNews(row.naverCode, 12);
  const stockNews = pickTargetedMaterialArticle(row.canonical, news);
  if (stockNews) return materialEventFromArticle(stockNews, asOf, "네이버 종목뉴스");

  const research = pickTargetedMaterialArticle(
    row.canonical,
    await fetchNaverCompanyResearch(row.naverCode, row.canonical, 4)
  );
  if (research) return materialEventFromArticle(research, asOf, "네이버 증권 리서치");

  return null;
}

function buildThemeMoveSignals(rows: readonly DiscoveryMarketRow[]): Map<string, ThemeMoveSignal> {
  const groups = new Map<string, Array<{ ticker: string; changePct: number }>>();
  for (const row of rows) {
    const sector = row.sectorHint ?? sectorOf(row.canonical) ?? industryHintForTicker(row.canonical);
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

export function formatThemeDiscoveryLabel(input: {
  sector: string;
  rank: number;
  peerCount: number;
  averageChangePct: number;
  relativeChangePct: number;
  changePct: number;
}): string {
  if (input.rank <= 3) {
    const orderText = input.rank === 1 ? "변동성이 가장 컸어요" : "변동성이 상위권이에요";
    return `같은 ${input.sector} 종목들 중 오늘 ${orderText}.`;
  }
  if (input.averageChangePct < 0 && input.changePct > 0) {
    return `같은 ${input.sector} 종목들이 약한 날에도 이 종목은 플러스권이에요.`;
  }
  return `같은 ${input.sector} 종목들보다 오늘 변동성이 더 컸어요.`;
}

export function formatSectorMarketContextLabel(input: {
  sector: string;
  changePct: number;
  change: string;
}): string {
  const positive = input.changePct > 0;
  const largeMove = Math.abs(input.changePct) >= 10;
  if (positive && largeMove) return `${input.sector} 종목 중 오늘 거래와 변동성이 크게 잡혔어요.`;
  if (positive) return `${input.sector} 종목 중 오늘 변화가 잡혔어요.`;
  return `${input.sector} 종목 중 약세 신호가 같이 잡혔어요.`;
}

function eventFromTheme(row: DiscoveryMarketRow, theme: ThemeMoveSignal | undefined, asOf: string): DiscoveryEvent | null {
  if (!theme || typeof row.changePct !== "number") return null;
  const strongTheme = theme.averageChangePct >= 1.5 && theme.positiveCount >= 2;
  const leadingTheme = theme.rank <= 3 && row.changePct >= 5;
  const positiveOutperformer = row.changePct >= 1.5 && theme.relativeChangePct >= 2;
  const positiveStrongTheme = row.changePct >= 3 && strongTheme && theme.relativeChangePct >= 0;
  const positiveSectorSpike = row.changePct >= 7 && theme.relativeChangePct >= 0;
  if (!leadingTheme && !positiveOutperformer && !positiveStrongTheme && !positiveSectorSpike) return null;
  const label = formatThemeDiscoveryLabel({ ...theme, changePct: row.changePct });
  return {
    kind: "theme_link",
    firstSeen: true,
    strength: Math.min(0.92, 0.48 + Math.abs(theme.averageChangePct) / 10 + Math.abs(row.changePct) / 40),
    source: "FOMO 섹터맵·네이버 시세",
    asOf,
    confidence: "M",
    label,
    changePct: row.changePct,
    themeRank: theme.rank,
    themePeerCount: theme.peerCount,
    themeAverageChangePct: theme.averageChangePct,
    themeRelativeChangePct: theme.relativeChangePct,
  };
}

function pctText(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function industryHintForTicker(ticker: string): string | undefined {
  for (const hint of INDUSTRY_HINTS) {
    if (hint.pattern.test(ticker)) return hint.label;
  }
  return undefined;
}

function eventFromMarketContext(row: DiscoveryMarketRow, theme: ThemeMoveSignal | undefined, asOf: string): DiscoveryEvent {
  const sector = theme?.sector ?? row.sectorHint ?? sectorOf(row.canonical) ?? industryHintForTicker(row.canonical);
  const changePct = row.changePct;
  const change = typeof changePct === "number" ? pctText(changePct) : undefined;
  const source = row.country === "KR" ? "네이버 시세" : row.sessionLabel ?? (typeof row.changePct === "number" || row.priceText ? "Twelve Data 시세" : "FOMO US 종목 사전");
  if (sector && theme && typeof changePct === "number") {
    return {
      kind: "market_context",
      firstSeen: true,
      strength: Math.min(0.72, 0.38 + Math.abs(changePct) / 35 + Math.max(0, theme.relativeChangePct) / 30),
      source,
      asOf,
      confidence: "M",
      label: formatThemeDiscoveryLabel({ ...theme, changePct }),
      changePct,
      themeRank: theme.rank,
      themePeerCount: theme.peerCount,
      themeAverageChangePct: theme.averageChangePct,
      themeRelativeChangePct: theme.relativeChangePct,
    };
  }
  if (sector) {
    if (typeof changePct === "number" && change) {
      return {
        kind: "market_context",
        firstSeen: true,
        strength: Math.min(0.7, 0.44 + Math.abs(changePct) / 50),
        source,
        asOf,
        confidence: "M",
        label: formatSectorMarketContextLabel({ sector, changePct, change }),
        changePct,
      };
    }
    return {
      kind: "market_context",
      firstSeen: true,
      strength: Math.min(0.68, 0.42 + (typeof changePct === "number" ? Math.abs(changePct) / 55 : 0)),
      source,
      asOf,
      confidence: "M",
      label: `${sector} 안에서 새로 확인된 시장 흐름이 있어요.`,
      ...(typeof changePct === "number" ? { changePct } : {}),
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
      label: `${row.market} 안에서 새로 눈에 들어온 종목이에요.`,
      changePct,
    };
  }
  return {
    kind: "market_context",
    firstSeen: true,
    strength: 0.32,
    source,
    asOf,
    confidence: "L",
    label: `${row.market} 안에서 새로 확인된 시장 흐름이 있어요.`,
  };
}

function flowSharesText(net: number): string {
  const abs = Math.abs(net);
  if (abs >= 10_000) return `${Math.round(abs / 10_000).toLocaleString("en-US")}만주`;
  return `${abs.toLocaleString("en-US")}주`;
}

function eventFromFlowHistory(history: readonly InvestorFlow[]): DiscoveryEvent | null {
  if (history.length === 0) return null;
  const streak = investorNetStreak(history);
  const useForeign = streak.foreign >= streak.institution;
  const n = Math.max(streak.foreign, streak.institution);
  if (n < 2) return null;
  const actor = useForeign ? "외국인이" : "기관이";
  const latest = [...history].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  const latestNet = latest ? (useForeign ? latest.foreignNet : latest.institutionNet) : undefined;
  return {
    kind: "flow_entry",
    firstSeen: true,
    strength: Math.min(1, 0.52 + n / 10),
    source: "KRX 수급",
    asOf: history[0]?.date ?? todayKst(),
    confidence: "H",
    label: `${actor} ${n}일째 사는 중이에요.`,
    flowActor: useForeign ? "foreign" : "institution",
    flowDays: n,
    ...(typeof latestNet === "number" && latestNet > 0 ? { flowAmountText: flowSharesText(latestNet) } : {}),
  };
}

function volumeRatioFromVolumes(volumes: readonly number[]): number | undefined {
  if (volumes.length < 6) return undefined;
  const today = volumes[volumes.length - 1];
  if (typeof today !== "number" || today <= 0) return undefined;
  const prev = volumes.slice(-21, -1).filter((value) => value > 0);
  if (prev.length < 5) return undefined;
  const avg = prev.reduce((sum, value) => sum + value, 0) / prev.length;
  return avg > 0 ? today / avg : undefined;
}

function eventFromVolume(row: DiscoveryMarketRow, ratio: number | undefined, asOf: string): DiscoveryEvent | null {
  if (typeof ratio !== "number" || ratio < 1.8 || row.changeDir === "down") return null;
  return {
    kind: "volume_spike",
    firstSeen: true,
    strength: Math.min(1, 0.44 + ratio / 6),
    source: row.country === "KR" ? "네이버 일봉" : row.sessionLabel ?? "거래량",
    asOf,
    confidence: "H",
    direction: row.changeDir ?? (typeof row.changePct === "number" && row.changePct > 0 ? "up" : "flat"),
    label: `거래가 평소 ${ratio.toFixed(1)}배로 늘었어요.`,
    volumeRatio: Math.round(ratio * 10) / 10,
    ...(typeof row.changePct === "number" ? { changePct: row.changePct } : {}),
  };
}

function enrichEventWithRow(
  event: DiscoveryEvent,
  row: DiscoveryMarketRow,
  theme: ThemeMoveSignal | undefined,
  direction: NonNullable<DiscoveryEvent["direction"]>
): DiscoveryEvent {
  return {
    ...event,
    ...(event.direction ? {} : { direction }),
    ...(typeof event.changePct === "number" || typeof row.changePct !== "number" ? {} : { changePct: row.changePct }),
    ...((event.kind === "theme_link" || event.kind === "market_context") && theme
      ? {
        themeRank: event.themeRank ?? theme.rank,
        themePeerCount: event.themePeerCount ?? theme.peerCount,
        themeAverageChangePct: event.themeAverageChangePct ?? theme.averageChangePct,
        themeRelativeChangePct: event.themeRelativeChangePct ?? theme.relativeChangePct,
      }
      : {}),
  };
}

export function attachMaterialEventIndicators(
  event: DiscoveryEvent,
  indicators: { changePct?: number; volumeRatio?: number }
): DiscoveryEvent {
  if (event.kind !== "news_mention" && event.kind !== "disclosure") return event;
  return {
    ...event,
    ...(typeof event.changePct === "number" || typeof indicators.changePct !== "number"
      ? {}
      : { changePct: indicators.changePct }),
    ...(typeof event.volumeRatio === "number" || typeof indicators.volumeRatio !== "number"
      ? {}
      : { volumeRatio: indicators.volumeRatio }),
  };
}

function addStaticRecoveryRows(byTicker: Map<string, { row: DiscoveryMarketRow; events: DiscoveryEvent[] }>, asOf: string): void {
  let added = 0;
  for (const def of STOCK_VOCAB) {
    if (added >= 16) return;
    if (def.country !== "KR" || !def.naverCode || byTicker.has(def.canonical)) continue;
    const sector = sectorOf(def.canonical) ?? industryHintForTicker(def.canonical);
    if (!sector) continue;
    byTicker.set(def.canonical, {
      row: {
        canonical: def.canonical,
        symbol: def.naverCode,
        naverCode: def.naverCode,
        market: def.market as DiscoveryMarket,
        country: "KR",
        currency: "KRW",
        marketCapRank: 999,
      },
      events: [
        {
          kind: "market_context",
          firstSeen: false,
          strength: 0.28,
          source: "FOMO 종목 사전",
          asOf,
          confidence: "L",
          direction: "flat",
          label: `${sector} 흐름에서 함께 확인할 종목이에요.`,
        },
      ],
    });
    added += 1;
  }
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
  const hookText = (event.headlineHook ?? event.sourceTitle ?? event.label)?.trim();
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

const HONEST_EMPTY_REASON_PATTERN =
  /아직\s*공개된\s*계기\s*없음|뚜렷한\s*이유|아직\s*안\s*보여|확인되지\s*않았|원문\s*근거|재료\s*확인\s*안/i;

const WHAT_ONLY_REASON_PATTERN =
  /거래가|거래량|평소\s*\d|변동성|종목\s+중|시총\s*\d|오늘\s*[+-]?\d|움직였|강했|셌|동종\s*비교|상대강도|\d+\s*\/\s*\d+/i;

const GENERIC_MATERIAL_REASON_PATTERN =
  /뉴스가\s*있어요|외신이\s*나왔어요|소식이\s*나왔어요|직접\s*언급한\s*뉴스|가격·수급·언급|흐름에서\s*(?:먼저|새로|같이)\s*확인/i;

function isConcreteMaterialReason(text: string | undefined): text is string {
  const value = text?.trim();
  if (!value || value.length < 8) return false;
  if (!isFrontHookSafe(value)) return false;
  if (HONEST_EMPTY_REASON_PATTERN.test(value)) return false;
  if (WHAT_ONLY_REASON_PATTERN.test(value)) return false;
  if (GENERIC_MATERIAL_REASON_PATTERN.test(value)) return false;
  return true;
}

function frontMaterialReason(front: DiscoveryFrontSeed | undefined): { reason: string; sourceLabel?: string } | undefined {
  const label = front?.signals.newsEventLabel?.trim();
  const source = front?.signals.newsEventSource?.trim();
  if (isConcreteMaterialReason(label)) {
    return { reason: label, ...(source ? { sourceLabel: source } : {}) };
  }
  if (front?.axisHook?.axis === "time" && isConcreteMaterialReason(front.axisHook.hookText)) {
    const evidenceSource = front.axisHook.evidence.find((item) => item.sourceKind === "news" || item.sourceKind === "official")?.source;
    return {
      reason: front.axisHook.hookText.trim(),
      ...(evidenceSource ? { sourceLabel: evidenceSource } : {}),
    };
  }
  return undefined;
}

function headlineCandidate(
  row: DiscoveryMarketRow,
  candidate: DiscoveryCandidate,
  sector: string | undefined
): DiscoveryCandidate {
  const { synthesizedInsight: _previousSynthesis, ...rest } = candidate;
  const volumeEvent = candidate.events.find((event) => event.kind === "volume_spike" && typeof event.volumeRatio === "number");
  const indicators = {
    ...(typeof row.changePct === "number" ? { changePct: row.changePct } : {}),
    ...(typeof volumeEvent?.volumeRatio === "number" ? { volumeRatio: volumeEvent.volumeRatio } : {}),
  };
  const events = candidate.events.map((event) =>
    attachMaterialEventIndicators(withRuleHeadlineHook(event, candidate.ticker, sector, row, candidate.asOf), indicators)
  );
  return {
    ...rest,
    ...(sector ? { sector } : {}),
    events,
  };
}

async function stockPayload(
  row: DiscoveryMarketRow,
  candidate: DiscoveryCandidate,
  front?: DiscoveryFrontSeed
): Promise<DiscoveryStockPayload> {
  const def = resolveStock(candidate.ticker);
  const sector = cleanSectorLabel(candidate.sector) ?? (def ? sectorOf(def.canonical) : undefined);
  const resolvedCandidate = headlineCandidate(row, candidate, sector);
  const whyDriven = await synthesizeWhyDrivenInsight(resolvedCandidate);
  const synthesis = whyDriven.insight;
  const frontReason = frontMaterialReason(front);
  const synthesizedWhy = synthesis.headline;
  const why = isConcreteMaterialReason(synthesizedWhy) ? synthesizedWhy : frontReason?.reason ?? synthesizedWhy;
  const sourceEvent = synthesis.primary?.kind === "news_mention" || synthesis.primary?.kind === "disclosure" ? synthesis.primary : undefined;
  const sourceTitle = sourceEvent?.sourceTitle?.trim();
  const sourceName = (sourceEvent?.sourceName ?? sourceEvent?.source)?.trim();
  const sourceLabel = sourceTitle ? `${sourceTitle}${sourceName ? ` · ${sourceName}` : ""}` : sourceName ?? frontReason?.sourceLabel;
  const headline = await resolveCardHeadline({
    candidate: resolvedCandidate,
    synthesis,
    synthesisMethod: whyDriven.method === "ai" ? "ai" : "rule",
    reason: why,
    ...(sourceLabel ? { sourceLabel } : {}),
  });
  return {
    canonical: candidate.ticker,
    market: row.market,
    country: row.country,
    ...(row.naverCode ? { naverCode: row.naverCode } : {}),
    symbol: row.symbol,
    marquee: def?.marquee === true,
    sector: sector ?? inferDiscoverySectorLabel(candidate.ticker, candidate.events, undefined, candidate.asOf),
    headline: headline.text,
    headlineProvenance: headline,
    ...(why ? { whyShown: why, reason: why, insightTag: frontReason && !sourceEvent ? "뉴스 재료" : synthesis.tag } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
    ...(sourceEvent?.sourceUrl ? { sourceUrl: sourceEvent.sourceUrl } : {}),
  };
}

function isSameDayEvent(event: DiscoveryEvent, candidate: DiscoveryCandidate): boolean {
  return event.asOf.slice(0, 10) === candidate.asOf.slice(0, 10);
}

function fallbackContextEvent(candidate: DiscoveryCandidate, allowDown = false): DiscoveryEvent | undefined {
  return candidate.events
    .filter((event) => {
      if (!isSameDayEvent(event, candidate) || event.direction === "flat" || (!allowDown && event.direction === "down")) return false;
      if (event.kind === "price_move") return false;
      if (event.kind === "theme_link") return true;
      if (event.kind !== "market_context") return true;
      return !!event.label && !/^KOSPI |^KOSDAQ |^NASDAQ |^NYSE /.test(event.label);
    })
    .sort((a, b) => {
      const aTheme = a.kind === "theme_link" ? 1 : 0;
      const bTheme = b.kind === "theme_link" ? 1 : 0;
      return bTheme - aTheme || b.strength - a.strength || a.kind.localeCompare(b.kind);
    })[0];
}

function fallbackContextQuality(event: DiscoveryEvent): number {
  if (event.kind === "theme_link") return 2;
  if (event.kind === "market_context" && event.label && !/^코스피 |^코스닥 |^NASDAQ |^NYSE /.test(event.label)) return 1;
  return 0;
}

function fallbackDiscoveryReason(candidate: DiscoveryCandidate): string {
  return discoveryWhy(candidate);
}

function logDiscoverySignalCoverage(stage: string, candidates: readonly DiscoveryCandidate[]): void {
  const byKind = new Map<DiscoveryEvent["kind"], number>();
  let material = 0;
  let flow = 0;
  let contextOnly = 0;
  let priceOnly = 0;
  let displayWhy = 0;
  for (const candidate of candidates) {
    const kinds = new Set(candidate.events.map((event) => event.kind));
    for (const kind of kinds) byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    if (kinds.has("disclosure") || kinds.has("news_mention")) material += 1;
    if (kinds.has("flow_entry")) flow += 1;
    if ((kinds.has("theme_link") || kinds.has("market_context")) && !kinds.has("disclosure") && !kinds.has("news_mention") && !kinds.has("flow_entry") && !kinds.has("volume_spike")) {
      contextOnly += 1;
    }
    if (kinds.has("price_move") && kinds.size === 1) priceOnly += 1;
    if (hasDisplayWhyEvent(candidate)) displayWhy += 1;
  }
  console.info("[discovery-supply] signal coverage", {
    stage,
    candidates: candidates.length,
    displayWhy,
    material,
    flow,
    contextOnly,
    priceOnly,
    byKind: Object.fromEntries([...byKind.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
  });
}

export function recoverDiscoveryCandidates(
  ranked: readonly DiscoveryCandidate[],
  candidates: readonly DiscoveryCandidate[],
  maxCandidates = DISCOVERY_DECK_CARD_COUNT
): DiscoveryCandidate[] {
  if (ranked.length >= maxCandidates) return ranked.slice(0, maxCandidates);
  if (ranked.length >= DISCOVERY_RECOVERY_MIN_CARDS && candidates.length <= ranked.length) return ranked.slice(0, maxCandidates);
  const used = new Set(ranked.map((candidate) => candidate.ticker));
  const fallback = candidates
    .filter((candidate) => !used.has(candidate.ticker))
    .filter((candidate) => fallbackContextEvent(candidate) !== undefined)
    .map((candidate, index) => ({
      candidate: {
        ...candidate,
        reason: candidate.reason ?? fallbackDiscoveryReason(candidate),
      },
      index,
      context: fallbackContextEvent(candidate)!,
    }))
    .sort((a, b) => {
      const aFamous = typeof a.candidate.marketCapRank === "number" && a.candidate.marketCapRank <= DISCOVERY_RECOVERY_FAMOUS_FRONT_CUTOFF ? 1 : 0;
      const bFamous = typeof b.candidate.marketCapRank === "number" && b.candidate.marketCapRank <= DISCOVERY_RECOVERY_FAMOUS_FRONT_CUTOFF ? 1 : 0;
      const aTheme = a.context.kind === "theme_link" ? 1 : 0;
      const bTheme = b.context.kind === "theme_link" ? 1 : 0;
      const aQuality = fallbackContextQuality(a.context);
      const bQuality = fallbackContextQuality(b.context);
      return (
        aFamous - bFamous ||
        bTheme - aTheme ||
        bQuality - aQuality ||
        b.context.strength - a.context.strength ||
        (a.candidate.marketCapRank ?? 9999) - (b.candidate.marketCapRank ?? 9999) ||
        a.index - b.index ||
        a.candidate.ticker.localeCompare(b.candidate.ticker)
      );
    })
    .map((row) => row.candidate);

  const usedAfterFallback = new Set([...ranked, ...fallback].map((candidate) => candidate.ticker));
  const looseFallback = candidates
    .filter((candidate) => !usedAfterFallback.has(candidate.ticker))
    .filter((candidate) => fallbackContextEvent(candidate, true) !== undefined)
    .map((candidate, index) => ({
      candidate: {
        ...candidate,
        reason: candidate.reason ?? fallbackDiscoveryReason(candidate),
      },
      index,
      context: fallbackContextEvent(candidate, true)!,
    }))
    .sort((a, b) => {
      const aFamous = typeof a.candidate.marketCapRank === "number" && a.candidate.marketCapRank <= DISCOVERY_RECOVERY_FAMOUS_FRONT_CUTOFF ? 1 : 0;
      const bFamous = typeof b.candidate.marketCapRank === "number" && b.candidate.marketCapRank <= DISCOVERY_RECOVERY_FAMOUS_FRONT_CUTOFF ? 1 : 0;
      const aQuality = fallbackContextQuality(a.context);
      const bQuality = fallbackContextQuality(b.context);
      return aFamous - bFamous || bQuality - aQuality || b.context.strength - a.context.strength || a.index - b.index;
    })
    .map((row) => row.candidate);

  return [...ranked, ...fallback, ...looseFallback].slice(0, maxCandidates);
}

function isFamousDiscoveryCandidate(candidate: DiscoveryCandidate): boolean {
  if (candidate.marquee) return true;
  const rank = candidate.marketCapRank;
  return typeof rank === "number" && Number.isFinite(rank) && rank > 0 && rank <= DISCOVERY_RECOVERY_FAMOUS_FRONT_CUTOFF;
}

function pushFamousCandidatesOutOfFrontBand(
  candidates: readonly DiscoveryCandidate[],
  frontBand = 16
): DiscoveryCandidate[] {
  const out = [...candidates];
  for (let i = 0; i < Math.min(frontBand, out.length); i += 1) {
    const current = out[i];
    if (!current || !isFamousDiscoveryCandidate(current)) continue;
    const currentHasDisplayWhy = hasDisplayWhyEvent(current);
    const replacement = out.findIndex(
      (row, index) =>
        index >= frontBand &&
        !isFamousDiscoveryCandidate(row) &&
        (!currentHasDisplayWhy || hasDisplayWhyEvent(row))
    );
    if (replacement < 0) break;
    out[i] = out[replacement]!;
    out[replacement] = current;
  }
  return out;
}

async function hydrateFrontBandMaterial(
  candidates: readonly DiscoveryCandidate[],
  rowsByTicker: ReadonlyMap<string, DiscoveryMarketRow>,
  asOf: string,
  frontBand = 16
): Promise<DiscoveryCandidate[]> {
  const out = [...candidates];
  const targets = out
    .slice(0, frontBand)
    .map((candidate, index) => ({ candidate, index, row: rowsByTicker.get(candidate.ticker) }))
    .filter((item): item is { candidate: DiscoveryCandidate; index: number; row: DiscoveryMarketRow } =>
      !!item.row && !hasDisplayWhyEvent(item.candidate)
    );
  if (targets.length === 0) return out;

  const hydrated = await mapLimit(targets, 3, async (item) => ({
    index: item.index,
    event: await eventFromTargetedMaterial(item.row, asOf),
  }));
  for (const result of hydrated) {
    if (result.status !== "fulfilled" || !result.value.event) continue;
    const current = out[result.value.index];
    if (!current) continue;
    const next: DiscoveryCandidate = {
      ...current,
      events: [
        ...current.events,
        withRuleHeadlineHook(
          enrichEventWithRow(
            result.value.event,
            rowsByTicker.get(current.ticker)!,
            undefined,
            result.value.event.direction ?? "up"
          ),
          current.ticker,
          current.sector,
          rowsByTicker.get(current.ticker),
          asOf
        ),
      ],
    };
    if (!hasDisplayWhyEvent(next)) continue;
    out[result.value.index] = {
      ...next,
      reason: discoveryWhy(next),
    };
  }
  return out;
}

async function hydrateReachedNewsHooks(
  candidates: readonly DiscoveryCandidate[],
  rowsByTicker: ReadonlyMap<string, DiscoveryMarketRow>,
  asOf: string
): Promise<DiscoveryCandidate[]> {
  const targets = candidates
    .map((candidate, index) => {
      const primary = synthesizeDiscoveryInsight(candidate).primary;
      const input = primary ? newsHookInputFor(primary, candidate.ticker, candidate.sector, rowsByTicker.get(candidate.ticker), asOf) : undefined;
      return (primary?.kind === "news_mention" || primary?.kind === "disclosure") && input ? { candidate, index, primary, input } : undefined;
    })
    .filter((row): row is { candidate: DiscoveryCandidate; index: number; primary: DiscoveryEvent; input: NewsHookInput } => !!row);
  if (targets.length === 0) return [...candidates];

  const results = await mapLimit(targets, 3, async (target) => ({
    index: target.index,
    hook: (await reprocessNewsHook(target.input)).hook,
    primary: target.primary,
  }));
  const out = [...candidates];
  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value.hook) continue;
    const hook = result.value.hook;
    const current = out[result.value.index];
    if (!current) continue;
    out[result.value.index] = {
      ...current,
      events: current.events.map((event) =>
        event === result.value.primary ? { ...event, headlineHook: hook } : event
      ),
    };
  }
  return out;
}

function attachReachedVolumeEvents(
  candidates: readonly DiscoveryCandidate[],
  rowsByTicker: ReadonlyMap<string, DiscoveryMarketRow>,
  dailyByTicker: ReadonlyMap<string, { closes: number[]; volumes: number[] }>,
  asOf: string
): DiscoveryCandidate[] {
  return candidates.map((candidate) => {
    if (candidate.events.some((event) => event.kind === "volume_spike")) return candidate;
    const row = rowsByTicker.get(candidate.ticker);
    const daily = dailyByTicker.get(candidate.ticker);
    if (!row || !daily) return candidate;
    const event = eventFromVolume(row, volumeRatioFromVolumes(daily.volumes), asOf);
    if (!event) return candidate;
    return {
      ...candidate,
      events: [...candidate.events, event],
    };
  });
}

async function hydrateReachedWhySynthesis(candidates: readonly DiscoveryCandidate[]): Promise<DiscoveryCandidate[]> {
  const results = await mapLimit(candidates, 3, async (candidate) => ({
    ticker: candidate.ticker,
    result: await synthesizeWhyDrivenInsight(candidate),
  }));
  return candidates.map((candidate) => {
    const found = results.find((row) => row.status === "fulfilled" && row.value.ticker === candidate.ticker);
    if (!found || found.status !== "fulfilled") return candidate;
    const insight = found.value.result.insight;
    if (!insight.primary || isAbstractTemplate(insight.headline)) return candidate;
    return {
      ...candidate,
      reason: insight.headline,
      synthesizedInsight: insight,
    };
  });
}

function frontSeed(
  row: DiscoveryMarketRow,
  candidate: DiscoveryCandidate,
  attention: StockAttentionSignal | undefined,
  theme: ThemeMoveSignal | undefined,
  sparkline: number[]
): DiscoveryFrontSeed {
  const currentNewsEvent = candidate.events.find(
    (event) => isDeckDisplayEvent(event, candidate) && (event.kind === "news_mention" || event.kind === "disclosure")
  );
  const materialMentionScore =
    currentNewsEvent?.kind === "news_mention" || currentNewsEvent?.kind === "disclosure"
      ? Math.round(Math.max(0, Math.min(1, currentNewsEvent.strength)) * 100)
      : undefined;
  const currentNewsEventLabel = currentNewsEvent?.headlineHook ?? currentNewsEvent?.label;
  const volumeEvent = candidate.events.find((event) => event.kind === "volume_spike" && typeof event.volumeRatio === "number");
  const mentionSignals =
    attention
      ? { mentionCount: attention.mentionCount, mentionScore: attention.mentionScore }
      : typeof materialMentionScore === "number"
        ? { mentionCount: 1, mentionScore: materialMentionScore }
        : undefined;
  const signals: CardFrontSignals = {
    ...(typeof row.changePct === "number" ? { changePct: row.changePct } : {}),
    ...(typeof volumeEvent?.volumeRatio === "number" ? { volumeRatio: volumeEvent.volumeRatio } : {}),
    ...(mentionSignals ? mentionSignals : {}),
    ...(currentNewsEventLabel ? { newsEventLabel: currentNewsEventLabel } : {}),
    ...(currentNewsEvent?.source ? { newsEventSource: currentNewsEvent.source } : {}),
    ...(row.marketCapRank && row.marketCapRankSource !== "curated" ? { marketCapRank: { scope: "market", market: row.market, rank: row.marketCapRank } } : {}),
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

function relationCopy(relation: RelatedNode["relation"]): string {
  switch (relation) {
    case "customer":
      return "수요처";
    case "supplier":
      return "공급사";
    case "material":
      return "원재료";
    case "beneficiary":
      return "확산 수혜";
    case "peer":
    default:
      return "비교군";
  }
}

function bundleAnchorEvent(candidate: DiscoveryCandidate): DiscoveryEvent | undefined {
  return candidate.events
    .filter((event) => isDeckDisplayEvent(event, candidate))
    .filter((event) => event.kind === "disclosure" || event.kind === "news_mention" || event.kind === "flow_entry")
    .sort((a, b) => {
      const priority = (event: DiscoveryEvent) =>
        event.kind === "disclosure" ? 0 : event.kind === "news_mention" ? 1 : 2;
      return priority(a) - priority(b) || b.strength - a.strength || a.kind.localeCompare(b.kind);
    })[0];
}

function relationItemFromNode(
  node: RelatedNode,
  row: DiscoveryMarketRow,
): DiscoveryThemeBundleItem {
  return {
    ticker: node.ticker,
    label: node.label,
    market: row.market,
    country: row.country,
    relation: node.relation,
    reason: node.reason,
    source: node.source,
    confidence: node.confidence,
    ...(typeof row.changePct === "number" ? { changePct: row.changePct } : {}),
    ...(node.sector ? { sector: node.sector } : {}),
    ...(row.naverCode ?? node.naverCode ? { naverCode: row.naverCode ?? node.naverCode } : {}),
    ...(row.symbol ?? node.symbol ? { symbol: row.symbol ?? node.symbol } : {}),
  };
}

export function buildThemeBundleCards(
  ranked: readonly DiscoveryCandidate[],
  rowsByTicker: ReadonlyMap<string, DiscoveryMarketRow>,
): DiscoveryThemeBundleCard[] {
  const cards: DiscoveryThemeBundleCard[] = [];
  const usedAnchors = new Set<string>();
  for (const candidate of ranked) {
    if (cards.length >= THEME_BUNDLE_MAX_CARDS) break;
    if (usedAnchors.has(candidate.ticker)) continue;
    const event = bundleAnchorEvent(candidate);
    if (!event?.label) continue;
    const relations = relatedTo({
      kind: "event",
      ticker: candidate.ticker,
      ...(candidate.sector ? { theme: candidate.sector } : {}),
    });
    const items = relations
      .filter((node) => node.ticker !== candidate.ticker)
      .map((node) => {
        const row = rowsByTicker.get(node.ticker);
        return row ? relationItemFromNode(node, row) : null;
      })
      .filter((item): item is DiscoveryThemeBundleItem => item !== null)
      .sort((a, b) => {
        const aRank = rowsByTicker.get(a.ticker)?.marketCapRank ?? 9999;
        const bRank = rowsByTicker.get(b.ticker)?.marketCapRank ?? 9999;
        return aRank - bRank || a.ticker.localeCompare(b.ticker);
      })
      .slice(0, THEME_BUNDLE_MAX_ITEMS);
    if (items.length < THEME_BUNDLE_MIN_ITEMS) continue;
    const theme = candidate.sector ?? "관련 흐름";
    const title = `${theme} 사건으로 같이 볼 종목 ${items.length}개`;
    cards.push({
      kind: "theme_bundle",
      id: `bundle:${candidate.ticker}:${event.kind}:${candidate.asOf.slice(0, 10)}`,
      title,
      subtitle: event.label,
      source: event.source,
      asOf: event.asOf,
      confidence: event.confidence,
      anchorTicker: candidate.ticker,
      relation: "event_bundle",
      items,
    });
    usedAnchors.add(candidate.ticker);
  }
  return cards;
}

function interleaveThemeBundles(
  stocks: readonly DiscoveryStockPayload[],
  bundles: readonly DiscoveryThemeBundleCard[],
): DiscoveryDeckCardPayload[] {
  const cards: DiscoveryDeckCardPayload[] = stocks.map((stock) => ({ kind: "stock", ...stock }));
  if (bundles.length === 0 || cards.length < 8) return cards;
  const out = [...cards];
  bundles.forEach((bundle, index) => {
    const insertAt = Math.min(out.length, 6 + index * 10);
    out.splice(insertAt, 0, bundle);
  });
  return out;
}

export async function buildDiscoveryResponse(options: BuildDiscoveryResponseOptions = {}): Promise<DiscoveryResponse> {
  const scope = options.country ?? "KR";
  const targetedMaterialEnabled = options.targetedMaterial ?? TARGETED_MATERIAL_DEFAULT_ENABLED;
  const targetedMaterialLimit = targetedMaterialEnabled
    ? Math.max(0, Math.min(TARGETED_MATERIAL_CANDIDATE_LIMIT, options.targetedMaterialLimit ?? TARGETED_MATERIAL_CANDIDATE_LIMIT))
    : 0;
  const asOf = discoveryAsOf(scope);
  const [rows, attentionMap] = await Promise.all([
    fetchMarketRows(scope),
    computeStockAttentionSignals().catch((): Record<string, StockAttentionSignal> => ({})),
  ]);
  const vocabByCode = new Map(STOCK_VOCAB.filter((s) => s.naverCode).map((s) => [s.naverCode!, s]));
  const scopedRows = rows.filter((row) => isDiscoveryRowAllowedForScope(row, scope));
  const normalizedRows = scopedRows.map((row) => {
    const def = row.naverCode ? vocabByCode.get(row.naverCode) : undefined;
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
  const byTicker = new Map<string, { row: DiscoveryMarketRow; events: DiscoveryEvent[] }>();

  for (const row of normalizedRows) {
    const ticker = row.canonical;
    if (!eligibleTickers.has(ticker)) continue;
    const theme = themeSignals.get(ticker);
    const events = [eventFromPrice(row, asOf), eventFromTheme(row, theme, asOf), eventFromMarketContext(row, theme, asOf)].filter(
      (event): event is DiscoveryEvent => event !== null
    );
    if (events.length > 0) byTicker.set(ticker, { row: { ...row, canonical: ticker }, events });
  }

  const disclosureMap = await fetchDartDisclosuresByStock(asOf).catch((): Record<string, DartDisclosureHit> => ({}));
  for (const [ticker, disclosure] of Object.entries(disclosureMap)) {
    const def = resolveStock(ticker);
    if (!def?.naverCode || !eligibleTickers.has(def.canonical)) continue;
    const row =
      normalizedRows.find((r) => r.naverCode === def.naverCode) ??
      ({
        canonical: def.canonical,
        symbol: def.naverCode,
        naverCode: def.naverCode,
        market: def.market as DiscoveryMarket,
        country: "KR",
        currency: "KRW",
      } satisfies DiscoveryMarketRow);
    const current = byTicker.get(def.canonical);
    const event = materialEventFromDisclosure(disclosure);
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
    .slice(0, targetedMaterialLimit);
  if (targetedMaterialLimit > 0) {
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
  }

  if (DISCOVERY_FLOW_CACHE_ENABLED) {
    const krTickers = [...byTicker.entries()].filter(([, value]) => value.row.country === "KR").map(([ticker]) => ticker);
    const histories = krTickers.length > 0 ? await readSupplyDemandHistoryByTickers(krTickers, 10) : {};
    for (const [ticker, history] of Object.entries(histories)) {
      const event = eventFromFlowHistory(history);
      if (!event) continue;
      const current = byTicker.get(ticker);
      if (!current) continue;
      byTicker.set(ticker, { ...current, events: [...current.events, event] });
    }
  }

  for (const [ticker, current] of byTicker.entries()) {
    if (current.row.country !== "KR") continue;
    if (current.events.some((event) => event.kind === "disclosure" || event.kind === "news_mention")) continue;
    const event = materialEventFromAttentionSignal(attentionMap[ticker], asOf);
    if (!event) continue;
    byTicker.set(ticker, { ...current, events: [...current.events, event] });
  }

  if (scope !== "US") addStaticRecoveryRows(byTicker, asOf);

  const candidates = [...byTicker.entries()].map(([ticker, { row, events }]): DiscoveryCandidate => {
    const def = resolveStock(ticker);
    const direction: NonNullable<DiscoveryEvent["direction"]> =
      typeof row.changePct !== "number" ? "flat" : row.changePct > 0 ? "up" : row.changePct < 0 ? "down" : "flat";
    const theme = themeSignals.get(ticker);
    const directedEvents: DiscoveryEvent[] = events.map((event) => enrichEventWithRow(event, row, theme, direction));
    const sector = row.sectorHint ?? inferDiscoverySectorLabel(ticker, directedEvents, theme, asOf);
    const hookedEvents = directedEvents.map((event) => withRuleHeadlineHook(event, ticker, sector, row, asOf));
    const candidateBase: DiscoveryCandidate = {
      ticker,
      market: row.market,
      events: hookedEvents,
      asOf,
      sector,
      ...(typeof row.marketCapRank === "number" ? { marketCapRank: row.marketCapRank } : {}),
    };
    const synthesis = synthesizeDiscoveryInsight(candidateBase);
    const reason = synthesis.primary ? synthesis.headline : undefined;
    return {
      ticker,
      market: row.market,
      country: row.country as StockCountry,
      ...(row.naverCode ? { naverCode: row.naverCode } : {}),
      sector,
      events: hookedEvents,
      asOf,
      ...(typeof row.marketCapRank === "number" ? { marketCapRank: row.marketCapRank } : {}),
      ...(reason && hasDisplayWhyEvent(candidateBase) ? { reason } : {}),
      marquee: def?.marquee === true,
    };
  });
  logDiscoverySignalCoverage("before-rank", candidates);
  const rowsByTicker = new Map([...byTicker.entries()].map(([ticker, value]) => [ticker, value.row]));
  let ranked = pushFamousCandidatesOutOfFrontBand(recoverDiscoveryCandidates(
    rankDiscoveryCandidates(candidates, { maxCandidates: DISCOVERY_DECK_CARD_COUNT }),
    candidates,
    DISCOVERY_DECK_CARD_COUNT
  ));
  if (targetedMaterialLimit > 0) {
    ranked = await hydrateFrontBandMaterial(ranked, rowsByTicker, asOf);
  }
  ranked = await hydrateReachedNewsHooks(ranked, rowsByTicker, asOf);
  const fronts: Record<string, DiscoveryFrontSeed> = {};
  const stocks: DiscoveryStockPayload[] = [];

  const dailyRows = await mapLimit(
    ranked.slice(0, DISCOVERY_DECK_CARD_COUNT),
    SPARKLINE_CONCURRENCY,
    async (candidate) => ({
      ticker: candidate.ticker,
      daily: candidate.naverCode
        ? await fetchStockDaily(candidate.naverCode, 110)
        : {
          candles: [],
          closes: rowsByTicker.get(candidate.ticker)?.sparkline ?? [],
          volumes: [],
        },
    })
  );
  const dailyByTicker = new Map(
    dailyRows.flatMap((row) => (row.status === "fulfilled" ? [[row.value.ticker, row.value.daily] as const] : []))
  );
  ranked = attachReachedVolumeEvents(ranked, rowsByTicker, dailyByTicker, asOf);
  ranked = await hydrateReachedWhySynthesis(ranked);
  logDiscoverySignalCoverage("after-rank", ranked);
  const sparklineByTicker = new Map(
    [...dailyByTicker.entries()].map(([ticker, daily]) => [ticker, daily.closes.slice(-42)] as const)
  );

  for (const candidate of ranked) {
    const row = rowsByTicker.get(candidate.ticker);
    if (!row) continue;
    const attention = attentionMap[candidate.ticker];
    const front = frontSeed(row, candidate, attention, themeSignals.get(candidate.ticker), sparklineByTicker.get(candidate.ticker) ?? []);
    const stock = await stockPayload(row, candidate, front);
    const headline = stock.headline?.trim();
    if (stock.headlineProvenance?.provenance === "suppressed" || !headline) continue;
    const isUsStock = row.country === "US" || candidate.country === "US" || stock.country === "US";
    if (isUsStock) {
      const headlineEvent = stock.headlineProvenance?.eventRef;
      const headlineEventKind = headlineEvent?.kind;
      const hasSurfaceMaterial = headlineEventKind === "news_mention" || headlineEventKind === "disclosure";
      const hasGroundedMaterial = Boolean(stock.sourceLabel && (stock.sourceUrl || headlineEvent?.url));
      if (!hasSurfaceMaterial || !hasGroundedMaterial) continue;
    }
    stocks.push(stock);
    fronts[candidate.ticker] = front;
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
  const bundleCards = buildThemeBundleCards(ranked, rowsByTicker);

  return {
    asOf,
    country: scope,
    stocks,
    cards: interleaveThemeBundles(stocks, bundleCards),
    fronts,
    confidence: stocks.length >= DISCOVERY_DECK_CARD_COUNT ? "H" : stocks.length >= 30 ? "M" : "L",
    source: targetedMaterialEnabled ? DISCOVERY_SOURCE_LABEL : "시장 시세·공시·수급 캐시",
  };
}
