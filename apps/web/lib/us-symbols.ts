import { STOCK_VOCAB, type StockDef } from "@fomo/core";

export interface UsDiscoverySymbol {
  canonical: string;
  symbol: string;
  market: "NASDAQ" | "NYSE";
  sector: string;
  /**
   * Fame rank is a coarse, curated ordering used only for deck sorting when
   * live market-cap rank is unavailable. It must not be displayed as 시총 순위.
   */
  fameRank?: number;
}

export const US_DISCOVERY_SYMBOLS: UsDiscoverySymbol[] = [
  { canonical: "엔비디아", symbol: "NVDA", market: "NASDAQ", sector: "AI", fameRank: 3 },
  { canonical: "TSMC", symbol: "TSM", market: "NYSE", sector: "반도체", fameRank: 10 },
  { canonical: "마이크로소프트", symbol: "MSFT", market: "NASDAQ", sector: "AI", fameRank: 2 },
  { canonical: "애플", symbol: "AAPL", market: "NASDAQ", sector: "빅테크", fameRank: 1 },
  { canonical: "테슬라", symbol: "TSLA", market: "NASDAQ", sector: "전기차", fameRank: 9 },
  { canonical: "AMD", symbol: "AMD", market: "NASDAQ", sector: "반도체", fameRank: 32 },
  { canonical: "브로드컴", symbol: "AVGO", market: "NASDAQ", sector: "반도체", fameRank: 8 },
  { canonical: "팔란티어", symbol: "PLTR", market: "NASDAQ", sector: "AI", fameRank: 55 },
  { canonical: "마이크론", symbol: "MU", market: "NASDAQ", sector: "반도체", fameRank: 96 },
  { canonical: "슈퍼마이크로", symbol: "SMCI", market: "NASDAQ", sector: "AI", fameRank: 170 },
  { canonical: "앱러빈", symbol: "APP", market: "NASDAQ", sector: "AI", fameRank: 120 },
  { canonical: "로빈후드", symbol: "HOOD", market: "NASDAQ", sector: "핀테크", fameRank: 190 },
  { canonical: "코인베이스", symbol: "COIN", market: "NASDAQ", sector: "핀테크", fameRank: 160 },
  { canonical: "크라우드스트라이크", symbol: "CRWD", market: "NASDAQ", sector: "보안", fameRank: 150 },
  { canonical: "스노우플레이크", symbol: "SNOW", market: "NYSE", sector: "클라우드", fameRank: 220 },
  { canonical: "데이터독", symbol: "DDOG", market: "NASDAQ", sector: "클라우드", fameRank: 210 },
  { canonical: "몽고DB", symbol: "MDB", market: "NASDAQ", sector: "클라우드", fameRank: 260 },
  { canonical: "아이온큐", symbol: "IONQ", market: "NYSE", sector: "양자", fameRank: 360 },
  { canonical: "리게티", symbol: "RGTI", market: "NASDAQ", sector: "양자", fameRank: 620 },
  { canonical: "디웨이브퀀텀", symbol: "QBTS", market: "NYSE", sector: "양자", fameRank: 650 },
  { canonical: "사운드하운드AI", symbol: "SOUN", market: "NASDAQ", sector: "AI", fameRank: 540 },
  { canonical: "빅베어AI", symbol: "BBAI", market: "NYSE", sector: "AI", fameRank: 690 },
  { canonical: "세레브라스", symbol: "CRWV", market: "NASDAQ", sector: "AI", fameRank: 430 },
  { canonical: "아스테라랩스", symbol: "ALAB", market: "NASDAQ", sector: "반도체", fameRank: 310 },
  { canonical: "램리서치", symbol: "LRCX", market: "NASDAQ", sector: "반도체", fameRank: 80 },
  { canonical: "어플라이드머티어리얼즈", symbol: "AMAT", market: "NASDAQ", sector: "반도체", fameRank: 75 },
  { canonical: "마벨테크놀로지", symbol: "MRVL", market: "NASDAQ", sector: "반도체", fameRank: 130 },
  { canonical: "ARM", symbol: "ARM", market: "NASDAQ", sector: "반도체", fameRank: 60 },
  { canonical: "웨스턴디지털", symbol: "WDC", market: "NASDAQ", sector: "반도체", fameRank: 230 },
  { canonical: "시게이트", symbol: "STX", market: "NASDAQ", sector: "반도체", fameRank: 240 },
  { canonical: "오클로", symbol: "OKLO", market: "NYSE", sector: "원자력", fameRank: 520 },
  { canonical: "뉴스케일파워", symbol: "SMR", market: "NYSE", sector: "원자력", fameRank: 560 },
  { canonical: "콘스텔레이션에너지", symbol: "CEG", market: "NASDAQ", sector: "에너지", fameRank: 90 },
  { canonical: "비스트라", symbol: "VST", market: "NYSE", sector: "에너지", fameRank: 135 },
  { canonical: "GE버노바", symbol: "GEV", market: "NYSE", sector: "에너지", fameRank: 95 },
  { canonical: "버티브", symbol: "VRT", market: "NYSE", sector: "전력인프라", fameRank: 125 },
  { canonical: "이튼", symbol: "ETN", market: "NYSE", sector: "전력인프라", fameRank: 70 },
  { canonical: "블룸에너지", symbol: "BE", market: "NYSE", sector: "에너지", fameRank: 580 },
  { canonical: "퍼스트솔라", symbol: "FSLR", market: "NASDAQ", sector: "태양광", fameRank: 240 },
  { canonical: "인페이즈에너지", symbol: "ENPH", market: "NASDAQ", sector: "태양광", fameRank: 300 },
  { canonical: "리비안", symbol: "RIVN", market: "NASDAQ", sector: "전기차", fameRank: 260 },
  { canonical: "루시드", symbol: "LCID", market: "NASDAQ", sector: "전기차", fameRank: 420 },
  { canonical: "니오", symbol: "NIO", market: "NYSE", sector: "전기차", fameRank: 360 },
  { canonical: "업스타트", symbol: "UPST", market: "NASDAQ", sector: "핀테크", fameRank: 600 },
  { canonical: "어펌", symbol: "AFRM", market: "NASDAQ", sector: "핀테크", fameRank: 280 },
  { canonical: "블록", symbol: "SQ", market: "NYSE", sector: "핀테크", fameRank: 180 },
  { canonical: "소파이", symbol: "SOFI", market: "NASDAQ", sector: "핀테크", fameRank: 330 },
  { canonical: "레딧", symbol: "RDDT", market: "NYSE", sector: "소셜", fameRank: 260 },
  { canonical: "스포티파이", symbol: "SPOT", market: "NYSE", sector: "콘텐츠", fameRank: 115 },
  { canonical: "넷플릭스", symbol: "NFLX", market: "NASDAQ", sector: "콘텐츠", fameRank: 35 },
  { canonical: "로쿠", symbol: "ROKU", market: "NASDAQ", sector: "콘텐츠", fameRank: 500 },
  { canonical: "듀오링고", symbol: "DUOL", market: "NASDAQ", sector: "교육", fameRank: 390 },
  { canonical: "일라이릴리", symbol: "LLY", market: "NYSE", sector: "바이오", fameRank: 14 },
  { canonical: "노보노디스크", symbol: "NVO", market: "NYSE", sector: "바이오", fameRank: 24 },
  { canonical: "암젠", symbol: "AMGN", market: "NASDAQ", sector: "바이오", fameRank: 65 },
  { canonical: "모더나", symbol: "MRNA", market: "NASDAQ", sector: "바이오", fameRank: 260 },
  { canonical: "깅코바이오웍스", symbol: "DNA", market: "NYSE", sector: "바이오", fameRank: 760 },
  { canonical: "로켓랩", symbol: "RKLB", market: "NASDAQ", sector: "우주", fameRank: 480 },
  { canonical: "인튜이티브머신스", symbol: "LUNR", market: "NASDAQ", sector: "우주", fameRank: 720 },
  { canonical: "아처에비에이션", symbol: "ACHR", market: "NYSE", sector: "항공", fameRank: 650 },
  { canonical: "조비에비에이션", symbol: "JOBY", market: "NYSE", sector: "항공", fameRank: 590 },
];

const KNOWN_US_SYMBOLS: Record<string, string> = Object.fromEntries(
  US_DISCOVERY_SYMBOLS.flatMap((item) => [
    [item.canonical, item.symbol],
    [item.symbol, item.symbol],
  ])
);

const SEC_CIK_BY_SYMBOL: Record<string, string> = {
  AAPL: "0000320193",
  AMD: "0000002488",
  AVGO: "0001730168",
  MSFT: "0000789019",
  MU: "0000723125",
  NVDA: "0001045810",
  PLTR: "0001321655",
  TSLA: "0001318605",
};

function asciiAlias(def: StockDef): string | undefined {
  return def.aliases.find((alias) => /^[A-Z]{1,5}$/.test(alias));
}

export function usSymbolForStock(stock: string): string | undefined {
  const direct = KNOWN_US_SYMBOLS[stock.trim()];
  if (direct) return direct;
  const upper = stock.trim().toUpperCase();
  if (/^[A-Z]{1,5}$/.test(upper)) return upper;
  const def = STOCK_VOCAB.find((item) => item.canonical === stock || item.aliases.includes(stock));
  if (!def || def.country === "KR") return undefined;
  return KNOWN_US_SYMBOLS[def.canonical] ?? asciiAlias(def);
}

export function secCikForSymbol(symbol: string): string | undefined {
  return SEC_CIK_BY_SYMBOL[symbol.trim().toUpperCase()];
}

export function usStockDefs(): StockDef[] {
  return STOCK_VOCAB.filter((def) => def.country !== "KR" && def.market !== "COIN").map((def) => ({ ...def }));
}

export function usDiscoveryUniverse(): UsDiscoverySymbol[] {
  const bySymbol = new Map<string, UsDiscoverySymbol>();
  for (const item of US_DISCOVERY_SYMBOLS) bySymbol.set(item.symbol, { ...item });
  for (const def of usStockDefs()) {
    const symbol = usSymbolForStock(def.canonical);
    if (!symbol || bySymbol.has(symbol)) continue;
    bySymbol.set(symbol, {
      canonical: def.canonical,
      symbol,
      market: def.market === "NYSE" ? "NYSE" : "NASDAQ",
      sector: "미국주식",
    });
  }
  return [...bySymbol.values()];
}
