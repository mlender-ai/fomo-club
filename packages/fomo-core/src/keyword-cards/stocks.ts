import type { KeywordSourceItem } from "./extract";

/**
 * 종목 인식 사전 + "그날 원문에 실제 등장한 종목" 추출. STOCK_THEME_EXPANSION_HANDOFF(B 트랙) §1.
 *
 * 순수 함수(네트워크·DB 0). 입력: 그날 수집된 원문 글(뉴스·종토방·디시·레딧 등).
 * 출력: 원문에 임계 이상 등장한 종목만(빈도가 곧 필터). **종목 마스터 리스트로 카드를 찍지 않는다.**
 *
 * 핵심 원칙(§0 "구조는 열되 지금은 평평하게"):
 * - 여기 사전은 카드 생성 목록이 아니라 *인식 어휘*다. 카드/뎁스 대상은 그날 원문이 추려준다.
 * - market/country/naverCode 는 데이터로 *채워만 둔다*(시장 분리·개인화 훅, 아이디어 A). 분기 로직 X.
 * - relatedHint 는 연관 그래프(방식 3, D 이후) 자리만 열어둔다. 채우는 로직은 지금 만들지 않는다.
 * - 연관(종목↔종목)·계층은 만들지 않는다(가짜 연관 금지).
 */

/** 시장 구분(표시/필터 훅 — 지금은 값만 채움). */
export type StockMarket = "KOSPI" | "KOSDAQ" | "NASDAQ" | "NYSE" | "COIN";
/** 종목 국적 — 국적에 맞는 소스(한국=종토방, 미국=레딧/외신) 연결에 쓴다(§1 소스 매핑). */
export type StockCountry = "KR" | "US" | "GLOBAL";

export interface StockDef {
  /** 카드/뎁스에 노출할 표준 종목명. */
  canonical: string;
  /** 인식용 별칭(한글명·영문명·티커). 한 종목이 여러 표기로 원문에 등장. */
  aliases: readonly string[];
  market: StockMarket;
  country: StockCountry;
  /** 네이버 종토방 코드(국내 상장만) — 없으면 종토방 소스 미연결(미국주 등). */
  naverCode?: string;
}

/**
 * 종목 인식 어휘(보수적). 현재 테마들이 실제로 끌어오는 대표 종목 + 글로벌 진원지(엔비디아·TSMC 등).
 * 늘릴 때는 "그날 원문에 충분히 등장하는가"만 보면 되고, 안 뜨는 날은 자동으로 빠진다.
 * 오인식 1건이 신뢰를 깨므로 별칭은 좁게(애매한 약어 지양).
 */
export const STOCK_VOCAB: readonly StockDef[] = [
  // ── 한국(KOSPI/KOSDAQ) — 네이버 종토방 코드 보유 ──
  { canonical: "삼성전자", aliases: ["삼성전자"], market: "KOSPI", country: "KR", naverCode: "005930" },
  { canonical: "SK하이닉스", aliases: ["SK하이닉스", "하이닉스"], market: "KOSPI", country: "KR", naverCode: "000660" },
  { canonical: "한미반도체", aliases: ["한미반도체"], market: "KOSDAQ", country: "KR", naverCode: "042700" },
  { canonical: "에코프로비엠", aliases: ["에코프로비엠"], market: "KOSDAQ", country: "KR", naverCode: "247540" },
  { canonical: "에코프로", aliases: ["에코프로"], market: "KOSDAQ", country: "KR", naverCode: "086520" },
  { canonical: "LG에너지솔루션", aliases: ["LG에너지솔루션", "LG엔솔"], market: "KOSPI", country: "KR", naverCode: "373220" },
  { canonical: "삼성SDI", aliases: ["삼성SDI"], market: "KOSPI", country: "KR", naverCode: "006400" },
  { canonical: "현대차", aliases: ["현대차", "현대자동차"], market: "KOSPI", country: "KR", naverCode: "005380" },
  { canonical: "한화에어로스페이스", aliases: ["한화에어로스페이스", "한화에어로"], market: "KOSPI", country: "KR", naverCode: "012450" },
  { canonical: "두산에너빌리티", aliases: ["두산에너빌리티"], market: "KOSPI", country: "KR", naverCode: "034020" },
  { canonical: "셀트리온", aliases: ["셀트리온"], market: "KOSPI", country: "KR", naverCode: "068270" },
  { canonical: "삼성바이오로직스", aliases: ["삼성바이오로직스", "삼성바이오"], market: "KOSPI", country: "KR", naverCode: "207940" },
  { canonical: "카카오", aliases: ["카카오"], market: "KOSPI", country: "KR", naverCode: "035720" },
  { canonical: "NAVER", aliases: ["NAVER", "네이버"], market: "KOSPI", country: "KR", naverCode: "035420" },

  // ── 미국/글로벌 — 종토방 없음(레딧/외신으로 grounding, §1) ──
  { canonical: "엔비디아", aliases: ["엔비디아", "Nvidia", "NVDA"], market: "NASDAQ", country: "US" },
  { canonical: "TSMC", aliases: ["TSMC", "대만 TSMC", "티에스엠씨"], market: "NYSE", country: "GLOBAL" },
  { canonical: "마이크로소프트", aliases: ["마이크로소프트", "Microsoft", "MSFT"], market: "NASDAQ", country: "US" },
  { canonical: "애플", aliases: ["애플", "Apple", "AAPL"], market: "NASDAQ", country: "US" },
  { canonical: "테슬라", aliases: ["테슬라", "Tesla", "TSLA"], market: "NASDAQ", country: "US" },
  { canonical: "AMD", aliases: ["AMD"], market: "NASDAQ", country: "US" },
  { canonical: "브로드컴", aliases: ["브로드컴", "Broadcom", "AVGO"], market: "NASDAQ", country: "US" },
  { canonical: "팔란티어", aliases: ["팔란티어", "Palantir", "PLTR"], market: "NASDAQ", country: "US" },
  { canonical: "마이크론", aliases: ["마이크론", "Micron"], market: "NASDAQ", country: "US" },

  // ── 코인 ──
  { canonical: "비트코인", aliases: ["비트코인", "bitcoin", "BTC"], market: "COIN", country: "GLOBAL" },
  { canonical: "이더리움", aliases: ["이더리움", "ethereum", "ETH"], market: "COIN", country: "GLOBAL" },
];

/** 그날 원문에 등장한 종목(추출 결과). market/country 동봉, relatedHint 자리만 열어둠(D 이후). */
export interface ExtractedStock {
  canonical: string;
  market: StockMarket;
  country: StockCountry;
  naverCode?: string;
  /** 원문 등장 글 수(빈도 = 강도). */
  mentions: number;
  /** 연관 종목 힌트(방식 3, D 이후) — 지금은 항상 빈 배열(가짜 연관 금지). */
  relatedHint: readonly string[];
}

function isAsciiAlias(t: string): boolean {
  return /^[a-z0-9]+$/i.test(t);
}
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface StockMatcher {
  def: StockDef;
  /** 한글 등 비-ASCII 별칭 — 부분일치(소문자). */
  substrings: readonly string[];
  /** ASCII 티커/영문명 — 단어경계 매칭("AMD"가 "camden" 안에서 안 걸리게). */
  regexes: readonly RegExp[];
}

const STOCK_MATCHERS: readonly StockMatcher[] = STOCK_VOCAB.map((def) => {
  const substrings: string[] = [];
  const regexes: RegExp[] = [];
  for (const a of def.aliases) {
    const low = a.toLowerCase();
    if (isAsciiAlias(a)) regexes.push(new RegExp(`(^|[^a-z0-9])${escapeRegex(low)}([^a-z0-9]|$)`));
    else substrings.push(low);
  }
  return { def, substrings, regexes };
});

/** 한 글이 어떤 종목을 언급하나 — 한글=부분일치, 영문/티커=단어경계(대소문자 무시). */
function matchedStocks(text: string): string[] {
  const blob = text.toLowerCase();
  const hits: string[] = [];
  for (const m of STOCK_MATCHERS) {
    if (m.substrings.some((s) => blob.includes(s)) || m.regexes.some((re) => re.test(blob))) {
      hits.push(m.def.canonical);
    }
  }
  return hits;
}

export interface ExtractStocksOptions {
  /** 노이즈 컷 — 이 횟수 미만 등장 종목은 제외(스쳐간 1회 언급 배제). 기본 2. */
  minMentions?: number;
}

/**
 * 그날 원문 글 → 등장 종목 추출(빈도 임계 컷). §1 "원문이 곧 필터".
 * - 글 1건에 같은 종목이 여러 별칭으로 나와도 그 글은 1회로 센다(글 수 기준).
 * - mentions 내림차순 정렬. 임계 미만은 제외(노이즈).
 * - grounding: 별칭이 원문에 substring/단어경계로 실제 존재해야만 카운트(가짜 종목 금지).
 */
export function extractStocks(
  items: readonly KeywordSourceItem[],
  opts: ExtractStocksOptions = {}
): ExtractedStock[] {
  const minMentions = opts.minMentions ?? 2;
  const counts = new Map<string, number>();
  for (const item of items) {
    const blob = `${item.title} ${item.summary ?? ""}`;
    const seen = new Set(matchedStocks(blob)); // 한 글 = 종목당 1회
    for (const canonical of seen) counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
  }

  const byCanonical = new Map(STOCK_VOCAB.map((d) => [d.canonical, d]));
  const out: ExtractedStock[] = [];
  for (const [canonical, mentions] of counts) {
    if (mentions < minMentions) continue;
    const def = byCanonical.get(canonical)!;
    out.push({
      canonical,
      market: def.market,
      country: def.country,
      ...(def.naverCode ? { naverCode: def.naverCode } : {}),
      mentions,
      relatedHint: [], // D 이후 — 지금은 항상 비움(손으로 박지 않는다)
    });
  }
  out.sort((a, b) => b.mentions - a.mentions || a.canonical.localeCompare(b.canonical));
  return out;
}

/** 종목명 → 정의(소스 매핑 등에 사용). 없으면 undefined. */
export function stockDef(canonical: string): StockDef | undefined {
  return STOCK_VOCAB.find((d) => d.canonical === canonical);
}

const MATCHER_BY_CANONICAL = new Map(STOCK_MATCHERS.map((m) => [m.def.canonical, m]));

/**
 * text 가 그 종목을 *어떤 별칭으로든* 언급하나 — 뉴스/레딧 원문 필터·grounding 용.
 * 한글 별칭=부분일치, 영문/티커=단어경계(엔비디아=Nvidia=NVDA 모두 인식). 미등록 종목은 단순 포함.
 */
export function stockMatchesText(canonical: string, text: string): boolean {
  const m = MATCHER_BY_CANONICAL.get(canonical);
  const blob = text.toLowerCase();
  if (!m) return blob.includes(canonical.toLowerCase());
  return m.substrings.some((s) => blob.includes(s)) || m.regexes.some((re) => re.test(blob));
}
