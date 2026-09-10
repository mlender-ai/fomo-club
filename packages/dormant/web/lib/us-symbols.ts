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
  { canonical: "아마존", symbol: "AMZN", market: "NASDAQ", sector: "빅테크", fameRank: 4 },
  { canonical: "알파벳", symbol: "GOOGL", market: "NASDAQ", sector: "AI", fameRank: 5 },
  { canonical: "알파벳C", symbol: "GOOG", market: "NASDAQ", sector: "AI", fameRank: 6 },
  { canonical: "메타", symbol: "META", market: "NASDAQ", sector: "AI", fameRank: 7 },
  { canonical: "테슬라", symbol: "TSLA", market: "NASDAQ", sector: "전기차", fameRank: 9 },
  { canonical: "오라클", symbol: "ORCL", market: "NYSE", sector: "클라우드", fameRank: 28 },
  { canonical: "세일즈포스", symbol: "CRM", market: "NYSE", sector: "클라우드", fameRank: 52 },
  { canonical: "어도비", symbol: "ADBE", market: "NASDAQ", sector: "AI", fameRank: 58 },
  { canonical: "시스코", symbol: "CSCO", market: "NASDAQ", sector: "네트워크", fameRank: 46 },
  { canonical: "AMD", symbol: "AMD", market: "NASDAQ", sector: "반도체", fameRank: 32 },
  { canonical: "브로드컴", symbol: "AVGO", market: "NASDAQ", sector: "반도체", fameRank: 8 },
  { canonical: "퀄컴", symbol: "QCOM", market: "NASDAQ", sector: "반도체", fameRank: 62 },
  { canonical: "텍사스인스트루먼트", symbol: "TXN", market: "NASDAQ", sector: "반도체", fameRank: 68 },
  { canonical: "KLA", symbol: "KLAC", market: "NASDAQ", sector: "반도체", fameRank: 82 },
  { canonical: "인텔", symbol: "INTC", market: "NASDAQ", sector: "반도체", fameRank: 105 },
  { canonical: "팔란티어", symbol: "PLTR", market: "NASDAQ", sector: "AI", fameRank: 55 },
  { canonical: "마이크론", symbol: "MU", market: "NASDAQ", sector: "반도체", fameRank: 96 },
  { canonical: "슈퍼마이크로", symbol: "SMCI", market: "NASDAQ", sector: "AI", fameRank: 170 },
  { canonical: "앱러빈", symbol: "APP", market: "NASDAQ", sector: "AI", fameRank: 120 },
  { canonical: "IBM", symbol: "IBM", market: "NYSE", sector: "AI", fameRank: 50 },
  { canonical: "서비스나우", symbol: "NOW", market: "NYSE", sector: "AI", fameRank: 74 },
  { canonical: "팔로알토네트웍스", symbol: "PANW", market: "NASDAQ", sector: "보안", fameRank: 85 },
  { canonical: "아리스타네트웍스", symbol: "ANET", market: "NYSE", sector: "네트워크", fameRank: 98 },
  { canonical: "델테크놀로지스", symbol: "DELL", market: "NYSE", sector: "AI", fameRank: 145 },
  { canonical: "HPE", symbol: "HPE", market: "NYSE", sector: "AI", fameRank: 250 },
  { canonical: "클라우드플레어", symbol: "NET", market: "NYSE", sector: "클라우드", fameRank: 235 },
  { canonical: "지스케일러", symbol: "ZS", market: "NASDAQ", sector: "보안", fameRank: 285 },
  { canonical: "옥타", symbol: "OKTA", market: "NASDAQ", sector: "보안", fameRank: 360 },
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
  { canonical: "코어위브", symbol: "CRWV", market: "NASDAQ", sector: "AI", fameRank: 430 },
  { canonical: "아스테라랩스", symbol: "ALAB", market: "NASDAQ", sector: "반도체", fameRank: 310 },
  { canonical: "램리서치", symbol: "LRCX", market: "NASDAQ", sector: "반도체", fameRank: 80 },
  { canonical: "어플라이드머티어리얼즈", symbol: "AMAT", market: "NASDAQ", sector: "반도체", fameRank: 75 },
  { canonical: "마벨테크놀로지", symbol: "MRVL", market: "NASDAQ", sector: "반도체", fameRank: 130 },
  { canonical: "ARM", symbol: "ARM", market: "NASDAQ", sector: "반도체", fameRank: 60 },
  { canonical: "웨스턴디지털", symbol: "WDC", market: "NASDAQ", sector: "반도체", fameRank: 230 },
  { canonical: "샌디스크", symbol: "SNDK", market: "NASDAQ", sector: "반도체", fameRank: 245 },
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
  { canonical: "우버", symbol: "UBER", market: "NYSE", sector: "플랫폼", fameRank: 72 },
  { canonical: "에어비앤비", symbol: "ABNB", market: "NASDAQ", sector: "플랫폼", fameRank: 150 },
  { canonical: "도어대시", symbol: "DASH", market: "NASDAQ", sector: "플랫폼", fameRank: 170 },
  { canonical: "업스타트", symbol: "UPST", market: "NASDAQ", sector: "핀테크", fameRank: 600 },
  { canonical: "어펌", symbol: "AFRM", market: "NASDAQ", sector: "핀테크", fameRank: 280 },
  { canonical: "블록", symbol: "SQ", market: "NYSE", sector: "핀테크", fameRank: 180 },
  { canonical: "소파이", symbol: "SOFI", market: "NASDAQ", sector: "핀테크", fameRank: 330 },
  { canonical: "마이크로스트래티지", symbol: "MSTR", market: "NASDAQ", sector: "크립토", fameRank: 180 },
  { canonical: "마라홀딩스", symbol: "MARA", market: "NASDAQ", sector: "크립토", fameRank: 410 },
  { canonical: "라이엇플랫폼스", symbol: "RIOT", market: "NASDAQ", sector: "크립토", fameRank: 520 },
  { canonical: "레딧", symbol: "RDDT", market: "NYSE", sector: "소셜", fameRank: 260 },
  { canonical: "더트레이드데스크", symbol: "TTD", market: "NASDAQ", sector: "광고", fameRank: 200 },
  { canonical: "스포티파이", symbol: "SPOT", market: "NYSE", sector: "콘텐츠", fameRank: 115 },
  { canonical: "넷플릭스", symbol: "NFLX", market: "NASDAQ", sector: "콘텐츠", fameRank: 35 },
  { canonical: "로쿠", symbol: "ROKU", market: "NASDAQ", sector: "콘텐츠", fameRank: 500 },
  { canonical: "듀오링고", symbol: "DUOL", market: "NASDAQ", sector: "교육", fameRank: 390 },
  { canonical: "액손엔터프라이즈", symbol: "AXON", market: "NASDAQ", sector: "보안", fameRank: 205 },
  { canonical: "일라이릴리", symbol: "LLY", market: "NYSE", sector: "바이오", fameRank: 14 },
  { canonical: "노보노디스크", symbol: "NVO", market: "NYSE", sector: "바이오", fameRank: 24 },
  { canonical: "암젠", symbol: "AMGN", market: "NASDAQ", sector: "바이오", fameRank: 65 },
  { canonical: "모더나", symbol: "MRNA", market: "NASDAQ", sector: "바이오", fameRank: 260 },
  { canonical: "인튜이티브서지컬", symbol: "ISRG", market: "NASDAQ", sector: "바이오", fameRank: 42 },
  { canonical: "힘스앤허스", symbol: "HIMS", market: "NYSE", sector: "헬스케어", fameRank: 340 },
  { canonical: "깅코바이오웍스", symbol: "DNA", market: "NYSE", sector: "바이오", fameRank: 760 },
  { canonical: "네비우스", symbol: "NBIS", market: "NASDAQ", sector: "AI 인프라", fameRank: 520 },
  { canonical: "스페이스X", symbol: "SPCX", market: "NASDAQ", sector: "우주", fameRank: 18 },
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
  ABNB: "0001559720",
  ADBE: "0000796343",
  AFRM: "0001820953",
  AMAT: "0000006951",
  AMGN: "0000318154",
  AMZN: "0001018724",
  AMD: "0000002488",
  ANET: "0001596532",
  APP: "0001751008",
  ARM: "0001973239",
  AVGO: "0001730168",
  AXON: "0001069183",
  BE: "0001664703",
  CEG: "0001868275",
  COIN: "0001679788",
  CRM: "0001108524",
  CRWD: "0001535527",
  CSCO: "0000858877",
  DASH: "0001792789",
  DDOG: "0001561550",
  DELL: "0001571996",
  DUOL: "0001562088",
  ETN: "0001551182",
  FSLR: "0001274494",
  GOOG: "0001652044",
  GOOGL: "0001652044",
  HIMS: "0001773751",
  HOOD: "0001783879",
  HPE: "0001645590",
  IBM: "0000051143",
  INTC: "0000050863",
  ISRG: "0001035267",
  KLAC: "0000319201",
  LCID: "0001811210",
  LLY: "0000059478",
  LRCX: "0000707549",
  LUNR: "0001844452",
  MARA: "0001507605",
  MDB: "0001441816",
  META: "0001326801",
  MRNA: "0001682852",
  MSFT: "0000789019",
  MRVL: "0001835632",
  MU: "0000723125",
  NFLX: "0001065280",
  NVDA: "0001045810",
  OKTA: "0001660134",
  ORCL: "0001341439",
  PANW: "0001327567",
  PLTR: "0001321655",
  QCOM: "0000804328",
  RDDT: "0001713445",
  RIVN: "0001874178",
  RKLB: "0001819994",
  ROKU: "0001428439",
  SMCI: "0001375365",
  SNOW: "0001640147",
  SOFI: "0001818879",
  SOUN: "0001840856",
  SQ: "0001512673",
  TTD: "0001671933",
  TSLA: "0001318605",
  TXN: "0000097476",
  UBER: "0001543151",
  UPST: "0001647639",
  VRT: "0001674103",
  VST: "0001692819",
  WDC: "0000106040",
  ZS: "0001713683",
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

export function usDiscoverySeedForSymbol(symbol: string): UsDiscoverySymbol | undefined {
  const upper = symbol.trim().toUpperCase();
  return US_DISCOVERY_SYMBOLS.find((item) => item.symbol === upper);
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
