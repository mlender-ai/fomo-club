import type { CardVerdict, RawArticle } from "@fomo/core";
import { kstDate } from "./fomo";
import { readFeedContent, readFeedContentByPrefix, writeFeedContent } from "./feed-content-store";
import { fetchCryptoNews } from "./fomo-news-sources";
import type { CoinMarketSnapshot } from "./coin-market-source";

export type CoinIssueType = "regulation" | "network" | "institution" | "onchain" | "macro";
export type CoinIssueDirection = "positive" | "negative" | "neutral";

export interface CoinMaterialItem {
  id: string;
  symbols: string[];
  scope: "coin" | "market";
  type: CoinIssueType;
  typeLabel: string;
  direction: CoinIssueDirection;
  title: string;
  meaning: string;
  source: string;
  url: string;
  publishedAt: string;
}

export interface CoinMaterialCache {
  asOf: string;
  collectedAt: string;
  bySymbol: Record<string, CoinMaterialItem[]>;
  global: CoinMaterialItem[];
}

export interface CoinCause {
  text: string;
  relation: "same-window" | "recent-context";
  sourceLabel: string;
  url: string;
  asOf: string;
  issueId: string;
}

type CoinAlias = { symbol: string; aliases: string[] };

/** 시총 상위권 카드 유니버스와 무관하게 기사 매칭 사전은 30개를 유지한다. */
export const COIN_ALIASES: readonly CoinAlias[] = [
  { symbol: "BTC", aliases: ["비트코인", "bitcoin", "btc"] },
  { symbol: "ETH", aliases: ["이더리움", "이더", "ethereum", "ether", "eth"] },
  { symbol: "USDT", aliases: ["테더", "tether", "usdt"] },
  { symbol: "XRP", aliases: ["리플", "ripple", "xrp"] },
  { symbol: "BNB", aliases: ["바이낸스코인", "bnb"] },
  { symbol: "SOL", aliases: ["솔라나", "solana", "sol"] },
  { symbol: "USDC", aliases: ["유에스디코인", "usd coin", "usdc"] },
  { symbol: "DOGE", aliases: ["도지코인", "dogecoin", "doge"] },
  { symbol: "ADA", aliases: ["에이다", "카르다노", "cardano", "ada"] },
  { symbol: "TRX", aliases: ["트론", "tron", "trx"] },
  { symbol: "AVAX", aliases: ["아발란체", "avalanche", "avax"] },
  { symbol: "LINK", aliases: ["체인링크", "chainlink", "link"] },
  { symbol: "DOT", aliases: ["폴카닷", "polkadot", "dot"] },
  { symbol: "SUI", aliases: ["수이", "sui"] },
  { symbol: "XLM", aliases: ["스텔라루멘", "스텔라", "stellar", "xlm"] },
  { symbol: "HBAR", aliases: ["헤데라", "hedera", "hbar"] },
  { symbol: "BCH", aliases: ["비트코인캐시", "bitcoin cash", "bch"] },
  { symbol: "LTC", aliases: ["라이트코인", "litecoin", "ltc"] },
  { symbol: "TON", aliases: ["톤코인", "toncoin", "ton"] },
  { symbol: "SHIB", aliases: ["시바이누", "shiba inu", "shib"] },
  { symbol: "UNI", aliases: ["유니스왑", "uniswap", "uni"] },
  { symbol: "APT", aliases: ["앱토스", "aptos", "apt"] },
  { symbol: "ETC", aliases: ["이더리움클래식", "ethereum classic", "etc"] },
  { symbol: "NEAR", aliases: ["니어프로토콜", "니어", "near protocol", "near"] },
  { symbol: "ICP", aliases: ["인터넷컴퓨터", "internet computer", "icp"] },
  { symbol: "FIL", aliases: ["파일코인", "filecoin", "fil"] },
  { symbol: "ATOM", aliases: ["코스모스", "cosmos", "atom"] },
  { symbol: "ARB", aliases: ["아비트럼", "arbitrum", "arb"] },
  { symbol: "OP", aliases: ["옵티미즘", "optimism", "op"] },
  { symbol: "AAVE", aliases: ["에이브", "aave"] },
] as const;

const TYPE_LABEL: Record<CoinIssueType, string> = {
  regulation: "규제·법안",
  network: "네트워크",
  institution: "기관·트레저리",
  onchain: "온체인·수급",
  macro: "거시 연동",
};

const CRYPTO_CONTEXT = /가상자산|암호화폐|코인|블록체인|비트코인|이더리움|BTC|ETH|스테이블코인|디지털자산/i;
const OMNIBUS_BRIEFING = /뉴스브리핑|시세브리핑|주요 뉴스|오늘의 코인|마켓 브리핑|팟캐스트/i;
const ISSUE_PATTERNS: Array<{ type: CoinIssueType; pattern: RegExp }> = [
  { type: "regulation", pattern: /CLARITY|클래리티|법안|규제|SEC|의회|상원|하원|ETF|과세|세제|승인|소송/i },
  { type: "network", pattern: /업그레이드|하드포크|소프트포크|반감기|메인넷|테스트넷|펙트라|Pectra|Fusaka|프로토콜/i },
  { type: "institution", pattern: /트레저리|재무전략|기관|기업.{0,12}(매수|보유|투자)|커스터디|수탁|상장|비트마인|BitMine|MicroStrategy|스트래티지/i },
  { type: "onchain", pattern: /고래|온체인|거래소.{0,12}(순유입|순유출|입금|출금)|순유입|순유출|언락|락업|스테이킹|CVD|채굴자|청산|레버리지|미결제약정/i },
  { type: "macro", pattern: /연준|FOMC|금리|달러(?:화|\s?지수|\s?인덱스|\s?강세|\s?약세)|DXY|CPI|PPI|물가|고용|유동성|위험자산|국채|통화정책/i },
];

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasMatches(text: string, alias: string): boolean {
  if (/^[a-z0-9 ]+$/i.test(alias)) {
    return new RegExp(`(^|[^a-z0-9])${escaped(alias)}([^a-z0-9]|$)`, "i").test(text);
  }
  return text.toLocaleLowerCase("ko-KR").includes(alias.toLocaleLowerCase("ko-KR"));
}

export function matchCoinSymbols(text: string): string[] {
  const matches = COIN_ALIASES.filter((coin) => coin.aliases.some((alias) => aliasMatches(text, alias))).map((coin) => coin.symbol);
  // 파생 자산의 긴 이름이 원 자산 alias를 포함하는 경우(비트코인캐시, 이더리움클래식) 오배선 방지.
  if (matches.includes("BCH") && matches.includes("BTC")) {
    const rest = text.replace(/비트코인\s?캐시|bitcoin\s+cash|\bBCH\b/gi, " ");
    if (!["비트코인", "bitcoin", "btc"].some((alias) => aliasMatches(rest, alias))) matches.splice(matches.indexOf("BTC"), 1);
  }
  if (matches.includes("ETC") && matches.includes("ETH")) {
    const rest = text.replace(/이더리움\s?클래식|ethereum\s+classic|\bETC\b/gi, " ");
    if (!["이더리움", "이더", "ethereum", "ether", "eth"].some((alias) => aliasMatches(rest, alias))) matches.splice(matches.indexOf("ETH"), 1);
  }
  return matches;
}

export function classifyCoinIssue(text: string): CoinIssueType | null {
  return ISSUE_PATTERNS.find((entry) => entry.pattern.test(text))?.type ?? null;
}

export function classifyCoinDirection(text: string): CoinIssueDirection {
  if (/기대|전망|가능성|검토|논의|추진/i.test(text)) return "neutral";
  if (/ETF.{0,24}(순유출|유출)|해킹|취약점|공격|제재|기소|소송|언락|락업 해제|대규모 매도|강제청산|청산 급증|중단/i.test(text)) return "negative";
  if (/ETF.{0,24}(순유입|유입)|승인|가결|법안 통과|매수|도입|채택|업그레이드 완료|메인넷 출시|트레저리 편입/i.test(text)) return "positive";
  return "neutral";
}

function meaningFor(type: CoinIssueType, direction: CoinIssueDirection, scope: "coin" | "market"): string {
  const scopeText = scope === "market" ? "코인 시장 공통 변수" : "해당 코인의 최근 재료";
  const directionText = direction === "positive" ? "우호적 사실" : direction === "negative" ? "부담 요인" : "방향 확인이 필요한 사실";
  const grammar: Record<CoinIssueType, string> = {
    regulation: "규제 적용 범위와 기관 접근성에 영향을 주는 이슈",
    network: "네트워크 기능·공급 일정에 직접 연결되는 이슈",
    institution: "기관 보유·수탁·기업 수요를 확인하는 이슈",
    onchain: "거래소 이동과 보유 주체의 수급 변화를 보여주는 이슈",
    macro: "금리·달러와 위험자산 환경을 함께 보는 이슈",
  };
  return `${grammar[type]} · ${scopeText}, 현재 분류는 ${directionText}입니다.`;
}

function issueDateValid(article: RawArticle, now: Date): boolean {
  const published = Date.parse(article.publishedAt);
  const age = now.getTime() - published;
  return Number.isFinite(published) && age >= -60 * 60 * 1000 && age <= 7 * 24 * 60 * 60 * 1000;
}

function titleKey(title: string): string {
  return title.toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, "");
}

function compareIssues(a: CoinMaterialItem, b: CoinMaterialItem): number {
  const priority: Record<CoinIssueType, number> = { regulation: 5, network: 4, institution: 4, onchain: 3, macro: 2 };
  return Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || priority[b.type] - priority[a.type];
}

export function buildCoinMaterialCache(articles: readonly RawArticle[], now = new Date()): CoinMaterialCache {
  const bySymbol: Record<string, CoinMaterialItem[]> = {};
  const global: CoinMaterialItem[] = [];
  const seen = new Set<string>();
  for (const article of articles) {
    if (!issueDateValid(article, now)) continue;
    if (OMNIBUS_BRIEFING.test(article.title)) continue;
    const symbols = matchCoinSymbols(article.title);
    // 카드에 그대로 노출할 제목 자체가 재료 문법을 가져야 한다. 본문에만 재료가 있는 가격 속보는 제외한다.
    const type = classifyCoinIssue(article.title);
    if (!type) continue;
    const scope = symbols.length > 0 ? "coin" : "market";
    if (
      scope === "market" &&
      (!CRYPTO_CONTEXT.test(article.title) || (type !== "regulation" && type !== "macro" && type !== "onchain"))
    ) continue;
    const key = titleKey(article.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const direction = classifyCoinDirection(`${article.title} ${article.summary ?? ""}`);
    const item: CoinMaterialItem = {
      id: article.id || article.url,
      symbols,
      scope,
      type,
      typeLabel: TYPE_LABEL[type],
      direction,
      title: article.title.trim(),
      meaning: meaningFor(type, direction, scope),
      source: article.source,
      url: article.url,
      publishedAt: article.publishedAt,
    };
    if (scope === "market") global.push(item);
    for (const symbol of symbols) (bySymbol[symbol] ??= []).push(item);
  }
  for (const symbol of Object.keys(bySymbol)) bySymbol[symbol] = bySymbol[symbol]!.sort(compareIssues).slice(0, 6);
  global.sort(compareIssues).splice(6);
  const asOf = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { asOf, collectedAt: now.toISOString(), bySymbol, global };
}

const CACHE_PREFIX = "coin-materials:";

export async function collectAndStoreCoinMaterials(): Promise<{ articles: number; matched: number; global: number }> {
  const articles = await fetchCryptoNews();
  const cache = buildCoinMaterialCache(articles);
  await writeFeedContent(`${CACHE_PREFIX}${cache.asOf}`, cache);
  return {
    articles: articles.length,
    matched: Object.values(cache.bySymbol).reduce((sum, items) => sum + items.length, 0),
    global: cache.global.length,
  };
}

export async function readLatestCoinMaterials(): Promise<CoinMaterialCache | null> {
  const today = await readFeedContent<CoinMaterialCache>(`${CACHE_PREFIX}${kstDate()}`);
  if (today) return today;
  return (await readFeedContentByPrefix<CoinMaterialCache>(CACHE_PREFIX, 1))[0]?.row ?? null;
}

export function issuesForSymbol(cache: CoinMaterialCache | null, symbol: string, limit = 3): CoinMaterialItem[] {
  if (!cache) return [];
  const combined = [...(cache.bySymbol[symbol.toUpperCase()] ?? []), ...cache.global];
  const seen = new Set<string>();
  return combined.filter((item) => {
    const key = titleKey(item.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (a.scope === b.scope ? compareIssues(a, b) : a.scope === "coin" ? -1 : 1)).slice(0, limit);
}

function hoursApart(left: string, right: string): number {
  return Math.abs(Date.parse(left) - Date.parse(right)) / 3_600_000;
}

export function buildCoinCause(snapshot: Pick<CoinMarketSnapshot, "changePct" | "fetchedAt">, issues: readonly CoinMaterialItem[]): CoinCause | undefined {
  const issue = issues.find((item) => item.scope === "coin") ?? issues[0];
  if (!issue) return undefined;
  const sameWindow = issue.scope === "coin" && Math.abs(snapshot.changePct) >= 3 && hoursApart(snapshot.fetchedAt, issue.publishedAt) <= 48;
  const move = `${snapshot.changePct > 0 ? "+" : ""}${snapshot.changePct.toFixed(1)}%`;
  return {
    text: sameWindow
      ? `오늘 ${move} 변동과 같은 48시간에 보도된 이슈: ${issue.title}`
      : `${issue.scope === "market" ? "시장 공통" : "해당 코인"} 최근 이슈: ${issue.title}`,
    relation: sameWindow ? "same-window" : "recent-context",
    sourceLabel: `${issue.source} · ${issue.typeLabel}`,
    url: issue.url,
    asOf: issue.publishedAt,
    issueId: issue.id,
  };
}

export function materialHeadline(issue: CoinMaterialItem, snapshot: Pick<CoinMarketSnapshot, "changePct" | "fetchedAt">): string {
  const title = issue.title.length > 76 ? `${issue.title.slice(0, 73)}…` : issue.title;
  if (issue.scope === "coin" && Math.abs(snapshot.changePct) >= 3 && hoursApart(snapshot.fetchedAt, issue.publishedAt) <= 48) {
    return `${title} · 오늘 ${snapshot.changePct > 0 ? "+" : ""}${snapshot.changePct.toFixed(1)}%`;
  }
  return title;
}

export function composeCoinVerdict(base: CardVerdict, issues: readonly CoinMaterialItem[]): CardVerdict {
  const issue = issues.find((item) => item.scope === "coin") ?? issues[0];
  if (!issue) return base;
  const direction = issue.direction === "positive" ? "우호 재료" : issue.direction === "negative" ? "부담 재료" : "방향 미확정 재료";
  const title = issue.title.length > 48 ? `${issue.title.slice(0, 45)}…` : issue.title;
  const stanceText = `${issue.typeLabel} '${title}' 확인 · ${direction}. 차트 판단은 ${base.stanceText}`;
  return {
    ...base,
    stanceText,
    evidence: [`${issue.typeLabel} · ${issue.source} · ${direction}`, ...base.evidence].slice(0, 3),
  };
}
