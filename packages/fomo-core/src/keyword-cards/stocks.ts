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
  /** 누구나 아는 초대형 대장주(삼성전자·엔비디아 등) — "주목해볼만한 종목" 후보에서 제외(의외성 0). */
  marquee?: boolean;
}

/**
 * 종목 인식 어휘(보수적). 현재 테마들이 실제로 끌어오는 대표 종목 + 글로벌 진원지(엔비디아·TSMC 등).
 * 늘릴 때는 "그날 원문에 충분히 등장하는가"만 보면 되고, 안 뜨는 날은 자동으로 빠진다.
 * 오인식 1건이 신뢰를 깨므로 별칭은 좁게(애매한 약어 지양).
 */
export const STOCK_VOCAB: readonly StockDef[] = [
  // ── 한국(KOSPI/KOSDAQ) — 네이버 종토방 코드 보유 ──
  { canonical: "삼성전자", aliases: ["삼성전자"], market: "KOSPI", country: "KR", naverCode: "005930", marquee: true },
  { canonical: "SK하이닉스", aliases: ["SK하이닉스", "하이닉스"], market: "KOSPI", country: "KR", naverCode: "000660", marquee: true },
  { canonical: "한미반도체", aliases: ["한미반도체"], market: "KOSDAQ", country: "KR", naverCode: "042700" },
  { canonical: "에코프로비엠", aliases: ["에코프로비엠"], market: "KOSDAQ", country: "KR", naverCode: "247540" },
  { canonical: "에코프로", aliases: ["에코프로"], market: "KOSDAQ", country: "KR", naverCode: "086520" },
  { canonical: "LG에너지솔루션", aliases: ["LG에너지솔루션", "LG엔솔"], market: "KOSPI", country: "KR", naverCode: "373220", marquee: true },
  { canonical: "삼성SDI", aliases: ["삼성SDI"], market: "KOSPI", country: "KR", naverCode: "006400" },
  { canonical: "현대차", aliases: ["현대차", "현대자동차"], market: "KOSPI", country: "KR", naverCode: "005380", marquee: true },
  { canonical: "한화에어로스페이스", aliases: ["한화에어로스페이스", "한화에어로"], market: "KOSPI", country: "KR", naverCode: "012450" },
  { canonical: "두산에너빌리티", aliases: ["두산에너빌리티"], market: "KOSPI", country: "KR", naverCode: "034020" },
  { canonical: "셀트리온", aliases: ["셀트리온"], market: "KOSPI", country: "KR", naverCode: "068270" },
  { canonical: "삼성바이오로직스", aliases: ["삼성바이오로직스", "삼성바이오"], market: "KOSPI", country: "KR", naverCode: "207940", marquee: true },
  { canonical: "카카오", aliases: ["카카오"], market: "KOSPI", country: "KR", naverCode: "035720", marquee: true },
  { canonical: "NAVER", aliases: ["NAVER", "네이버"], market: "KOSPI", country: "KR", naverCode: "035420", marquee: true },
  { canonical: "기아", aliases: ["기아"], market: "KOSPI", country: "KR", naverCode: "000270", marquee: true },
  { canonical: "현대모비스", aliases: ["현대모비스"], market: "KOSPI", country: "KR", naverCode: "012330", marquee: true },
  { canonical: "POSCO홀딩스", aliases: ["POSCO홀딩스", "포스코홀딩스"], market: "KOSPI", country: "KR", naverCode: "005490", marquee: true },
  { canonical: "HD현대중공업", aliases: ["HD현대중공업"], market: "KOSPI", country: "KR", naverCode: "329180", marquee: true },
  { canonical: "크래프톤", aliases: ["크래프톤"], market: "KOSPI", country: "KR", naverCode: "259960", marquee: true },
  { canonical: "엔씨소프트", aliases: ["엔씨소프트"], market: "KOSPI", country: "KR", naverCode: "036570", marquee: true },
  // ── 중소형/테마 대표(주목해볼만한 종목 후보 — marquee 아님) ──
  { canonical: "한국항공우주", aliases: ["한국항공우주", "KAI"], market: "KOSPI", country: "KR", naverCode: "047810" },
  { canonical: "LIG넥스원", aliases: ["LIG넥스원", "LIG디펜스앤에어로스페이스"], market: "KOSPI", country: "KR", naverCode: "079550" },
  { canonical: "현대로템", aliases: ["현대로템"], market: "KOSPI", country: "KR", naverCode: "064350" },
  { canonical: "한화오션", aliases: ["한화오션"], market: "KOSPI", country: "KR", naverCode: "042660" },
  { canonical: "삼성중공업", aliases: ["삼성중공업"], market: "KOSPI", country: "KR", naverCode: "010140" },
  { canonical: "포스코퓨처엠", aliases: ["포스코퓨처엠"], market: "KOSPI", country: "KR", naverCode: "003670" },
  { canonical: "엘앤에프", aliases: ["엘앤에프"], market: "KOSDAQ", country: "KR", naverCode: "066970" },
  { canonical: "리노공업", aliases: ["리노공업"], market: "KOSDAQ", country: "KR", naverCode: "058470" },
  { canonical: "이오테크닉스", aliases: ["이오테크닉스"], market: "KOSDAQ", country: "KR", naverCode: "039030" },
  { canonical: "HPSP", aliases: ["HPSP"], market: "KOSDAQ", country: "KR", naverCode: "403870" },
  { canonical: "주성엔지니어링", aliases: ["주성엔지니어링"], market: "KOSDAQ", country: "KR", naverCode: "036930" },
  { canonical: "알테오젠", aliases: ["알테오젠"], market: "KOSDAQ", country: "KR", naverCode: "196170" },
  { canonical: "유한양행", aliases: ["유한양행"], market: "KOSPI", country: "KR", naverCode: "000100" },
  { canonical: "HLB", aliases: ["HLB"], market: "KOSDAQ", country: "KR", naverCode: "028300" },
  { canonical: "리가켐바이오", aliases: ["리가켐바이오", "리가켐"], market: "KOSDAQ", country: "KR", naverCode: "141080" },
  { canonical: "한전기술", aliases: ["한전기술"], market: "KOSPI", country: "KR", naverCode: "052690" },
  { canonical: "두산로보틱스", aliases: ["두산로보틱스"], market: "KOSPI", country: "KR", naverCode: "454910" },
  { canonical: "레인보우로보틱스", aliases: ["레인보우로보틱스"], market: "KOSDAQ", country: "KR", naverCode: "277810" },

  // ── 미국/글로벌 — 종토방 없음(레딧/외신으로 grounding, §1) ──
  { canonical: "엔비디아", aliases: ["엔비디아", "Nvidia", "NVDA"], market: "NASDAQ", country: "US", marquee: true },
  { canonical: "TSMC", aliases: ["TSMC", "대만 TSMC", "티에스엠씨"], market: "NYSE", country: "GLOBAL", marquee: true },
  { canonical: "마이크로소프트", aliases: ["마이크로소프트", "Microsoft", "MSFT"], market: "NASDAQ", country: "US", marquee: true },
  { canonical: "애플", aliases: ["애플", "Apple", "AAPL"], market: "NASDAQ", country: "US", marquee: true },
  { canonical: "테슬라", aliases: ["테슬라", "Tesla", "TSLA"], market: "NASDAQ", country: "US", marquee: true },
  { canonical: "AMD", aliases: ["AMD"], market: "NASDAQ", country: "US" },
  { canonical: "브로드컴", aliases: ["브로드컴", "Broadcom", "AVGO"], market: "NASDAQ", country: "US" },
  { canonical: "팔란티어", aliases: ["팔란티어", "Palantir", "PLTR"], market: "NASDAQ", country: "US" },
  { canonical: "마이크론", aliases: ["마이크론", "Micron"], market: "NASDAQ", country: "US" },

  // ── 코인 ──
  { canonical: "비트코인", aliases: ["비트코인", "bitcoin", "BTC"], market: "COIN", country: "GLOBAL", marquee: true },
  { canonical: "이더리움", aliases: ["이더리움", "ethereum", "ETH"], market: "COIN", country: "GLOBAL", marquee: true },
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

/**
 * 종목 아닌 카테고리·품목·산업·소재어 — LLM 이 stocks 필드에 잘못 넣는 것들("희토류", "무기 생산" 등).
 * relatedStocks 정직성: 종목명이 아닌 것을 종목으로 노출하지 않는다(c-honest). 정확 일치만(부분일치 X — "삼성바이오로직스"의 "바이오" 보호).
 */
const NON_STOCK_TERMS: ReadonlySet<string> = new Set([
  "희토류", "무기", "방산", "반도체", "이차전지", "2차전지", "배터리", "바이오", "제약",
  "원전", "원자력", "양자", "양자컴퓨터", "로봇", "우주", "수소", "태양광", "풍력",
  "원자재", "광물", "구리", "니켈", "리튬", "코발트", "우라늄", "곡물",
  "공급망", "관세", "금리", "환율", "유가", "인공지능", "ai", "반도체장비", "엔터",
  "게임", "조선", "건설", "화학", "철강", "자동차", "전기차", "메모리", "파운드리",
  "디스플레이", "통신", "은행", "증권", "보험", "헬스케어", "방위산업",
]);
/** 카테고리·활동 접미사(이걸로 끝나면 종목명 아님): "무기 생산", "반도체 관련주" 등. */
const NON_STOCK_SUFFIX = /(관련주|관련 ?주|테마주|테마|업종|섹터|산업|생산|공급|수출|수입|시장|규제|정책|밸류체인|체인)$/;

/** name 이 개별 종목명으로 그럴듯한가 — relatedStocks 노출 전 필터. 품목·산업·활동어는 거른다. */
export function isLikelyStock(name: string): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  if (NON_STOCK_TERMS.has(n.toLowerCase())) return false;
  if (NON_STOCK_SUFFIX.test(n)) return false;
  return true;
}

/** 카드에 붙는 "의외의 추천 종목" — 대장주 말고, 그 테마에서 의외로 같이 뜬 종목 1개. */
export interface SurpriseStock {
  canonical: string;
  market: StockMarket;
  country: StockCountry;
  /** 원문 등장 글 수. */
  mentions: number;
  /** 의외성 점수(높을수록 의외 — UI/정렬·디버그용). */
  surprise: number;
}

/**
 * 카드 1장의 "주목해볼만한 종목" — v2(광혁 피드백: 삼성전자 같은 초대형 대장주는 의외성 0).
 *
 * 의외성 정의(v2): **누구나 아는 초대형 대장주(marquee)를 전부 제외**하고, 그날 그 테마에서 같이 뜬
 *   덜 알려진 종목 중 1개. = "어, 이게 왜 같이 떴지?". marquee(삼성전자·엔비디아·하이닉스 등) 제외가 핵심.
 *   남은 후보 점수 = 코스닥(중소형) 가중 × 저빈도(주목 덜 받음) 가중. 동점은 mentions 적은 순 → 가나다.
 * 정직성: marquee 빼고 후보 없으면 null → 카드 표기 안 함(가짜로 안 채움).
 *
 * minMentions 기본 1(extractStocks 의 전역 노이즈컷 2와 다름): 이 함수는 호출부에서 **이미 그 키워드로
 *   좁혀진 부분집합**(theme-scoped news)을 받는다. 좁힌 집합에서 비-marquee 종목이 2회+ 등장하는 일은
 *   드물어, 2로 두면 2+ 생존자가 늘 marquee뿐 → 제외 후 후보 0 → 항상 null(기능이 화면에 영영 안 뜸).
 *   키워드 스코프 자체가 노이즈 필터라, 그 안의 grounded 1회 언급은 "같이 움직인 종목"의 유효 신호다.
 */
export function pickSurpriseStock(
  items: readonly KeywordSourceItem[],
  opts: ExtractStocksOptions = {}
): SurpriseStock | null {
  const stocks = extractStocks(items, { minMentions: opts.minMentions ?? 1 });
  const maxMentions = stocks[0]?.mentions ?? 1; // 빈도 정규화 기준(대장주 포함 1위)
  const byCanonical = new Map(STOCK_VOCAB.map((d) => [d.canonical, d]));
  // 초대형 대장주(marquee) 제외 — 삼성전자류는 "주목해볼만한"이 아님.
  const candidates = stocks.filter((s) => !byCanonical.get(s.canonical)?.marquee);
  if (candidates.length === 0) return null;

  const scored = candidates.map((s) => {
    const lesserKnown = s.market === "KOSDAQ" ? 1.5 : 1.0; // 코스닥(중소형) = 덜 알려짐
    const lowProfile = 1 - s.mentions / (maxMentions + 1); // 주목 덜 받을수록 ↑
    return { s, surprise: lesserKnown * (0.5 + lowProfile) };
  });
  scored.sort(
    (a, b) =>
      b.surprise - a.surprise ||
      a.s.mentions - b.s.mentions ||
      a.s.canonical.localeCompare(b.s.canonical)
  );
  const top = scored[0]!;
  return {
    canonical: top.s.canonical,
    market: top.s.market,
    country: top.s.country,
    mentions: top.s.mentions,
    surprise: Math.round(top.surprise * 100) / 100,
  };
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
