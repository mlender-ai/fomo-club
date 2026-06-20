import {
  buildResearchWorkspace,
  buildResearchWorkspaceFromData,
  findResearchTickerOption,
  getResearchSectorLabel,
  inferResearchTickerMarket,
  normalizeResearchTicker,
  normalizeResearchPreferences,
  researchTickerOptions,
  type ResearchNewsItem,
  type ResearchPriority,
  type ResearchSectorTag,
  type ResearchTickerMarket,
  type ResearchWorkspaceData,
  type TickerAnalysis,
  type TickerPattern,
  type UserResearchPreferences
} from "./research";

const RSS_USER_AGENT = "Mozilla/5.0 (compatible; FomoClubResearchBot/1.0; +https://github.com/mlender-ai/fomo-club)";
const YAHOO_RSS_URL = "https://feeds.finance.yahoo.com/rss/2.0/headline";
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search";

interface FeedContext {
  symbol: string;
  sectorTag: ResearchSectorTag;
  tickerTags: string[];
}

interface ParsedRssItem {
  title: string;
  description: string;
  link: string;
  publishedAt: string;
  source: string;
}

interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceSnapshot {
  price: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  support20: number | null;
  support60: number | null;
  resistance20: number | null;
  resistance60: number | null;
}

interface LiveResearchWorkspaceResult {
  workspace: ResearchWorkspaceData;
  warnings: string[];
}

export interface LiveTickerAnalysisResult {
  analysis: TickerAnalysis | null;
  relatedNews: ResearchNewsItem[];
  warnings: string[];
}

export interface LiveTickerSearchResult {
  ticker: string;
  label: string;
  market: ResearchTickerMarket;
  exchange: string;
  tradingViewSymbol: string;
  sectorTag: ResearchSectorTag | null;
  typeLabel: string | null;
}

const sectorFeedMap: Record<ResearchSectorTag, FeedContext[]> = {
  semiconductors: [
    { symbol: "NVDA", sectorTag: "semiconductors", tickerTags: ["NVDA", "AMD", "TSM"] },
    { symbol: "AMD", sectorTag: "semiconductors", tickerTags: ["AMD", "NVDA", "TSM"] },
    { symbol: "005930.KS", sectorTag: "semiconductors", tickerTags: ["005930.KS", "000660.KS", "NVDA"] },
    { symbol: "000660.KS", sectorTag: "semiconductors", tickerTags: ["000660.KS", "005930.KS", "NVDA"] },
    { symbol: "SOXX", sectorTag: "semiconductors", tickerTags: ["NVDA", "AMD", "TSM"] }
  ],
  "energy-oil": [
    { symbol: "XOM", sectorTag: "energy-oil", tickerTags: ["XOM", "CVX", "SLB"] },
    { symbol: "CVX", sectorTag: "energy-oil", tickerTags: ["CVX", "XOM", "SLB"] },
    { symbol: "010950.KS", sectorTag: "energy-oil", tickerTags: ["010950.KS", "096770.KS", "XOM"] },
    { symbol: "096770.KS", sectorTag: "energy-oil", tickerTags: ["096770.KS", "010950.KS", "XOM"] },
    { symbol: "XLE", sectorTag: "energy-oil", tickerTags: ["XOM", "CVX", "SLB"] }
  ],
  "ai-infra": [
    { symbol: "VRT", sectorTag: "ai-infra", tickerTags: ["VRT", "ETN", "NVDA"] },
    { symbol: "ETN", sectorTag: "ai-infra", tickerTags: ["ETN", "VRT"] }
  ],
  "industrial-tech": [{ symbol: "ROK", sectorTag: "industrial-tech", tickerTags: ["ROK", "ETN"] }],
  "ev-mobility": [
    { symbol: "TSLA", sectorTag: "ev-mobility", tickerTags: ["TSLA", "RIVN", "373220.KS"] },
    { symbol: "RIVN", sectorTag: "ev-mobility", tickerTags: ["RIVN", "TSLA", "373220.KS"] },
    { symbol: "373220.KS", sectorTag: "ev-mobility", tickerTags: ["373220.KS", "006400.KS", "TSLA"] },
    { symbol: "CARZ", sectorTag: "ev-mobility", tickerTags: ["TSLA", "GM", "373220.KS"] }
  ],
  "battery-chain": [
    { symbol: "373220.KS", sectorTag: "battery-chain", tickerTags: ["373220.KS", "006400.KS", "ALB"] },
    { symbol: "006400.KS", sectorTag: "battery-chain", tickerTags: ["006400.KS", "373220.KS", "QS"] },
    { symbol: "ALB", sectorTag: "battery-chain", tickerTags: ["ALB", "QS", "373220.KS"] },
    { symbol: "LIT", sectorTag: "battery-chain", tickerTags: ["ALB", "373220.KS", "006400.KS"] }
  ]
};

const sectorProxyMap: Record<ResearchSectorTag, string> = {
  semiconductors: "SOXX",
  "energy-oil": "XLE",
  "ai-infra": "VRT",
  "industrial-tech": "ROK",
  "ev-mobility": "CARZ",
  "battery-chain": "LIT"
};

const sourceWeightMap: Record<string, number> = {
  "reuters.com": 20,
  "bloomberg.com": 18,
  "wsj.com": 18,
  "marketwatch.com": 15,
  "barrons.com": 15,
  "cnbc.com": 13,
  "morningstar.com": 11,
  "finance.yahoo.com": 10,
  "yahoo.com": 9,
  "seekingalpha.com": 7,
  "benzinga.com": 6,
  "investing.com": 6,
  "stockstory.org": 4,
  "fool.com": 3,
  "nerdwallet.com": 2
};

const impactPatterns: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /\b(earnings|guidance|forecast|margin|revenue|profit|orders?)\b/i, score: 14 },
  { pattern: /\b(chip|semiconductor|hbm|gpu|foundry|memory|ai)\b/i, score: 10 },
  { pattern: /\b(oil|energy|opec|crude|refin|upstream|capex)\b/i, score: 10 },
  { pattern: /\b(export|tariff|sanction|policy|rate|inflation|treasury)\b/i, score: 8 },
  { pattern: /\b(power|cooling|datacenter|infrastructure)\b/i, score: 8 }
];

const lowSignalPatterns = [
  /\bbest-performing\b/i,
  /\bbest\b.*\bstocks?\b/i,
  /\bthank yourself\b/i,
  /\blong-term investors?\b/i,
  /\bshould (you|investors?) buy\b/i,
  /\btop \d+\b/i,
  /\bdividend\b/i,
  /\bdecade\b/i,
  /\bweek in numbers\b/i,
  /\bmarket size\b/i,
  /\bto surpass\b/i,
  /\bby 203\d\b/i
];

const sectorSearchIntentPatterns: Array<{ sectorTag: ResearchSectorTag; patterns: RegExp[] }> = [
  {
    sectorTag: "semiconductors",
    patterns: [/\bsemi\b/i, /\bsemiconductor\b/i, /\bchip\b/i, /\bgpu\b/i, /\bhbm\b/i, /\bmemory\b/i, /반도체/i, /메모리/i]
  },
  {
    sectorTag: "energy-oil",
    patterns: [/\boil\b/i, /\benergy\b/i, /\bcrude\b/i, /\bopec\b/i, /오일/i, /에너지/i, /정유/i]
  },
  {
    sectorTag: "ai-infra",
    patterns: [/\bpower\b/i, /\bcooling\b/i, /\bdatacenter\b/i, /\bdata center\b/i, /데이터센터/i, /전력/i, /냉각/i]
  },
  {
    sectorTag: "industrial-tech",
    patterns: [/\bautomation\b/i, /\bindustrial\b/i, /\brobot\b/i, /산업/i, /자동화/i, /공급망/i]
  },
  {
    sectorTag: "ev-mobility",
    patterns: [/\bev\b/i, /\belectric vehicle\b/i, /\brobotaxi\b/i, /\btesla\b/i, /\brivian\b/i, /전기차/i, /자동차/i]
  },
  {
    sectorTag: "battery-chain",
    patterns: [/\bbattery\b/i, /\blithium\b/i, /\bcell\b/i, /\bcathode\b/i, /\banode\b/i, /배터리/i, /리튬/i, /양극재/i]
  }
];

const sectorNewsProfiles: Record<
  ResearchSectorTag,
  {
    minScore: number;
    positive: Array<{ pattern: RegExp; score: number }>;
    negative: Array<{ pattern: RegExp; penalty: number }>;
  }
> = {
  semiconductors: {
    minScore: 9,
    positive: [
      { pattern: /\b(chip|semiconductor|gpu|hbm|memory|foundry|ai chip|micron)\b/i, score: 10 },
      { pattern: /\b(nvidia|amd|tsmc|samsung|hynix|intel|arm|broadcom|qualcomm)\b/i, score: 8 },
      { pattern: /\b(export control|fab|wafer|packaging)\b/i, score: 8 }
    ],
    negative: [{ pattern: /\b(oil|crude|gold|battery market size)\b/i, penalty: 10 }]
  },
  "energy-oil": {
    minScore: 9,
    positive: [
      { pattern: /\b(oil|energy|crude|opec|refin|upstream|downstream|drilling|capex)\b/i, score: 10 },
      { pattern: /\b(exxon|chevron|slb|halliburton|s-oil|sk innovation)\b/i, score: 8 }
    ],
    negative: [{ pattern: /\b(semiconductor|gpu|battery|gold|robotaxi)\b/i, penalty: 10 }]
  },
  "ai-infra": {
    minScore: 8,
    positive: [
      { pattern: /\b(power|cooling|data center|datacenter|grid|electrical|server|rack)\b/i, score: 10 },
      { pattern: /\b(vertiv|eaton|hyperscaler|load growth)\b/i, score: 8 }
    ],
    negative: [{ pattern: /\b(oil|gold|lithium|robotaxi)\b/i, penalty: 8 }]
  },
  "industrial-tech": {
    minScore: 8,
    positive: [
      { pattern: /\b(automation|industrial|robot|factory|machinery|supply chain|backlog|orders)\b/i, score: 8 },
      { pattern: /\b(rockwell|eaton|motion control)\b/i, score: 6 }
    ],
    negative: [{ pattern: /\b(gold|oil|battery market size)\b/i, penalty: 8 }]
  },
  "ev-mobility": {
    minScore: 12,
    positive: [
      { pattern: /\b(tesla|rivian|gm|ford|evgo|robotaxi|cybercab)\b/i, score: 12 },
      { pattern: /\b(ev|electric vehicle|electric vehicles|autonomous|vehicle sales|delivery)\b/i, score: 10 },
      { pattern: /\b(battery|charging|price cut|capex)\b/i, score: 6 }
    ],
    negative: [
      { pattern: /\b(intel|semiconductor|gpu|hbm|memory)\b/i, penalty: 18 },
      { pattern: /\b(gold|steel|gas price|oil|protest)\b/i, penalty: 12 }
    ]
  },
  "battery-chain": {
    minScore: 14,
    positive: [
      { pattern: /\b(battery|cell|lithium|lithium-ion|solid-state|cathode|anode|separator|nickel|cobalt)\b/i, score: 12 },
      { pattern: /\b(lg energy solution|samsung sdi|albemarle|quantumscape|sk on|catl|elanf|엘앤에프)\b/i, score: 10 },
      { pattern: /\b(ev|electric vehicle|gigafactory)\b/i, score: 6 }
    ],
    negative: [
      { pattern: /\b(gold|steel|oil|gas price)\b/i, penalty: 14 },
      { pattern: /\b(intel|semiconductor|gpu|memory)\b/i, penalty: 16 }
    ]
  }
};

function parseCsvEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function xmlDecode(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripHtml(value: string): string {
  return xmlDecode(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeHeadline(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+-\s+[a-z0-9 .&]+$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = getKey(item);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function inferSearchMarket(symbol: string, exchange: string): ResearchTickerMarket {
  if (symbol.endsWith(".KS") || symbol.endsWith(".KQ")) {
    return "KR";
  }

  if (/(kospi|kosdaq|krx|korea exchange)/i.test(exchange)) {
    return "KR";
  }

  return "US";
}

function inferSectorIntentFromQuery(query: string): ResearchSectorTag | null {
  for (const entry of sectorSearchIntentPatterns) {
    if (entry.patterns.some((pattern) => pattern.test(query))) {
      return entry.sectorTag;
    }
  }

  return null;
}

function isSupportedUsExchange(exchange: string): boolean {
  return /(nasdaq|nasdaqgs|nasdaqcm|nms|ngm|nyse|nyq|amex|arca|bats|cboe|otc|pnk)/i.test(exchange);
}

function normalizeSearchExchange(symbol: string, exchange: string, market: ResearchTickerMarket): string {
  if (symbol.endsWith(".KQ") || /kosdaq/i.test(exchange)) {
    return "KOSDAQ";
  }

  if (symbol.endsWith(".KS") || /(kospi|krx|korea exchange)/i.test(exchange)) {
    return "KRX";
  }

  if (/(nasdaq|nasdaqgs|nasdaqcm|nms|ngm)/i.test(exchange)) {
    return "NASDAQ";
  }

  if (/(nyse|nyq)/i.test(exchange)) {
    return "NYSE";
  }

  return exchange || (market === "KR" ? "KRX" : "US");
}

function buildTradingViewSymbol(symbol: string, exchange: string, market: ResearchTickerMarket): string {
  if (market === "KR") {
    if (symbol.endsWith(".KQ")) {
      return `KOSDAQ:${symbol.replace(".KQ", "")}`;
    }

    if (symbol.endsWith(".KS")) {
      return `KRX:${symbol.replace(".KS", "")}`;
    }

    return `KRX:${symbol}`;
  }

  if (exchange === "NASDAQ") {
    return `NASDAQ:${symbol}`;
  }

  if (exchange === "NYSE") {
    return `NYSE:${symbol}`;
  }

  return symbol;
}

function inferSearchSectorTag(symbol: string, label: string): ResearchSectorTag | null {
  const option = findResearchTickerOption(symbol);

  if (option) {
    return option.sectorTag;
  }

  const haystack = `${symbol} ${label}`.toLowerCase();

  if (/(chip|semi|semiconductor|memory|foundry|gpu|hbm|nvidia|amd|tsmc|samsungelec|samsung elec|hynix|broadcom|micron|arm|intel|marvell|qualcomm)/i.test(haystack)) {
    return "semiconductors";
  }

  if (/(oil|energy|petroleum|refin|drilling|chevron|exxon|slb|halliburton|s-oil|sk innovation|conocophillips|occidental)/i.test(haystack)) {
    return "energy-oil";
  }

  if (/(power|cooling|data center|datacenter|electric|grid|vertiv|eaton|server)/i.test(haystack)) {
    return "ai-infra";
  }

  if (/\b(tesla|rivian|ev|electric vehicle|electric vehicles|autonomous|robotaxi|automotive|general motors|ford|carz|evgo)\b/i.test(haystack)) {
    return "ev-mobility";
  }

  if (/\b(battery|cell|cathode|anode|lithium|lg energy solution|sdi|quantumscape|albemarle|elanf|엘앤에프|solid-state)\b/i.test(haystack)) {
    return "battery-chain";
  }

  if (/(automation|robot|industrial|factory|equipment|machinery|supply chain)/i.test(haystack)) {
    return "industrial-tech";
  }

  return null;
}

export async function searchResearchTickers(query: string, market?: ResearchTickerMarket): Promise<LiveTickerSearchResult[]> {
  const normalizedQuery = query.trim();
  const sectorIntent = inferSectorIntentFromQuery(normalizedQuery);

  if (!normalizedQuery) {
    return [];
  }

  const themedSeedResults = sectorIntent
    ? researchTickerOptions
        .filter((item) => item.sectorTag === sectorIntent)
        .filter((item) => !market || item.market === market)
        .map((item) => ({
          ticker: item.ticker,
          label: item.label,
          market: item.market,
          exchange: item.exchange,
          tradingViewSymbol: item.tradingViewSymbol,
          sectorTag: item.sectorTag,
          typeLabel: "Theme"
        }))
    : [];

  const fallbackResults = dedupeByKey(
    [
      ...themedSeedResults,
      ...researchTickerOptions
        .filter((item) => !market || item.market === market)
        .filter((item) => {
          const haystack = `${item.ticker} ${item.label}`.toLowerCase();
          return haystack.includes(normalizedQuery.toLowerCase());
        })
        .map((item) => ({
          ticker: item.ticker,
          label: item.label,
          market: item.market,
          exchange: item.exchange,
          tradingViewSymbol: item.tradingViewSymbol,
          sectorTag: item.sectorTag,
          typeLabel: "Seed"
        }))
    ],
    (item) => item.ticker
  ).slice(0, 8);

  try {
    const url = new URL(YAHOO_SEARCH_URL);
    url.searchParams.set("q", normalizedQuery);
    url.searchParams.set("quotesCount", "16");
    url.searchParams.set("newsCount", "0");
    url.searchParams.set("enableFuzzyQuery", "true");
    url.searchParams.set("quotesQueryId", "tss_match_phrase_query");
    url.searchParams.set("multiQuoteQueryId", "multi_quote_single_token_query");
    url.searchParams.set("lang", "en-US");
    url.searchParams.set("region", market === "KR" ? "KR" : "US");

    const response = await fetch(url.toString(), {
      headers: {
        accept: "application/json",
        "user-agent": RSS_USER_AGENT
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000)
    });

    if (!response.ok) {
      return fallbackResults;
    }

    const payload = (await response.json()) as {
      quotes?: Array<{
        symbol?: string;
        shortname?: string;
        longname?: string;
        exchDisp?: string;
        exchange?: string;
        quoteType?: string;
        typeDisp?: string;
      }>;
    };

    const results = dedupeByKey(
      (payload.quotes ?? [])
        .filter((item) => Boolean(item.symbol))
        .filter((item) => {
          const quoteType = item.quoteType?.toUpperCase() ?? "";
          return quoteType === "EQUITY" || quoteType === "ETF";
        })
        .map((item) => {
          const symbol = item.symbol!.toUpperCase();
          const label = item.shortname?.trim() || item.longname?.trim() || symbol;
          const rawExchange = item.exchDisp?.trim() || item.exchange?.trim() || "";
          const inferredMarket = inferSearchMarket(symbol, rawExchange);

          if (market && inferredMarket !== market) {
            return null;
          }

          if (market === "US" && !isSupportedUsExchange(rawExchange)) {
            return null;
          }

          const exchange = normalizeSearchExchange(symbol, rawExchange, inferredMarket);

          return {
            ticker: normalizeTicker(symbol),
            label,
            market: inferredMarket,
            exchange,
            tradingViewSymbol: buildTradingViewSymbol(symbol, exchange, inferredMarket),
            sectorTag: inferSearchSectorTag(symbol, label),
            typeLabel: item.typeDisp?.trim() || item.quoteType?.trim() || null
          } satisfies LiveTickerSearchResult;
        })
        .filter((item): item is LiveTickerSearchResult => Boolean(item))
        .sort((left, right) => {
          const leftIntent = sectorIntent && left.sectorTag === sectorIntent ? 1 : 0;
          const rightIntent = sectorIntent && right.sectorTag === sectorIntent ? 1 : 0;

          if (leftIntent !== rightIntent) {
            return rightIntent - leftIntent;
          }

          const leftExact = left.ticker === normalizedQuery.toUpperCase() || left.label.toLowerCase() === normalizedQuery.toLowerCase() ? 1 : 0;
          const rightExact = right.ticker === normalizedQuery.toUpperCase() || right.label.toLowerCase() === normalizedQuery.toLowerCase() ? 1 : 0;

          if (leftExact !== rightExact) {
            return rightExact - leftExact;
          }

          const leftStarts = left.ticker.startsWith(normalizedQuery.toUpperCase()) || left.label.toLowerCase().startsWith(normalizedQuery.toLowerCase()) ? 1 : 0;
          const rightStarts = right.ticker.startsWith(normalizedQuery.toUpperCase()) || right.label.toLowerCase().startsWith(normalizedQuery.toLowerCase()) ? 1 : 0;

          if (leftStarts !== rightStarts) {
            return rightStarts - leftStarts;
          }

          return left.ticker.localeCompare(right.ticker);
        }),
      (item) => item.ticker
    ).slice(0, 10);

    const mergedResults = dedupeByKey([...themedSeedResults, ...results], (item) => item.ticker).slice(0, 10);
    return mergedResults.length > 0 ? mergedResults : fallbackResults;
  } catch {
    return fallbackResults;
  }
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function parseYahooRss(xml: string): ParsedRssItem[] {
  const matches = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi));

  return matches
    .map((match) => {
      const block = match[1] ?? "";
      const title = stripHtml(extractTag(block, "title"));
      const description = stripHtml(extractTag(block, "description"));
      const link = xmlDecode(extractTag(block, "link"));
      const pubDate = stripHtml(extractTag(block, "pubDate"));

      if (!title || !link || !pubDate) {
        return null;
      }

      const url = new URL(link);
      const sourceDomain = url.hostname.replace(/^www\./, "");
      const source = sourceDomain.split(".")[0]?.toUpperCase() ?? sourceDomain;

      return {
        title,
        description,
        link,
        publishedAt: new Date(pubDate).toISOString(),
        source
      } satisfies ParsedRssItem;
    })
    .filter((item): item is ParsedRssItem => Boolean(item));
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: "application/rss+xml, application/xml, application/json, text/html;q=0.9, */*;q=0.8",
      "user-agent": RSS_USER_AGENT
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(6_000)
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchYahooFeed(context: FeedContext): Promise<ParsedRssItem[]> {
  const url = new URL(YAHOO_RSS_URL);
  url.searchParams.set("s", context.symbol);
  url.searchParams.set("region", "US");
  url.searchParams.set("lang", "en-US");

  return parseYahooRss(await fetchText(url.toString()));
}

function buildSectorRelevance(item: ParsedRssItem, sectorTag: ResearchSectorTag, tickerTags: string[]) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const title = item.title.toLowerCase();
  const profile = sectorNewsProfiles[sectorTag];
  const positiveScore = profile.positive.reduce((total, entry) => total + (entry.pattern.test(text) ? entry.score : 0), 0);
  const titleScore = profile.positive.reduce((total, entry) => total + (entry.pattern.test(title) ? Math.ceil(entry.score * 0.6) : 0), 0);
  const negativePenalty = profile.negative.reduce((total, entry) => total + (entry.pattern.test(text) ? entry.penalty : 0), 0);
  const tickerScore = tickerTags.reduce((total, ticker) => {
    const normalizedTicker = ticker.toLowerCase().replace(/\.ks$|\.kq$/u, "");
    return total + (text.includes(normalizedTicker) ? 6 : 0);
  }, 0);

  return {
    minScore: profile.minScore,
    positiveScore,
    titleScore,
    negativePenalty,
    tickerScore
  };
}

function isSectorRelevantArticle(item: ParsedRssItem, sectorTag: ResearchSectorTag, tickerTags: string[]) {
  const relevance = buildSectorRelevance(item, sectorTag, tickerTags);
  return relevance.positiveScore + relevance.titleScore + relevance.tickerScore - relevance.negativePenalty >= relevance.minScore;
}

function scoreArticle(item: ParsedRssItem, sectorTag: ResearchSectorTag, tickerTags: string[], preferences: UserResearchPreferences): number {
  const ageHours = (Date.now() - Date.parse(item.publishedAt)) / 3_600_000;
  const recencyScore = ageHours <= 8 ? 24 : ageHours <= 24 ? 18 : ageHours <= 48 ? 12 : ageHours <= 96 ? 6 : -18;
  const sourceDomain = new URL(item.link).hostname.replace(/^www\./, "");
  const sourceScore = sourceWeightMap[sourceDomain] ?? 5;
  const text = `${item.title} ${item.description}`.toLowerCase();
  const keywordScore = impactPatterns.reduce((total, entry) => total + (entry.pattern.test(text) ? entry.score : 0), 0);
  const lowSignalPenalty = lowSignalPatterns.reduce((total, pattern) => total + (pattern.test(text) ? 18 : 0), 0);
  const tickerScore = tickerTags.reduce((total, ticker) => total + (text.includes(ticker.toLowerCase()) ? 5 : 0), 0);
  const preferenceScore = preferences.sectors.includes(sectorTag) ? 8 : 0;
  const sectorRelevance = buildSectorRelevance(item, sectorTag, tickerTags);
  const titleMismatchPenalty = sectorRelevance.positiveScore > 0 && sectorRelevance.titleScore === 0 && tickerScore === 0 ? 10 : 0;

  return clamp(
    Math.round(
      34 +
        recencyScore +
        sourceScore +
        keywordScore +
        tickerScore +
        preferenceScore +
        sectorRelevance.positiveScore +
        sectorRelevance.titleScore -
        lowSignalPenalty -
        sectorRelevance.negativePenalty -
        titleMismatchPenalty
    ),
    20,
    98
  );
}

function inferPriority(score: number): ResearchPriority {
  if (score >= 88) {
    return "critical";
  }

  if (score >= 72) {
    return "focus";
  }

  return "monitor";
}

function buildNewsAnalysis(item: ParsedRssItem, sectorTag: ResearchSectorTag): string {
  const text = `${item.title} ${item.description}`.toLowerCase();

  if (sectorTag === "semiconductors") {
    if (/\b(earnings|guidance|orders?|margin)\b/i.test(text)) {
      return "실적과 가이던스 변화가 공급 체인 기대치를 바로 다시 가격에 반영할 수 있어 리더 종목 밸류에이션에 직접 연결됩니다.";
    }

    return "반도체는 수급보다 리드타임과 고객 믹스에 더 민감해져 있어, 기사 한 건이 업황 기대의 방향을 빠르게 바꿀 수 있습니다.";
  }

  if (sectorTag === "energy-oil") {
    if (/\b(opec|crude|oil|capex|upstream|refin)\b/i.test(text)) {
      return "에너지 섹터는 유가 수준 자체보다 현금흐름과 투자계획 유지 여부가 중요해져 있어, 업종 내 승자와 패자를 바로 가르는 재료입니다.";
    }

    return "오일 메이저와 서비스주는 같은 에너지여도 민감도가 달라, 이런 뉴스는 포지션을 어디에 둘지 다시 정하게 만듭니다.";
  }

  if (sectorTag === "ai-infra") {
    return "AI 인프라는 GPU 기대가 실제 설비 발주로 번지는 순간 멀티플이 다시 열릴 수 있어, 후행 CAPEX 확인 뉴스의 영향이 큽니다.";
  }

  if (sectorTag === "ev-mobility") {
    return "전기차 섹터는 판매량보다 가격 정책, 자율주행 기대, 배터리 원가가 동시에 밸류에이션을 흔들어 뉴스 한 건의 파급력이 큽니다.";
  }

  if (sectorTag === "battery-chain") {
    return "배터리 공급망은 완성차 수요보다도 셀 가격과 원재료 스프레드 변화에 민감해, 관련 뉴스가 수혜주와 피해주를 빠르게 가릅니다.";
  }

  return "공급망과 생산성 투자 회복 속도가 실제 주문으로 이어지는지 확인하는 뉴스라, 업종 확산 강도를 판단하는 데 유효합니다.";
}

function buildNewsRecommendation(item: ParsedRssItem, sectorTag: ResearchSectorTag, tickerTags: string[]): string {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const leadTicker = tickerTags[0];

  if (sectorTag === "semiconductors") {
    if (/\b(earnings|guidance)\b/i.test(text)) {
      return `${leadTicker ?? "반도체 리더"}는 추격보다 실적 코멘트 확인 뒤 눌림 구간에서만 대응하고, 후행주는 확산 신호가 나올 때까지 보수적으로 봅니다.`;
    }

    return `${leadTicker ?? "반도체 리더"} 중심으로만 노출을 유지하고, 제목만 강한 후행 설계주 추격은 피하는 편이 좋습니다.`;
  }

  if (sectorTag === "energy-oil") {
    return `${leadTicker ?? "메이저 오일"} 비중을 우선 두고, 서비스주는 메이저 capex 유지가 확인될 때만 확장하는 편이 안전합니다.`;
  }

  if (sectorTag === "ai-infra") {
    return "AI 인프라는 반도체 리더를 이미 담았을 때만 보조 성장축으로 접근하고, 급등일 추격은 자제합니다.";
  }

  if (sectorTag === "ev-mobility") {
    return `${leadTicker ?? "전기차 리더"}는 가격 인하나 자율주행 기대 같은 단일 재료에 추격하지 말고, 판매량과 마진이 같이 개선될 때만 비중을 늘리는 편이 좋습니다.`;
  }

  if (sectorTag === "battery-chain") {
    return `${leadTicker ?? "배터리 셀 리더"}는 완성차 수요와 원재료 스프레드가 동시에 받쳐줄 때만 확장하고, 소재주는 수급 확인 전까지 추격을 피합니다.`;
  }

  return "주도 업종 확인 전까지는 감시 리스트 위주로 두고, 실적과 주문잔고가 함께 확인될 때만 비중 확대를 검토합니다.";
}

function buildFeedContexts(preferences: UserResearchPreferences): FeedContext[] {
  const selectedTickers = preferences.tickers
    .map((ticker) => {
      const option = findResearchTickerOption(ticker);
      const sectorTag = option?.sectorTag ?? preferences.sectors[0] ?? "semiconductors";

      return {
        symbol: ticker,
        sectorTag,
        tickerTags: [
          ticker,
          ...researchTickerOptions
            .filter((candidate) => candidate.sectorTag === sectorTag && candidate.ticker !== ticker)
            .slice(0, 2)
            .map((candidate) => candidate.ticker)
        ]
      } satisfies FeedContext;
    });

  const sectorFeeds = preferences.sectors.flatMap((sector) => sectorFeedMap[sector] ?? []);
  return dedupeByKey([...selectedTickers, ...sectorFeeds], (context) => `${context.symbol}:${context.sectorTag}`);
}

function isRecentEnough(iso: string): boolean {
  return Date.now() - Date.parse(iso) <= 1000 * 60 * 60 * 96;
}

function toResearchNewsItem(item: ParsedRssItem, context: FeedContext, preferences: UserResearchPreferences): ResearchNewsItem | null {
  if (!isRecentEnough(item.publishedAt)) {
    return null;
  }

  if (!isSectorRelevantArticle(item, context.sectorTag, context.tickerTags)) {
    return null;
  }

  const importanceScore = scoreArticle(item, context.sectorTag, context.tickerTags, preferences);

  if (importanceScore < 48) {
    return null;
  }

  return {
    id: `live-${context.sectorTag}-${slugify(item.title)}`,
    title: item.title,
    summary: item.description || item.title,
    source: item.source,
    sourceUrl: item.link,
    publishedAt: item.publishedAt,
    imageUrl: null,
    sectorTag: context.sectorTag,
    tickerTags: context.tickerTags,
    importanceScore,
    priority: inferPriority(importanceScore),
    analysis: buildNewsAnalysis(item, context.sectorTag),
    recommendation: buildNewsRecommendation(item, context.sectorTag, context.tickerTags)
  };
}

function extractMetaContent(html: string, name: string): string | null {
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"));
  return match?.[1] ? xmlDecode(match[1].trim()) : null;
}

async function resolveArticleImage(url: string | null): Promise<string | null> {
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": RSS_USER_AGENT
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(4_500)
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const image = extractMetaContent(html, "og:image") ?? extractMetaContent(html, "twitter:image");

    if (!image) {
      return null;
    }

    return new URL(image, response.url).toString();
  } catch {
    return null;
  }
}

async function attachImages(items: ResearchNewsItem[]): Promise<ResearchNewsItem[]> {
  const targets = items.slice(0, 6);
  const imageEntries = await Promise.all(
    targets.map(async (item) => {
      const imageUrl = await resolveArticleImage(item.sourceUrl);
      return [item.id, imageUrl] as const;
    })
  );
  const imageMap = new Map(imageEntries);

  return items.map((item) => ({
    ...item,
    imageUrl: imageMap.get(item.id) ?? item.imageUrl
  }));
}

export function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function latestAverage(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }

  return average(values.slice(-period));
}

export function calculateEmaSeries(values: number[], period: number): Array<number | null> {
  if (values.length === 0) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const series: Array<number | null> = Array.from({ length: values.length }, () => null);
  let previousEma: number | null = null;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === undefined) {
      continue;
    }

    if (index === period - 1) {
      previousEma = average(values.slice(0, period));
      series[index] = previousEma;
      continue;
    }

    if (index < period - 1 || previousEma === null) {
      continue;
    }

    previousEma = (value - previousEma) * multiplier + previousEma;
    series[index] = previousEma;
  }

  return series;
}

export function calculateRsi(values: number[], period = 14): number | null {
  if (values.length <= period) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const current = values[index];
    const previous = values[index - 1];

    if (current === undefined || previous === undefined) {
      continue;
    }

    const delta = current - previous;

    if (delta >= 0) {
      gains += delta;
    } else {
      losses += Math.abs(delta);
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  for (let index = period + 1; index < values.length; index += 1) {
    const current = values[index];
    const previous = values[index - 1];

    if (current === undefined || previous === undefined) {
      continue;
    }

    const delta = current - previous;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
  }

  if (averageLoss === 0) {
    return 100;
  }

  const rs = averageGain / averageLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateMacd(values: number[]): { macd: number | null; signal: number | null; histogram: number | null } {
  const fastSeries = calculateEmaSeries(values, 12);
  const slowSeries = calculateEmaSeries(values, 26);
  const macdSeries = values.map((_, index) => {
    const fast = fastSeries[index];
    const slow = slowSeries[index];
    return typeof fast === "number" && typeof slow === "number" ? fast - slow : null;
  });
  const validMacd = macdSeries.filter((value): value is number => value !== null);
  const signalSeries = calculateEmaSeries(validMacd, 9);
  const macd = macdSeries.at(-1) ?? null;
  const signal = signalSeries.at(-1) ?? null;

  return {
    macd,
    signal,
    histogram: macd !== null && signal !== null ? macd - signal : null
  };
}

function buildPriceSnapshot(bars: PriceBar[]): PriceSnapshot {
  const closes = bars.map((bar) => bar.close);
  const latest = bars.at(-1);
  const recent20 = bars.slice(-20);
  const recent60 = bars.slice(-60);
  const macd = calculateMacd(closes);

  return {
    price: latest?.close ?? 0,
    sma20: latestAverage(closes, 20),
    sma50: latestAverage(closes, 50),
    sma200: latestAverage(closes, 200),
    rsi14: calculateRsi(closes, 14),
    macd: macd.macd,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
    support20: recent20.length > 0 ? Math.min(...recent20.map((bar) => bar.low)) : null,
    support60: recent60.length > 0 ? Math.min(...recent60.map((bar) => bar.low)) : null,
    resistance20: recent20.length > 0 ? Math.max(...recent20.map((bar) => bar.high)) : null,
    resistance60: recent60.length > 0 ? Math.max(...recent60.map((bar) => bar.high)) : null
  };
}

function formatLevel(value: number | null): string {
  return value === null ? "미확인" : `$${value.toFixed(2)}`;
}

function describeTrend(snapshot: PriceSnapshot): string {
  if (snapshot.sma20 !== null && snapshot.sma50 !== null && snapshot.price > snapshot.sma20 && snapshot.sma20 > snapshot.sma50) {
    return "단기와 중기 추세가 모두 상방입니다.";
  }

  if (snapshot.sma20 !== null && snapshot.sma50 !== null && snapshot.price < snapshot.sma20 && snapshot.sma20 < snapshot.sma50) {
    return "단기와 중기 추세가 함께 꺾여 있어 반등보다 방어가 우선입니다.";
  }

  return "추세는 살아 있지만 방향 확신이 강한 구간은 아닙니다.";
}

function describeRsi(snapshot: PriceSnapshot): string {
  if (snapshot.rsi14 === null) {
    return "RSI 확인이 부족합니다.";
  }

  if (snapshot.rsi14 >= 70) {
    return "RSI는 과열권에 가까워 추격보다 눌림 확인이 우선입니다.";
  }

  if (snapshot.rsi14 <= 35) {
    return "RSI는 침체권에 가까워 반등은 가능하지만 추세 복원 확인이 필요합니다.";
  }

  return "RSI는 중립대에서 추세 지속 여부를 보는 구간입니다.";
}

function describeMacd(snapshot: PriceSnapshot): string {
  if (snapshot.macdHistogram === null) {
    return "MACD 확인이 부족합니다.";
  }

  if (snapshot.macdHistogram > 0) {
    return "MACD는 상방 모멘텀이 남아 있어 추세 추종 쪽이 우세합니다.";
  }

  return "MACD는 하방 모멘텀이 우세해 섣부른 추격은 불리합니다.";
}

function findPivots(bars: PriceBar[], lookback = 3): Array<{ kind: "high" | "low"; index: number; price: number }> {
  const pivots: Array<{ kind: "high" | "low"; index: number; price: number }> = [];

  for (let index = lookback; index < bars.length - lookback; index += 1) {
    const target = bars[index];

    if (!target) {
      continue;
    }

    const window = bars.slice(index - lookback, index + lookback + 1);
    const high = Math.max(...window.map((bar) => bar.high));
    const low = Math.min(...window.map((bar) => bar.low));

    if (target.high >= high) {
      pivots.push({ kind: "high", index, price: target.high });
    }

    if (target.low <= low) {
      pivots.push({ kind: "low", index, price: target.low });
    }
  }

  return pivots.sort((left, right) => left.index - right.index);
}

function detectAbcdPattern(bars: PriceBar[]): TickerPattern | null {
  const pivots = findPivots(bars.slice(-80));

  if (pivots.length < 4) {
    return null;
  }

  for (let index = pivots.length - 4; index >= 0; index -= 1) {
    const window = pivots.slice(index, index + 4);
    const [a, b, c, d] = window;

    if (!a || !b || !c || !d) {
      continue;
    }

    if (a.kind === b.kind || b.kind === c.kind || c.kind === d.kind) {
      continue;
    }

    const ab = b.price - a.price;
    const bc = c.price - b.price;
    const cd = d.price - c.price;
    const abLength = Math.abs(ab);
    const bcRetrace = abLength === 0 ? 0 : Math.abs(bc) / abLength;
    const cdRatio = abLength === 0 ? 0 : Math.abs(cd) / abLength;

    if (bcRetrace < 0.35 || bcRetrace > 0.9 || cdRatio < 0.85 || cdRatio > 1.15) {
      continue;
    }

    const bullish = ab < 0 && bc > 0 && cd < 0;

    return {
      name: bullish ? "AB=CD 조정형" : "AB=CD 반등형",
      detail: bullish
        ? `직전 하락파와 최근 조정파 길이가 유사해 ${d.price.toFixed(2)} 부근이 패턴 완성 구간으로 읽힙니다.`
        : `직전 상승파와 최근 반등파 길이가 유사해 ${d.price.toFixed(2)} 부근에서 과열 해소 여부를 봐야 합니다.`,
      confidence: cdRatio > 0.93 && cdRatio < 1.07 ? "high" : "medium"
    };
  }

  return null;
}

function detectContinuationPattern(snapshot: PriceSnapshot): TickerPattern | null {
  if (
    snapshot.sma20 !== null &&
    snapshot.sma50 !== null &&
    snapshot.resistance20 !== null &&
    snapshot.price > snapshot.sma20 &&
    snapshot.sma20 > snapshot.sma50 &&
    snapshot.price >= snapshot.resistance20 * 0.97
  ) {
    return {
      name: "상승 추세 내 눌림 후 재가속",
      detail: "20일선 위에서 가격이 버티고 있어, 고점 재시험이 실패하지 않으면 추세 지속 확률이 높습니다.",
      confidence: "high"
    };
  }

  return null;
}

function detectBreakdownPattern(snapshot: PriceSnapshot): TickerPattern | null {
  if (snapshot.sma20 !== null && snapshot.sma50 !== null && snapshot.price < snapshot.sma20 && snapshot.sma20 < snapshot.sma50) {
    return {
      name: "단기 구조 이탈",
      detail: "20일선과 50일선 아래로 밀려 단기 반등이 나와도 저항 확인이 먼저 필요한 구조입니다.",
      confidence: "medium"
    };
  }

  return null;
}

function buildPatternAnalysis(bars: PriceBar[], snapshot: PriceSnapshot): TickerPattern[] {
  return [detectContinuationPattern(snapshot), detectAbcdPattern(bars), detectBreakdownPattern(snapshot)]
    .filter((pattern): pattern is TickerPattern => Boolean(pattern))
    .slice(0, 2);
}

async function fetchYahooChart(symbol: string): Promise<PriceBar[]> {
  const url = new URL(`${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "6mo");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div,split");

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": RSS_USER_AGENT
    },
    cache: "no-store",
    signal: AbortSignal.timeout(6_000)
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
    };
  };
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp ?? [];

  if (!quote || timestamps.length === 0) {
    return [];
  }

  return timestamps
    .map((timestamp, index) => {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];
      const volume = quote.volume?.[index];

      if (
        typeof open !== "number" ||
        !Number.isFinite(open) ||
        typeof high !== "number" ||
        !Number.isFinite(high) ||
        typeof low !== "number" ||
        !Number.isFinite(low) ||
        typeof close !== "number" ||
        !Number.isFinite(close)
      ) {
        return null;
      }

      const normalizedOpen: number = open;
      const normalizedHigh: number = high;
      const normalizedLow: number = low;
      const normalizedClose: number = close;

      return {
        date: new Date(timestamp * 1000).toISOString(),
        open: normalizedOpen,
        high: normalizedHigh,
        low: normalizedLow,
        close: normalizedClose,
        volume: typeof volume === "number" && Number.isFinite(volume) ? volume : 0
      } satisfies PriceBar;
    })
    .filter((bar): bar is PriceBar => Boolean(bar));
}

function describeSectorFlow(proxy: PriceSnapshot): string {
  if (proxy.sma20 !== null && proxy.sma50 !== null && proxy.price > proxy.sma20 && proxy.sma20 > proxy.sma50) {
    return "섹터 프록시도 20일선과 50일선 위에 있어 업종 흐름이 종목을 지지하는 구간입니다.";
  }

  if (proxy.sma20 !== null && proxy.sma50 !== null && proxy.price < proxy.sma20 && proxy.sma20 < proxy.sma50) {
    return "섹터 프록시가 이미 약해져 있어 개별 종목 반등도 업종 역풍을 함께 고려해야 합니다.";
  }

  return "섹터 흐름은 중립이라 개별 실적과 뉴스 반응이 더 중요합니다.";
}

function buildTickerRecommendation(snapshot: PriceSnapshot, ticker: string): string {
  if (snapshot.sma20 !== null && snapshot.sma50 !== null && snapshot.price > snapshot.sma20 && snapshot.sma20 > snapshot.sma50) {
    return `${ticker}는 추격보다 20일선 근처 눌림 확인 뒤 진입하는 편이 유리하고, 20일선이 무너지면 관망으로 전환하는 게 좋습니다.`;
  }

  if (snapshot.sma20 !== null && snapshot.sma50 !== null && snapshot.price < snapshot.sma20 && snapshot.sma20 < snapshot.sma50) {
    return `${ticker}는 단기 반등이 나와도 20일선 회복 전까지는 신규 진입보다 회피가 우선입니다.`;
  }

  return `${ticker}는 방향이 정리되기 전이라 고점 추격보다 지지 구간 확인 후 분할 접근이 적절합니다.`;
}

function buildTickerImportance(snapshot: PriceSnapshot, linkedNews: ResearchNewsItem[]): number {
  const newsBoost = linkedNews[0]?.importanceScore ?? 68;
  const trendBoost =
    snapshot.sma20 !== null && snapshot.sma50 !== null
      ? snapshot.price > snapshot.sma20 && snapshot.sma20 > snapshot.sma50
        ? 9
        : snapshot.price < snapshot.sma20 && snapshot.sma20 < snapshot.sma50
          ? -6
          : 0
      : 0;

  return clamp(Math.round(newsBoost * 0.55 + 34 + trendBoost), 50, 98);
}

function buildSelectedTickers(preferences: UserResearchPreferences): string[] {
  const selectedBySector = preferences.sectors.flatMap((sectorTag) => {
    const sectorOptions = researchTickerOptions.filter((option) => option.sectorTag === sectorTag);
    const usLead = sectorOptions.find((option) => option.market === "US");
    const krLead = sectorOptions.find((option) => option.market === "KR");

    return [usLead, krLead].filter((option): option is (typeof researchTickerOptions)[number] => Boolean(option));
  });

  return Array.from(new Set([...preferences.tickers, ...selectedBySector.map((option) => option.ticker)])).slice(0, 6);
}

function normalizeTicker(ticker: string): string {
  return normalizeResearchTicker(ticker) ?? ticker.trim().toUpperCase();
}

async function buildLiveNews(preferences: UserResearchPreferences): Promise<{ items: ResearchNewsItem[]; warnings: string[] }> {
  const warnings: string[] = [];
  const contexts = buildFeedContexts(preferences);
  const responses = await Promise.allSettled(contexts.map((context) => fetchYahooFeed(context)));
  const collected: ResearchNewsItem[] = [];

  responses.forEach((result, index) => {
    const context = contexts[index];

    if (!context) {
      return;
    }

    if (result.status !== "fulfilled") {
      warnings.push(`${context.symbol} 뉴스 피드 수집 실패: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      return;
    }

    result.value
      .map((item) => toResearchNewsItem(item, context, preferences))
      .filter((item): item is ResearchNewsItem => Boolean(item))
      .forEach((item) => collected.push(item));
  });

  const deduped = dedupeByKey(collected, (item) => normalizeHeadline(item.title));
  const ranked = deduped.sort((left, right) => right.importanceScore - left.importanceScore).slice(0, 12);

  return {
    items: await attachImages(ranked),
    warnings
  };
}

async function buildProxySnapshotMap(sectors: ResearchSectorTag[]): Promise<{ map: Map<string, PriceSnapshot>; warnings: string[] }> {
  const warnings: string[] = [];
  const proxySymbols = Array.from(new Set(sectors.map((sector) => sectorProxyMap[sector]).filter(Boolean)));
  const proxyResults = await Promise.allSettled(proxySymbols.map((symbol) => fetchYahooChart(symbol)));
  const map = new Map<string, PriceSnapshot>();

  proxyResults.forEach((result, index) => {
    const symbol = proxySymbols[index];

    if (!symbol) {
      return;
    }

    if (result.status === "fulfilled" && result.value.length > 0) {
      map.set(symbol, buildPriceSnapshot(result.value));
      return;
    }

    warnings.push(`${symbol} 섹터 프록시 수집 실패`);
  });

  return {
    map,
    warnings
  };
}

function buildTickerAnalysisFromBars(
  ticker: string,
  company: string,
  sectorTag: ResearchSectorTag,
  bars: PriceBar[],
  relatedNews: ResearchNewsItem[],
  proxySnapshot: PriceSnapshot | undefined
): TickerAnalysis {
  const snapshot = buildPriceSnapshot(bars);
  const patternAnalysis = buildPatternAnalysis(bars, snapshot);
  const option = findResearchTickerOption(ticker);
  const latestBar = bars[bars.length - 1] ?? null;
  const previousBar = bars[bars.length - 2] ?? null;
  const priceChange = latestBar && previousBar ? latestBar.close - previousBar.close : null;
  const priceChangePercent = latestBar && previousBar && previousBar.close !== 0 ? (priceChange! / previousBar.close) * 100 : null;

  return {
    ticker,
    company,
    sectorTag,
    market: option?.market ?? inferResearchTickerMarket(ticker),
    exchange: option?.exchange ?? (ticker.endsWith(".KQ") ? "KOSDAQ" : ticker.endsWith(".KS") ? "KRX" : "US"),
    tradingViewSymbol:
      option?.tradingViewSymbol ??
      (ticker.endsWith(".KQ") ? `KOSDAQ:${ticker.replace(".KQ", "")}` : ticker.endsWith(".KS") ? `KRX:${ticker.replace(".KS", "")}` : ticker),
    importanceScore: buildTickerImportance(snapshot, relatedNews),
    summary:
      snapshot.sma20 !== null && snapshot.sma50 !== null && snapshot.price > snapshot.sma20 && snapshot.sma20 > snapshot.sma50
        ? "추세 우위가 유지되는 동안 눌림 확인 매매가 유리한 구조입니다."
        : snapshot.sma20 !== null && snapshot.sma50 !== null && snapshot.price < snapshot.sma20 && snapshot.sma20 < snapshot.sma50
          ? "반등보다 구조 복원 확인이 먼저 필요한 방어 구간입니다."
          : "방향성 확정 전이라 조건부 접근이 필요한 중립 구간입니다.",
    technicalAnalysis: [
      describeTrend(snapshot),
      `주요 지지는 ${formatLevel(snapshot.support20)} / ${formatLevel(snapshot.support60)}, 저항은 ${formatLevel(snapshot.resistance20)} / ${formatLevel(snapshot.resistance60)}입니다.`,
      describeRsi(snapshot),
      describeMacd(snapshot)
    ].join(" "),
    patternAnalysis:
      patternAnalysis.length > 0
        ? patternAnalysis
        : [{ name: "뚜렷한 패턴 없음", detail: "지금은 강한 패턴보다 지지/저항 반응 확인이 더 중요합니다.", confidence: "low" }],
    marketContext: [
      proxySnapshot ? describeSectorFlow(proxySnapshot) : `${getResearchSectorLabel(sectorTag)} 섹터 프록시 확인이 부족해 개별 종목 뉴스 의존도가 높습니다.`,
      relatedNews[0] ? `연결 뉴스에서는 "${relatedNews[0].title}"가 가장 큰 가격 재료로 작동하고 있습니다.` : "직결 뉴스보다 업종 흐름 자체가 더 중요하게 작동하는 구간입니다."
    ].join(" "),
    recommendation: buildTickerRecommendation(snapshot, ticker),
    linkedNewsIds: relatedNews.map((item) => item.id),
    latestPrice: latestBar?.close ?? null,
    priceChange: priceChange ?? null,
    priceChangePercent: priceChangePercent ?? null,
    chartSeries: bars.slice(-90).map((bar) => ({
      date: bar.date,
      close: bar.close
    }))
  };
}

export async function analyzeLiveTicker(
  ticker: string,
  sectorTag: ResearchSectorTag,
  preferences?: Partial<UserResearchPreferences>
): Promise<LiveTickerAnalysisResult> {
  const normalizedTicker = normalizeTicker(ticker);
  const normalizedPreferences = normalizeResearchPreferences({
    ...preferences,
    sectors: preferences?.sectors?.length ? preferences.sectors : [sectorTag]
  });
  const warnings: string[] = [];
  const company = findResearchTickerOption(normalizedTicker)?.label ?? normalizedTicker;
  const feedContext: FeedContext = {
    symbol: normalizedTicker,
    sectorTag,
    tickerTags: [normalizedTicker, ...researchTickerOptions.filter((entry) => entry.sectorTag === sectorTag && entry.ticker !== normalizedTicker).slice(0, 2).map((entry) => entry.ticker)]
  };

  const [feedResult, chartResult, proxyResult] = await Promise.allSettled([
    fetchYahooFeed(feedContext),
    fetchYahooChart(normalizedTicker),
    buildProxySnapshotMap([sectorTag])
  ]);

  const rawNews =
    feedResult.status === "fulfilled"
      ? feedResult.value
      : (warnings.push(`${normalizedTicker} 뉴스 피드 수집 실패`), []);
  const relatedNews = await attachImages(
    dedupeByKey(
      rawNews
        .map((item) => toResearchNewsItem(item, feedContext, normalizedPreferences))
        .filter((item): item is ResearchNewsItem => Boolean(item))
        .sort((left, right) => right.importanceScore - left.importanceScore)
        .slice(0, 3),
      (item) => item.id
    )
  );

  const proxySnapshot =
    proxyResult.status === "fulfilled" ? proxyResult.value.map.get(sectorProxyMap[sectorTag]) : undefined;

  if (proxyResult.status === "fulfilled") {
    warnings.push(...proxyResult.value.warnings);
  } else {
    warnings.push(`${getResearchSectorLabel(sectorTag)} 섹터 프록시 수집 실패`);
  }

  if (chartResult.status !== "fulfilled" || chartResult.value.length < 60) {
    warnings.push(`${normalizedTicker} 가격 데이터 수집 실패`);

    return {
      analysis: null,
      relatedNews,
      warnings
    };
  }

  return {
    analysis: buildTickerAnalysisFromBars(normalizedTicker, company, sectorTag, chartResult.value, relatedNews, proxySnapshot),
    relatedNews,
    warnings
  };
}

async function buildLiveTickerAnalyses(
  preferences: UserResearchPreferences,
  newsItems: ResearchNewsItem[]
): Promise<{ analyses: TickerAnalysis[]; warnings: string[] }> {
  const warnings: string[] = [];
  const selectedTickers = buildSelectedTickers(preferences);
  const proxyMapResult = await buildProxySnapshotMap(preferences.sectors);
  const proxySnapshotBySymbol = proxyMapResult.map;
  warnings.push(...proxyMapResult.warnings);

  const chartResults = await Promise.allSettled(selectedTickers.map((ticker) => fetchYahooChart(ticker)));
  const analyses = chartResults
    .map((result, index) => {
      const ticker = selectedTickers[index];

      if (!ticker) {
        return null;
      }

      if (result.status !== "fulfilled" || result.value.length < 60) {
        warnings.push(`${ticker} 가격 데이터 수집 실패`);
        return null;
      }

      const option = findResearchTickerOption(ticker);
      const sectorTag = option?.sectorTag ?? preferences.sectors[0] ?? "semiconductors";
      const linkedNews = newsItems.filter((item) => item.tickerTags.includes(ticker) || item.sectorTag === sectorTag).slice(0, 3);
      const proxySnapshot = proxySnapshotBySymbol.get(sectorProxyMap[sectorTag]);
      return buildTickerAnalysisFromBars(ticker, option?.label ?? ticker, sectorTag, result.value, linkedNews, proxySnapshot);
    })
    .filter((item): item is TickerAnalysis => Boolean(item))
    .sort((left, right) => right.importanceScore - left.importanceScore);

  return {
    analyses,
    warnings
  };
}

export async function buildLiveResearchWorkspace(preferences?: Partial<UserResearchPreferences>): Promise<LiveResearchWorkspaceResult> {
  const normalizedPreferences = normalizeResearchPreferences(preferences);
  const generatedAt = new Date().toISOString();

  try {
    const newsResult = await buildLiveNews(normalizedPreferences);
    const tickerResult = await buildLiveTickerAnalyses(normalizedPreferences, newsResult.items);

    if (newsResult.items.length === 0 || tickerResult.analyses.length === 0) {
      return {
        workspace: buildResearchWorkspace(preferences),
        warnings: [...newsResult.warnings, ...tickerResult.warnings, "실데이터가 부족해 정적 워크스페이스로 대체했습니다."]
      };
    }

    return {
      workspace: buildResearchWorkspaceFromData({
        preferences: normalizedPreferences,
        generatedAt,
        newsItems: newsResult.items,
        tickerAnalyses: tickerResult.analyses
      }),
      warnings: [...newsResult.warnings, ...tickerResult.warnings]
    };
  } catch (error) {
    return {
      workspace: buildResearchWorkspace(preferences),
      warnings: [error instanceof Error ? `실데이터 워크스페이스 생성 실패: ${error.message}` : "실데이터 워크스페이스 생성 실패"]
    };
  }
}

export function readNewsletterRecipients(): string[] {
  return parseCsvEnv(process.env.NEWSLETTER_TO);
}
