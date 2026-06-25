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
  // 반도체 소부장/연관 — 발굴(discover)에서 자주 뜨는 실상장 종목(티커 검증된 것만 보강).
  { canonical: "삼성전기", aliases: ["삼성전기"], market: "KOSPI", country: "KR", naverCode: "009150" },
  { canonical: "DB하이텍", aliases: ["DB하이텍"], market: "KOSPI", country: "KR", naverCode: "000990" },
  { canonical: "저스템", aliases: ["저스템"], market: "KOSDAQ", country: "KR", naverCode: "417840" },
  { canonical: "네패스", aliases: ["네패스"], market: "KOSDAQ", country: "KR", naverCode: "033640" },
  { canonical: "원익IPS", aliases: ["원익IPS"], market: "KOSDAQ", country: "KR", naverCode: "240810" },
  { canonical: "동진쎄미켐", aliases: ["동진쎄미켐"], market: "KOSDAQ", country: "KR", naverCode: "005290" },
  { canonical: "하나마이크론", aliases: ["하나마이크론"], market: "KOSDAQ", country: "KR", naverCode: "067310" },
  { canonical: "제너셈", aliases: ["제너셈"], market: "KOSDAQ", country: "KR", naverCode: "217190" },
  // ── 섹터 풀 확장(SECTOR_POOL_EXPANSION) — 국내 baseline 보강. naverCode 네이버 교차검증 완료. ──
  // AI(국내)
  { canonical: "더존비즈온", aliases: ["더존비즈온"], market: "KOSPI", country: "KR", naverCode: "012510" },
  { canonical: "한글과컴퓨터", aliases: ["한글과컴퓨터"], market: "KOSDAQ", country: "KR", naverCode: "030520" },
  { canonical: "코난테크놀로지", aliases: ["코난테크놀로지"], market: "KOSDAQ", country: "KR", naverCode: "402030" },
  { canonical: "솔트룩스", aliases: ["솔트룩스"], market: "KOSDAQ", country: "KR", naverCode: "304100" },
  { canonical: "셀바스AI", aliases: ["셀바스AI"], market: "KOSDAQ", country: "KR", naverCode: "108860" },
  { canonical: "루닛", aliases: ["루닛"], market: "KOSDAQ", country: "KR", naverCode: "328130" },
  // 원자력
  { canonical: "한국전력", aliases: ["한국전력", "한전"], market: "KOSPI", country: "KR", naverCode: "015760", marquee: true },
  { canonical: "한전KPS", aliases: ["한전KPS"], market: "KOSPI", country: "KR", naverCode: "051600" },
  { canonical: "우진", aliases: ["우진"], market: "KOSPI", country: "KR", naverCode: "105840" },
  { canonical: "비에이치아이", aliases: ["비에이치아이"], market: "KOSDAQ", country: "KR", naverCode: "083650" },
  { canonical: "일진파워", aliases: ["일진파워"], market: "KOSDAQ", country: "KR", naverCode: "094820" },
  { canonical: "보성파워텍", aliases: ["보성파워텍"], market: "KOSDAQ", country: "KR", naverCode: "006910" },
  // 2차전지
  { canonical: "코스모신소재", aliases: ["코스모신소재"], market: "KOSPI", country: "KR", naverCode: "005070" },
  { canonical: "천보", aliases: ["천보"], market: "KOSDAQ", country: "KR", naverCode: "278280" },
  { canonical: "나노신소재", aliases: ["나노신소재"], market: "KOSDAQ", country: "KR", naverCode: "121600" },
  { canonical: "더블유씨피", aliases: ["더블유씨피"], market: "KOSDAQ", country: "KR", naverCode: "393890" },
  { canonical: "대주전자재료", aliases: ["대주전자재료"], market: "KOSDAQ", country: "KR", naverCode: "078600" },
  { canonical: "금양", aliases: ["금양"], market: "KOSPI", country: "KR", naverCode: "001570" },
  // 방산
  { canonical: "한화시스템", aliases: ["한화시스템"], market: "KOSPI", country: "KR", naverCode: "272210" },
  { canonical: "풍산", aliases: ["풍산"], market: "KOSPI", country: "KR", naverCode: "103140" },
  { canonical: "빅텍", aliases: ["빅텍"], market: "KOSDAQ", country: "KR", naverCode: "065450" },
  { canonical: "퍼스텍", aliases: ["퍼스텍"], market: "KOSDAQ", country: "KR", naverCode: "010820" },
  { canonical: "STX엔진", aliases: ["STX엔진"], market: "KOSPI", country: "KR", naverCode: "077970" },
  { canonical: "휴니드", aliases: ["휴니드"], market: "KOSPI", country: "KR", naverCode: "005870" },
  // 바이오
  { canonical: "SK바이오팜", aliases: ["SK바이오팜"], market: "KOSPI", country: "KR", naverCode: "326030" },
  { canonical: "한미약품", aliases: ["한미약품"], market: "KOSPI", country: "KR", naverCode: "128940" },
  { canonical: "종근당", aliases: ["종근당"], market: "KOSPI", country: "KR", naverCode: "185750" },
  { canonical: "대웅제약", aliases: ["대웅제약"], market: "KOSPI", country: "KR", naverCode: "069620" },
  { canonical: "펩트론", aliases: ["펩트론"], market: "KOSDAQ", country: "KR", naverCode: "087010" },
  { canonical: "에이비엘바이오", aliases: ["에이비엘바이오"], market: "KOSDAQ", country: "KR", naverCode: "298380" },
  // 코인 관련주(상장사 — "코인 자체"가 아니라 코인 관련 사업/투자)
  { canonical: "우리기술투자", aliases: ["우리기술투자"], market: "KOSDAQ", country: "KR", naverCode: "041190" },
  { canonical: "갤럭시아머니트리", aliases: ["갤럭시아머니트리"], market: "KOSDAQ", country: "KR", naverCode: "094480" },
  { canonical: "다날", aliases: ["다날"], market: "KOSDAQ", country: "KR", naverCode: "064260" },
  { canonical: "한화투자증권", aliases: ["한화투자증권"], market: "KOSPI", country: "KR", naverCode: "003530" },

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

export type StockMentionRole = "primary" | "secondary" | "none";

function aliasMatchIndex(def: StockDef, text: string): number {
  const blob = text.toLowerCase();
  let best = Number.POSITIVE_INFINITY;
  for (const alias of def.aliases) {
    const low = alias.toLowerCase();
    if (isAsciiAlias(alias)) {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(low)}([^a-z0-9]|$)`, "i");
      const match = re.exec(blob);
      if (match) best = Math.min(best, match.index + (match[1]?.length ?? 0));
    } else {
      const index = blob.indexOf(low);
      if (index >= 0) best = Math.min(best, index);
    }
  }
  return best;
}

/**
 * 기사/원문이 특정 종목을 어느 정도로 다루는지.
 * - primary: 제목에서 해당 종목이 가장 먼저 등장하거나 제목이 그 종목명으로 시작.
 * - secondary: 본문/제목에 등장하지만 다른 종목이 먼저 나온 부차 언급.
 * WHY 헤드라인은 primary 에만 붙인다. 부차 동시언급을 그대로 쓰면 삼성=하이닉스 같은 중복 이유가 된다.
 */
export function stockMentionRole(canonical: string, item: Pick<KeywordSourceItem, "title" | "summary">): StockMentionRole {
  const def = resolveStock(canonical);
  if (!def) return "none";
  const title = item.title ?? "";
  const summary = item.summary ?? "";
  if (!stockMatchesText(canonical, `${title} ${summary}`)) return "none";

  const titleIndex = aliasMatchIndex(def, title);
  if (Number.isFinite(titleIndex)) {
    const titleHits = STOCK_VOCAB
      .map((stock) => ({ stock, index: aliasMatchIndex(stock, title) }))
      .filter((hit) => Number.isFinite(hit.index))
      .sort((a, b) => a.index - b.index || a.stock.canonical.localeCompare(b.stock.canonical));
    return titleHits[0]?.stock.canonical === def.canonical ? "primary" : "secondary";
  }

  return stockMatchesText(canonical, summary) ? "secondary" : "none";
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
  /** "왜 보여줬나" grounded 근거 — 이 종목이 등장한 실제 원문 한 줄(B). 없으면 노출 약함. */
  reason?: string;
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
  // B — "왜 보여줬나" grounded 근거: 그 종목이 *주어*인 원문 한 줄만(비교·리스트는 폐기).
  //     점수 1위만 보지 않고 **후보를 점수순으로 훑어 깨끗한 근거가 있는 첫 종목**을 고른다.
  //     (1위 후보의 헤드라인이 비교/리스트뿐이어도, 차순위에 주어 헤드라인이 있으면 그걸 노출 — 종목 카드가
  //      엉뚱하게 통째로 사라지던 버그 수정.) 어느 후보도 깨끗한 근거가 없을 때만 null(정직).
  for (const { s, surprise } of scored) {
    const reason = pickSurpriseReason(items, s.canonical);
    if (!reason) continue;
    return {
      canonical: s.canonical,
      market: s.market,
      country: s.country,
      mentions: s.mentions,
      surprise: Math.round(surprise * 100) / 100,
      reason,
    };
  }
  return null;
}

/** 비교/리스트/인기검색 류 — 종목이 주어가 아닌 약한 헤드라인(노출 기준 미달). */
const WEAK_HEADLINE =
  /(인기검색|특징주|급등주|급등 ?종목|상한가|TOP\s?\d|순위|총정리|모음|제쳤|제치|넘어섰|넘고|앞질|제외하고|\[[^\]]*\])/;

/** surprise 종목의 "왜" 근거 한 줄 — 그 종목이 *주어*인 깨끗한 원문만(없으면 undefined). */
function pickSurpriseReason(
  items: readonly KeywordSourceItem[],
  canonical: string
): string | undefined {
  const matched = items.filter((it) =>
    stockMatchesText(canonical, `${it.title} ${it.summary ?? ""}`)
  );
  if (matched.length === 0) return undefined;
  const norm = (s: string) => s.replace(/\s+/g, "");
  const nc = norm(canonical);
  // 1순위: 제목이 종목명으로 시작(주어) + 비교/리스트 아님.
  const subjectFirst = matched.find(
    (it) => norm(it.title).startsWith(nc) && !WEAK_HEADLINE.test(it.title)
  );
  if (subjectFirst) return subjectFirst.title.trim();
  // 2순위: 종목명 포함 + 비교/리스트 아님(주어 추정).
  const clean = matched.find((it) => !WEAK_HEADLINE.test(it.title));
  if (clean) return clean.title.trim();
  // 전부 비교/리스트 → 약한 이유뿐 → 폐기.
  return undefined;
}

/** 종목명 → 정의(소스 매핑 등에 사용). 없으면 undefined. */
export function stockDef(canonical: string): StockDef | undefined {
  return STOCK_VOCAB.find((d) => d.canonical === canonical);
}

const normName = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/**
 * 종목 검증 게이트(품질 최우선) — 후보명이 *실제 상장 종목(티커 보유)* 인지 해석한다.
 * STOCK_VOCAB(canonical+aliases, 모두 naverCode/거래소 보유)에 **정확/별칭 일치**하면 그 정의를,
 * 아니면 null. "MLCC·HBM·온디바이스AI" 같은 부품·기술·소재어는 vocab 에 없으니 null → 종목 노출 금지.
 * substring 이 아니라 정규화 동치(공백·대소문자 무시)로만 — "삼성전자 관련주" 가 삼성전자로 둔갑하지 않게.
 * 발굴(discover)·라벨·stock-insight 진입의 **공통 관문**으로 쓴다. 검증 실패 = 가짜로 만들지 않는다.
 */
export function resolveStock(name: string): StockDef | null {
  const nn = normName(name ?? "");
  if (nn.length < 2) return null;
  for (const d of STOCK_VOCAB) {
    if (normName(d.canonical) === nn) return d;
    if (d.aliases.some((a) => normName(a) === nn)) return d;
  }
  return null;
}

/** 후보명이 검증된 상장 종목인가(resolveStock 의 boolean 버전). */
export function isVerifiedStock(name: string): boolean {
  return resolveStock(name) !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 섹터 ↔ 종목 매핑 (SECTOR_STRUCTURE_HANDOFF §2) — 섹터 카테고리 × 종목 풀의 토대.
//
// 섹터 = 취향의 단위 = THEME_DICTIONARY 키와 일치시킨다(섹터 요약 카드가 테마 이해 레이어를
//   그대로 재사용하도록 — understandTheme(sector) 가 돌게). 그래서 섹터는 *테마가 있는 것만*.
// 평평하게(§0): 종목당 단일 primary 섹터. 다중소속·연관 그래프는 D 이후(relatedHint 자리만 열림).
// 풀의 바닥은 여기 큐레이션된 "의미 있는 종목"(baseline·발굴·테마 대표). 빈약(미등록) 종목은 애초에 없음.
// 매핑 없는 vocab 종목(자동차·조선·게임·로봇 등 — 대응 테마 미존재)은 섹터 풀에서 빠진다(정직).
// ─────────────────────────────────────────────────────────────────────────────

/** 섹터 = 취향/네비 단위. THEME_DICTIONARY 키 중 대표 종목이 있는 것. */
export type StockSector =
  | "반도체"
  | "AI"
  | "2차전지"
  | "방산"
  | "바이오"
  | "원자력"
  | "코인";

/** 섹터 표시 순서(콜드스타트 기본 노출 순 — 인기/대표 섹터 우선). 개인화 정렬은 다음 트랙. */
export const SECTORS: readonly StockSector[] = [
  "반도체",
  "AI",
  "2차전지",
  "방산",
  "바이오",
  "원자력",
  "코인",
];

/** 종목 canonical → primary 섹터(섹터 SSOT). 매핑 없으면 섹터 풀에서 제외. */
const SECTOR_OF: Readonly<Record<string, StockSector>> = {
  // 반도체(글로벌 진원지 포함)
  삼성전자: "반도체", SK하이닉스: "반도체", 한미반도체: "반도체", 삼성전기: "반도체",
  DB하이텍: "반도체", 저스템: "반도체", 네패스: "반도체", 원익IPS: "반도체",
  동진쎄미켐: "반도체", 하나마이크론: "반도체", 제너셈: "반도체", 리노공업: "반도체",
  이오테크닉스: "반도체", HPSP: "반도체", 주성엔지니어링: "반도체",
  엔비디아: "반도체", TSMC: "반도체", AMD: "반도체", 브로드컴: "반도체", 마이크론: "반도체",
  // AI (국내 SW/AI + AI 로봇)
  마이크로소프트: "AI", 팔란티어: "AI",
  더존비즈온: "AI", 한글과컴퓨터: "AI", 코난테크놀로지: "AI", 솔트룩스: "AI",
  셀바스AI: "AI", 루닛: "AI", 두산로보틱스: "AI", 레인보우로보틱스: "AI",
  // 2차전지
  에코프로비엠: "2차전지", 에코프로: "2차전지", LG에너지솔루션: "2차전지", 삼성SDI: "2차전지",
  포스코퓨처엠: "2차전지", 엘앤에프: "2차전지",
  코스모신소재: "2차전지", 천보: "2차전지", 나노신소재: "2차전지", 더블유씨피: "2차전지",
  대주전자재료: "2차전지", 금양: "2차전지",
  // 방산(군함 포함)
  한화에어로스페이스: "방산", 한국항공우주: "방산", LIG넥스원: "방산", 현대로템: "방산",
  한화오션: "방산", 삼성중공업: "방산",
  한화시스템: "방산", 풍산: "방산", 빅텍: "방산", 퍼스텍: "방산", STX엔진: "방산", 휴니드: "방산",
  // 바이오
  셀트리온: "바이오", 삼성바이오로직스: "바이오", 알테오젠: "바이오", 유한양행: "바이오",
  HLB: "바이오", 리가켐바이오: "바이오",
  SK바이오팜: "바이오", 한미약품: "바이오", 종근당: "바이오", 대웅제약: "바이오",
  펩트론: "바이오", 에이비엘바이오: "바이오",
  // 원자력
  두산에너빌리티: "원자력", 한전기술: "원자력",
  한국전력: "원자력", 한전KPS: "원자력", 우진: "원자력", 비에이치아이: "원자력",
  일진파워: "원자력", 보성파워텍: "원자력",
  // 코인 (코인 관련 상장주 — 코인 자체 아님)
  비트코인: "코인", 이더리움: "코인",
  우리기술투자: "코인", 갤럭시아머니트리: "코인", 다날: "코인", 한화투자증권: "코인",
};

/** 종목의 섹터(없으면 undefined — 대응 테마 없는 종목). */
export function sectorOf(canonical: string): StockSector | undefined {
  return SECTOR_OF[canonical];
}

/** 섹터 풀의 종목 1건 — 정렬·카드 생성에 필요한 메타(시세 아님). */
export interface SectorStock {
  canonical: string;
  market: StockMarket;
  country: StockCountry;
  naverCode?: string;
  /** 누구나 아는 대표 대장주 — 콜드스타트 기본 노출 상단. */
  marquee: boolean;
  sector: StockSector;
}

export interface StocksBySectorOptions {
  /**
   * baseline(주가·재무) 수집 가능한 국내 상장(naverCode 보유)만. 기본 false(미국·코인 포함).
   * 카드 풀의 "빈 카드 방지"가 필요한 호출부(무한 스와이프)는 true 로 baseline 보장 종목만 받는다.
   */
  requireNaverCode?: boolean;
}

/**
 * 섹터 → 그 섹터의 의미 있는 종목 풀(SECTOR_STRUCTURE_HANDOFF §2). 순수.
 * SECTOR_OF(큐레이션)로 1차 구성 → 정렬 seam(sortStocksForFeed)로 노출 순서 결정.
 * "빈약 제외"는 풀 자체가 큐레이션이라 기본 충족. requireNaverCode 로 baseline 보장만 더 좁힐 수 있다.
 */
export function stocksBySector(
  sector: StockSector,
  opts: StocksBySectorOptions = {}
): SectorStock[] {
  const out: SectorStock[] = [];
  for (const d of STOCK_VOCAB) {
    if (SECTOR_OF[d.canonical] !== sector) continue;
    if (opts.requireNaverCode && !d.naverCode) continue;
    out.push({
      canonical: d.canonical,
      market: d.market,
      country: d.country,
      ...(d.naverCode ? { naverCode: d.naverCode } : {}),
      marquee: d.marquee === true,
      sector,
    });
  }
  return sortStocksForFeed(out);
}

export interface SortStocksOptions {
  /**
   * ★ 개인화 정렬 seam(다음 트랙 PERSONALIZATION_MATCHING) — 종목별 점수(높을수록 위).
   * 지금은 미주입 → 콜드스타트 기본 정렬(대표 대장주 우선). 다음 트랙이 취향 점수를 여기 끼운다.
   */
  rank?: (stock: SectorStock) => number;
}

/**
 * 피드 노출 순서 — 콜드스타트 기본은 "대표 대장주 먼저"(VISION 콜드스타트: 인기/대표 종목 순).
 * rank 가 주어지면 그 점수 내림차순(개인화가 들어오는 자리). 결정적(동점은 이름) — 캐시·새로고침 안정.
 */
export function sortStocksForFeed(
  stocks: readonly SectorStock[],
  opts: SortStocksOptions = {}
): SectorStock[] {
  const arr = [...stocks];
  if (opts.rank) {
    const r = opts.rank;
    arr.sort((a, b) => r(b) - r(a) || a.canonical.localeCompare(b.canonical));
  } else {
    // 콜드스타트: marquee(대표) 먼저 → 국내(baseline 보장) 먼저 → 이름순.
    arr.sort(
      (a, b) =>
        Number(b.marquee) - Number(a.marquee) ||
        Number(!!b.naverCode) - Number(!!a.naverCode) ||
        a.canonical.localeCompare(b.canonical)
    );
  }
  return arr;
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
