/**
 * LAB-09 PART C — 주식 유니버스. **격리분에서 꺼내온 것**이다.
 *
 * 원본은 `packages/dormant/fomo-core/src/keyword-cards/stocks.ts` 의 `STOCK_VOCAB` 이다.
 * 거기서는 **종목 인식 어휘**(원문에 이 이름이 나오면 그 종목이다)였고, 여기서는
 * **매매 유니버스**다 — 쓰임이 달라서 필요한 칸만 옮겼다.
 *
 * 격리분을 통째로 되살리지 않는다. `STOCK_VOCAB` 을 import 하면 `@fomo/core` 배럴이
 * 딸려오고 그러면 카드·덱·마스코트까지 같이 돌아온다 — LAB-01 이 격리한 이유가 그것이다.
 * **데이터만 꺼내온다.**
 *
 * ## 야후 심볼 규칙
 *
 * | 시장 | 접미 | 예 |
 * |---|---|---|
 * | KOSPI | `.KS` | `005930.KS` |
 * | KOSDAQ | `.KQ` | `247540.KQ` |
 * | 미국 | 없음 | `NVDA` |
 *
 * `naverCode` 는 수급(외국인·기관 일별) 수집에 쓴다 — 국내 상장만 있다.
 */

export interface StockDef {
  /** 표준 종목명. 화면에 그대로 나간다. */
  canonical: string;
  /** 야후 심볼. `Candle.symbol` 에 이 값이 그대로 들어간다. */
  yahoo: string;
  /** 네이버 6자리 코드. 국내 상장만. 없으면 수급을 못 받는다. */
  naverCode: string | null;
  market: "KOSPI" | "KOSDAQ" | "NASDAQ" | "NYSE";
  country: "KR" | "US";
}

/**
 * ⚠️ **시장은 실측으로 고친다.** 격리분의 `market` 은 사전을 만들 때의 값이라 이후 이전을
 * 반영하지 못한다. 첫 수집에서 야후 404 로 셋이 걸렸다:
 *
 * | 종목 | 사전 | 실제 |
 * |---|---|---|
 * | 엘앤에프 | KOSDAQ | **KOSPI 로 이전**(2024) |
 * | 더존비즈온 | KOSPI | **KOSDAQ** |
 * | TSMC | 티커 `TSMC` | **`TSM`** |
 *
 * 시장이 틀리면 벤치마크도 틀린다 — 코스닥 종목을 코스피와 비교하게 된다.
 */
export const STOCK_UNIVERSE: readonly StockDef[] = [
  { canonical: "동진쎄미켐", yahoo: "005290.KQ", naverCode: "005290", market: "KOSDAQ", country: "KR" },
  { canonical: "보성파워텍", yahoo: "006910.KQ", naverCode: "006910", market: "KOSDAQ", country: "KR" },
  { canonical: "퍼스텍", yahoo: "010820.KQ", naverCode: "010820", market: "KOSDAQ", country: "KR" },
  { canonical: "HLB", yahoo: "028300.KQ", naverCode: "028300", market: "KOSDAQ", country: "KR" },
  { canonical: "한글과컴퓨터", yahoo: "030520.KQ", naverCode: "030520", market: "KOSDAQ", country: "KR" },
  { canonical: "네패스", yahoo: "033640.KQ", naverCode: "033640", market: "KOSDAQ", country: "KR" },
  { canonical: "주성엔지니어링", yahoo: "036930.KQ", naverCode: "036930", market: "KOSDAQ", country: "KR" },
  { canonical: "이오테크닉스", yahoo: "039030.KQ", naverCode: "039030", market: "KOSDAQ", country: "KR" },
  { canonical: "우리기술투자", yahoo: "041190.KQ", naverCode: "041190", market: "KOSDAQ", country: "KR" },
  { canonical: "한미반도체", yahoo: "042700.KQ", naverCode: "042700", market: "KOSDAQ", country: "KR" },
  { canonical: "리노공업", yahoo: "058470.KQ", naverCode: "058470", market: "KOSDAQ", country: "KR" },
  { canonical: "다날", yahoo: "064260.KQ", naverCode: "064260", market: "KOSDAQ", country: "KR" },
  { canonical: "빅텍", yahoo: "065450.KQ", naverCode: "065450", market: "KOSDAQ", country: "KR" },
  { canonical: "엘앤에프", yahoo: "066970.KS", naverCode: "066970", market: "KOSPI", country: "KR" },
  { canonical: "하나마이크론", yahoo: "067310.KQ", naverCode: "067310", market: "KOSDAQ", country: "KR" },
  { canonical: "대주전자재료", yahoo: "078600.KQ", naverCode: "078600", market: "KOSDAQ", country: "KR" },
  { canonical: "비에이치아이", yahoo: "083650.KQ", naverCode: "083650", market: "KOSDAQ", country: "KR" },
  { canonical: "에코프로", yahoo: "086520.KQ", naverCode: "086520", market: "KOSDAQ", country: "KR" },
  { canonical: "펩트론", yahoo: "087010.KQ", naverCode: "087010", market: "KOSDAQ", country: "KR" },
  { canonical: "갤럭시아머니트리", yahoo: "094480.KQ", naverCode: "094480", market: "KOSDAQ", country: "KR" },
  { canonical: "일진파워", yahoo: "094820.KQ", naverCode: "094820", market: "KOSDAQ", country: "KR" },
  { canonical: "셀바스AI", yahoo: "108860.KQ", naverCode: "108860", market: "KOSDAQ", country: "KR" },
  { canonical: "나노신소재", yahoo: "121600.KQ", naverCode: "121600", market: "KOSDAQ", country: "KR" },
  { canonical: "리가켐바이오", yahoo: "141080.KQ", naverCode: "141080", market: "KOSDAQ", country: "KR" },
  { canonical: "알테오젠", yahoo: "196170.KQ", naverCode: "196170", market: "KOSDAQ", country: "KR" },
  { canonical: "제너셈", yahoo: "217190.KQ", naverCode: "217190", market: "KOSDAQ", country: "KR" },
  { canonical: "원익IPS", yahoo: "240810.KQ", naverCode: "240810", market: "KOSDAQ", country: "KR" },
  { canonical: "에코프로비엠", yahoo: "247540.KQ", naverCode: "247540", market: "KOSDAQ", country: "KR" },
  { canonical: "레인보우로보틱스", yahoo: "277810.KQ", naverCode: "277810", market: "KOSDAQ", country: "KR" },
  { canonical: "천보", yahoo: "278280.KQ", naverCode: "278280", market: "KOSDAQ", country: "KR" },
  { canonical: "에이비엘바이오", yahoo: "298380.KQ", naverCode: "298380", market: "KOSDAQ", country: "KR" },
  { canonical: "솔트룩스", yahoo: "304100.KQ", naverCode: "304100", market: "KOSDAQ", country: "KR" },
  { canonical: "루닛", yahoo: "328130.KQ", naverCode: "328130", market: "KOSDAQ", country: "KR" },
  { canonical: "더블유씨피", yahoo: "393890.KQ", naverCode: "393890", market: "KOSDAQ", country: "KR" },
  { canonical: "코난테크놀로지", yahoo: "402030.KQ", naverCode: "402030", market: "KOSDAQ", country: "KR" },
  { canonical: "HPSP", yahoo: "403870.KQ", naverCode: "403870", market: "KOSDAQ", country: "KR" },
  { canonical: "저스템", yahoo: "417840.KQ", naverCode: "417840", market: "KOSDAQ", country: "KR" },
  { canonical: "유한양행", yahoo: "000100.KS", naverCode: "000100", market: "KOSPI", country: "KR" },
  { canonical: "기아", yahoo: "000270.KS", naverCode: "000270", market: "KOSPI", country: "KR" },
  { canonical: "SK하이닉스", yahoo: "000660.KS", naverCode: "000660", market: "KOSPI", country: "KR" },
  { canonical: "DB하이텍", yahoo: "000990.KS", naverCode: "000990", market: "KOSPI", country: "KR" },
  { canonical: "금양", yahoo: "001570.KS", naverCode: "001570", market: "KOSPI", country: "KR" },
  { canonical: "한화투자증권", yahoo: "003530.KS", naverCode: "003530", market: "KOSPI", country: "KR" },
  { canonical: "포스코퓨처엠", yahoo: "003670.KS", naverCode: "003670", market: "KOSPI", country: "KR" },
  { canonical: "코스모신소재", yahoo: "005070.KS", naverCode: "005070", market: "KOSPI", country: "KR" },
  { canonical: "현대차", yahoo: "005380.KS", naverCode: "005380", market: "KOSPI", country: "KR" },
  { canonical: "POSCO홀딩스", yahoo: "005490.KS", naverCode: "005490", market: "KOSPI", country: "KR" },
  { canonical: "휴니드", yahoo: "005870.KS", naverCode: "005870", market: "KOSPI", country: "KR" },
  { canonical: "삼성전자", yahoo: "005930.KS", naverCode: "005930", market: "KOSPI", country: "KR" },
  { canonical: "삼성SDI", yahoo: "006400.KS", naverCode: "006400", market: "KOSPI", country: "KR" },
  { canonical: "삼성전기", yahoo: "009150.KS", naverCode: "009150", market: "KOSPI", country: "KR" },
  { canonical: "삼성중공업", yahoo: "010140.KS", naverCode: "010140", market: "KOSPI", country: "KR" },
  { canonical: "현대모비스", yahoo: "012330.KS", naverCode: "012330", market: "KOSPI", country: "KR" },
  { canonical: "한화에어로스페이스", yahoo: "012450.KS", naverCode: "012450", market: "KOSPI", country: "KR" },
  { canonical: "더존비즈온", yahoo: "012510.KQ", naverCode: "012510", market: "KOSDAQ", country: "KR" },
  { canonical: "한국전력", yahoo: "015760.KS", naverCode: "015760", market: "KOSPI", country: "KR" },
  { canonical: "두산에너빌리티", yahoo: "034020.KS", naverCode: "034020", market: "KOSPI", country: "KR" },
  { canonical: "NAVER", yahoo: "035420.KS", naverCode: "035420", market: "KOSPI", country: "KR" },
  { canonical: "카카오", yahoo: "035720.KS", naverCode: "035720", market: "KOSPI", country: "KR" },
  { canonical: "엔씨소프트", yahoo: "036570.KS", naverCode: "036570", market: "KOSPI", country: "KR" },
  { canonical: "한화오션", yahoo: "042660.KS", naverCode: "042660", market: "KOSPI", country: "KR" },
  { canonical: "한국항공우주", yahoo: "047810.KS", naverCode: "047810", market: "KOSPI", country: "KR" },
  { canonical: "한전KPS", yahoo: "051600.KS", naverCode: "051600", market: "KOSPI", country: "KR" },
  { canonical: "한전기술", yahoo: "052690.KS", naverCode: "052690", market: "KOSPI", country: "KR" },
  { canonical: "현대로템", yahoo: "064350.KS", naverCode: "064350", market: "KOSPI", country: "KR" },
  { canonical: "셀트리온", yahoo: "068270.KS", naverCode: "068270", market: "KOSPI", country: "KR" },
  { canonical: "대웅제약", yahoo: "069620.KS", naverCode: "069620", market: "KOSPI", country: "KR" },
  { canonical: "STX엔진", yahoo: "077970.KS", naverCode: "077970", market: "KOSPI", country: "KR" },
  { canonical: "LIG넥스원", yahoo: "079550.KS", naverCode: "079550", market: "KOSPI", country: "KR" },
  { canonical: "풍산", yahoo: "103140.KS", naverCode: "103140", market: "KOSPI", country: "KR" },
  { canonical: "우진", yahoo: "105840.KS", naverCode: "105840", market: "KOSPI", country: "KR" },
  { canonical: "한미약품", yahoo: "128940.KS", naverCode: "128940", market: "KOSPI", country: "KR" },
  { canonical: "종근당", yahoo: "185750.KS", naverCode: "185750", market: "KOSPI", country: "KR" },
  { canonical: "삼성바이오로직스", yahoo: "207940.KS", naverCode: "207940", market: "KOSPI", country: "KR" },
  { canonical: "크래프톤", yahoo: "259960.KS", naverCode: "259960", market: "KOSPI", country: "KR" },
  { canonical: "한화시스템", yahoo: "272210.KS", naverCode: "272210", market: "KOSPI", country: "KR" },
  { canonical: "SK바이오팜", yahoo: "326030.KS", naverCode: "326030", market: "KOSPI", country: "KR" },
  { canonical: "HD현대중공업", yahoo: "329180.KS", naverCode: "329180", market: "KOSPI", country: "KR" },
  { canonical: "LG에너지솔루션", yahoo: "373220.KS", naverCode: "373220", market: "KOSPI", country: "KR" },
  { canonical: "두산로보틱스", yahoo: "454910.KS", naverCode: "454910", market: "KOSPI", country: "KR" },
  { canonical: "애플", yahoo: "AAPL", naverCode: null, market: "NASDAQ", country: "US" },
  { canonical: "AMD", yahoo: "AMD", naverCode: null, market: "NASDAQ", country: "US" },
  { canonical: "브로드컴", yahoo: "AVGO", naverCode: null, market: "NASDAQ", country: "US" },
  { canonical: "마이크로소프트", yahoo: "MSFT", naverCode: null, market: "NASDAQ", country: "US" },
  { canonical: "마이크론", yahoo: "MU", naverCode: null, market: "NASDAQ", country: "US" },
  { canonical: "엔비디아", yahoo: "NVDA", naverCode: null, market: "NASDAQ", country: "US" },
  { canonical: "팔란티어", yahoo: "PLTR", naverCode: null, market: "NASDAQ", country: "US" },
  { canonical: "테슬라", yahoo: "TSLA", naverCode: null, market: "NASDAQ", country: "US" },
  { canonical: "TSMC", yahoo: "TSM", naverCode: null, market: "NYSE", country: "US" },
];

/**
 * 벤치마크 (PART C-2). **시장마다 따로다** — 코스피 종목을 S&P 와 비교하면 비교가 아니다.
 *
 * 지수는 배당이 빠진 가격지수다. 전략 쪽도 배당을 안 넣으므로 같은 기준이다.
 */
export const STOCK_BENCHMARKS = [
  { symbol: "KOSPI", yahoo: "^KS11", label: "KOSPI 보유", markets: ["KOSPI"] },
  { symbol: "KOSDAQ", yahoo: "^KQ11", label: "KOSDAQ 보유", markets: ["KOSDAQ"] },
  { symbol: "SP500", yahoo: "^GSPC", label: "S&P 500 보유", markets: ["NASDAQ", "NYSE"] },
] as const;

/** 국내 종목만 — 수급 수집 대상. */
export function krUniverse(): StockDef[] {
  return STOCK_UNIVERSE.filter((d) => d.naverCode !== null);
}
