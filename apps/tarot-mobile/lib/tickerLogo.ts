// Ticker logo URL resolution
// Priority: custom override (from API) → Clearbit → Google Favicons → null

export const TICKER_DOMAIN_MAP: Record<string, string> = {
  // US — Large Cap
  AAPL:  "apple.com",
  NVDA:  "nvidia.com",
  TSLA:  "tesla.com",
  MSFT:  "microsoft.com",
  GOOGL: "google.com",
  GOOG:  "google.com",
  AMZN:  "amazon.com",
  META:  "meta.com",
  NFLX:  "netflix.com",
  BRKB:  "berkshirehathaway.com",
  "BRK.B": "berkshirehathaway.com",
  JPM:   "jpmorganchase.com",
  V:     "visa.com",
  MA:    "mastercard.com",
  UNH:   "unitedhealthgroup.com",
  JNJ:   "jnj.com",
  WMT:   "walmart.com",
  AVGO:  "broadcom.com",
  HD:    "homedepot.com",
  PG:    "pg.com",
  ORCL:  "oracle.com",
  AMD:   "amd.com",
  INTC:  "intel.com",
  QCOM:  "qualcomm.com",
  TXN:   "ti.com",
  CRM:   "salesforce.com",
  ADBE:  "adobe.com",
  NOW:   "servicenow.com",
  PYPL:  "paypal.com",
  UBER:  "uber.com",
  SPOT:  "spotify.com",
  COIN:  "coinbase.com",
  HOOD:  "robinhood.com",
  PLTR:  "palantir.com",
  SOFI:  "sofi.com",
  RBLX:  "roblox.com",
  SNAP:  "snap.com",
  LYFT:  "lyft.com",
  ABNB:  "airbnb.com",
  RIVN:  "rivian.com",
  LCID:  "lucidmotors.com",
  NIO:   "nio.com",
  BABA:  "alibaba.com",
  JD:    "jd.com",
  PDD:   "pinduoduo.com",
  BIDU:  "baidu.com",
  // KR — 코스피
  "005930.KS": "samsung.com",
  "000660.KS": "skhynix.com",
  "035420.KS": "navercorp.com",
  "035720.KS": "kakao.com",
  "051910.KS": "lgchem.com",
  "006400.KS": "samsungsdi.com",
  "207940.KS": "samsungbiologics.com",
  "066570.KS": "lg.com",
  "003550.KS": "lgcorp.com",
  "012330.KS": "mobis.co.kr",
  "005380.KS": "hyundai.com",
  "000270.KS": "kia.com",
  "028260.KS": "samsungsds.com",
  "034730.KS": "sk.com",
  "017670.KS": "sktelecom.com",
  "030200.KS": "kt.com",
  "032830.KS": "samsunglife.com",
  "086790.KS": "hanabank.com",
  "105560.KS": "kbfg.com",
  // KR — 코스닥
  "035760.KQ": "cjenm.com",
};

// Custom overrides fetched from API (managed via admin)
let _customOverrides: Record<string, string> = {};

export function setTickerLogoOverrides(overrides: Record<string, string>) {
  _customOverrides = overrides;
}

export function getTickerLogoOverride(ticker: string): string | null {
  return _customOverrides[ticker] ?? _customOverrides[ticker.toUpperCase()] ?? null;
}

// 런타임에서 검색 결과로 알게 된 이름 → 도메인 추론용 캐시
let _nameCache: Record<string, string> = {};

export function cacheTickerName(ticker: string, companyName: string) {
  _nameCache[ticker] = companyName;
  _nameCache[ticker.toUpperCase()] = companyName;
}

/** 회사명에서 도메인을 추론 (예: "Apple Inc." → "apple.com") */
function guessDomainFromName(name: string): string | null {
  if (!name) return null;
  // 흔한 접미사 제거
  const cleaned = name
    .replace(/,?\s*(Inc\.?|Corp\.?|Co\.?|Ltd\.?|LLC|PLC|S\.A\.?|SE|N\.V\.?|AG|Group|Holdings?|Incorporated|Corporation|Limited|Company)$/i, "")
    .trim();
  if (!cleaned) return null;
  // 첫 단어만 사용 (보통 브랜드명)
  const brand = cleaned.split(/\s+/)[0]!.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (brand.length < 2) return null;
  return `${brand}.com`;
}

/** Returns ordered list of URLs to try (custom override first, then auto sources) */
export function getTickerLogoUrls(ticker: string, size = 48): string[] {
  const override = getTickerLogoOverride(ticker);
  if (override) return [override];

  const domain =
    TICKER_DOMAIN_MAP[ticker] ??
    TICKER_DOMAIN_MAP[ticker.toUpperCase()] ??
    null;

  if (domain) {
    return [
      `https://logo.clearbit.com/${domain}`,
      `https://www.google.com/s2/favicons?sz=128&domain=${domain}`,
    ];
  }

  // 도메인 맵에 없는 티커 → 캐시된 회사명으로 도메인 추론
  const companyName = _nameCache[ticker] ?? _nameCache[ticker.toUpperCase()];
  const guessedDomain = companyName ? guessDomainFromName(companyName) : null;

  if (guessedDomain) {
    return [
      `https://logo.clearbit.com/${guessedDomain}`,
      `https://www.google.com/s2/favicons?sz=128&domain=${guessedDomain}`,
    ];
  }

  return [];
}

/** Legacy single-URL helper — returns first candidate */
export function getTickerLogoUrl(ticker: string, size = 48): string | null {
  const urls = getTickerLogoUrls(ticker, size);
  return urls[0] ?? null;
}

// Deterministic color from ticker string for fallback avatar
export function getTickerColor(ticker: string): string {
  const COLORS = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
    "#f97316", "#eab308", "#22c55e", "#14b8a6",
    "#3b82f6", "#06b6d4",
  ];
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) {
    hash = (hash * 31 + ticker.charCodeAt(i)) & 0xffffffff;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}
