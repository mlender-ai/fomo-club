/**
 * WO-SUB-01 펀더멘털 팩트 시트 — 스키마.
 *
 * **해석 없는 사실 스냅샷이다.** 등급·판단·문장은 여기 없다(WO-SUB-02·05의 일).
 * 숫자와 출처와 시각뿐이다.
 *
 * 절대 규칙(WO-SUB-01 §4):
 *  1. 추정·보간·전분기 복사 금지 → 없으면 `null` + `missing_fields`
 *  2. 모든 수치에 `source` + `as_of`
 *  3. 통화 환산 금지 — 원통화로 저장
 *  4. look-ahead 금지 — `filed_at` 없는 분기 레코드는 만들지 않는다
 *  5. 배치 사전계산 — 요청 시점 계산 금지
 *  6. 동일 입력 → 동일 출력
 */

export type Currency = "KRW" | "USD";
export type Market = "KR" | "US";
export type CoverageFlag = "full" | "partial" | "none";
export type MarginTrend = "expanding" | "flat" | "contracting" | "unknown";
export type BandMetric = "per" | "pbr" | "psr";

/**
 * `filed_at` 의 출처 3값.
 *  · `disclosed` — 소스가 실제 공시일을 줬다(SEC `filed`, DART `rcept_dt`).
 *  · `statutory_deadline` — 소스에 공시일이 없어 **법정 제출기한**을 썼다. 기한은 실제
 *    공시일보다 늦거나 같으므로 look-ahead 를 만들지 않는다(보수적 상한). 대신 밴드의
 *    유효 관측이 줄어든다.
 *  · `none` — 공시일 근거가 전혀 없다. 레코드 단위에서는 도달하지 않는다(그런 분기는
 *    레코드를 만들지 않는다). 팩트시트 롤업에서 "분기 레코드가 0개" 를 뜻한다.
 */
export type FiledAtSource = "disclosed" | "statutory_deadline" | "none";

/** 분기 레코드. `filed_at` 이 없으면 이 레코드를 만들지 않는다(look-ahead 방지). */
export interface QuarterRecord {
  /** "2026Q1" — 회계연도 기준이 아니라 기간말 기준 라벨. */
  period: string;
  /** 기간말일 "2026-03-31". */
  period_end: string;
  /** 공시일. 없으면 레코드 자체를 만들지 않는다. */
  filed_at: string;
  /**
   * `filed_at` 의 출처. 값이 없으면 `disclosed` 로 본다.
   *
   * **밴드 백분위의 유효성이 여기에 걸려 있다.** `statutory_deadline` 위에서 계산된
   * 밴드는 시점 d 의 TTM 구성이 실제와 다를 수 있으므로, 나중에 실측으로 승격하면
   * 밴드를 다시 계산해야 한다. 어느 쪽으로 계산한 값인지 구분되지 않으면
   * WO-SUB-07 채점이 오염된다 — 그래서 레코드에 남긴다.
   */
  filed_at_source?: FiledAtSource;
  revenue: number | null;
  operating_income: number | null;
  net_income: number | null;
  eps_diluted: number | null;
  /** 이 레코드를 만든 소스. "sec_xbrl" | "dart" | "naver_finance_quarter" */
  source: string;
  /**
   * 어떤 원본 개념/행에서 왔는지(감사용). US=XBRL concept, KR=재무제표 계정명.
   * 은행처럼 `Revenues` 가 없는 종목에서 무엇을 매출로 봤는지 추적하려면 이게 필수다.
   */
  concepts?: Partial<Record<"revenue" | "operating_income" | "net_income" | "eps_diluted", string>>;
}

/** 5년 밴드 통계. `sufficient: false` 면 `current_percentile` 은 반드시 `null`. */
export interface BandStat {
  p20: number | null;
  p50: number | null;
  p80: number | null;
  current: number | null;
  /** 0~100. `sufficient: false` 면 `null`. */
  current_percentile: number | null;
  /** 유효 관측 일수(비율이 계산된 거래일 수). */
  observations: number;
  /** 윈도우 내 거래일 수(분모). */
  window_trading_days: number;
  window_start: string;
  window_end: string;
  sufficient: boolean;
  /** 불충분·미계산 사유. `sufficient: true` 면 `null`. */
  insufficient_reason: string | null;
  /**
   * 비율을 어떻게 구성했는지. 수정주가 × 기준주식수 ÷ TTM 총액 방식이므로
   * 기준주식수를 명시해야 값이 재현·감사 가능하다(WO §12 "분할 미조정 가격으로 밴드 계산" 방지).
   */
  basis: string;
  shares_ref: number | null;
  shares_ref_as_of: string | null;
}

export interface FactSheetFiscal {
  /**
   * 분기 레코드의 `filed_at_source` 롤업.
   *
   *  · 전부 `disclosed` → `disclosed`
   *  · 하나라도 추정이면 → `statutory_deadline` (**밴드가 추정 위에서 계산됐다는 뜻**)
   *  · 레코드 0개 → `none`
   *
   * 보수적으로 내려 잡는다 — 섞여 있을 때 `disclosed` 로 표시하면 추정 위에서 계산된
   * 밴드를 실측으로 착각하게 된다.
   */
  filed_at_source: FiledAtSource;
  /** 최근 8분기, period_end 오름차순. **표시용 상한이다.** */
  quarters: QuarterRecord[];
  /**
   * 밴드 계산에 실제로 들어간 분기 수.
   *
   * `quarters.length` 는 표시 상한(8)이라 밴드 입력량을 나타내지 않는다. 이 둘을 같은 값으로
   * 쓴 것이 "어떤 종목도 band_sufficient 에 도달할 수 없는" 결함의 원인이었으므로,
   * 구분해서 기록한다.
   */
  band_quarters: number;
  /** 최근 5회계연도, period_end 오름차순. */
  annual: QuarterRecord[];
  ttm: {
    revenue: number | null;
    operating_income: number | null;
    net_income: number | null;
    eps_diluted: number | null;
    /** 어떤 분기들로 TTM 을 구성했는지. 4개 미달이면 값은 전부 null 이고 이 목록도 비지 않는다. */
    composed_of: string[];
  };
  coverage_flag: CoverageFlag;
  /** 결산월 변경·회계연도 변경 감지 결과. 감지되면 TTM 은 null 이고 coverage_flag 는 partial. */
  fiscal_anomaly: string | null;
}

export interface FactSheetGrowth {
  /** 최근 분기 전년동기 대비. */
  revenue_yoy: number | null;
  revenue_cagr_3y: number | null;
  operating_income_yoy: number | null;
}

export interface FactSheetMargin {
  operating_ttm: number | null;
  net_ttm: number | null;
  /** 최근 8분기 영업이익률 표본표준편차. 8분기 미만이면 null(WO-SUB-02 시클리컬 판정 불가). */
  operating_stdev_8q: number | null;
  /**
   * 최근 연간 영업이익률의 표본표준편차 + 관측 연수.
   *
   * 왜 필요한가: 네이버 재무 표는 분기를 5개만 주므로 **KR 은 `operating_stdev_8q` 가 항상 `null`** 이다
   * (WO-SUB-01 실측 0/40). 그러면 WO-SUB-02 의 시클리컬 판정이 국내에서 아예 발동하지 못한다.
   * 연간 관측은 KR 에서도 3개가 확보되므로, 분기 통계가 없을 때의 **대체 입력**으로 둔다.
   * 관측 수가 적어 임계값이 다르다 — WO-SUB-02 가 두 통계에 각각 임계값을 정한다.
   */
  operating_stdev_annual: number | null;
  operating_stdev_annual_years: number;
  trend_8q: MarginTrend;
}

export interface FactSheetValuation {
  per_ttm: number | null;
  pbr: number | null;
  psr_ttm: number | null;
  ev_ebitda: number | null;
  dividend_yield: number | null;
  /** 컨센서스 있을 때만. */
  per_forward: number | null;
  band_5y: {
    /** 무엇을 밴드로 쓸지는 WO-SUB-02 가 결정한다. 여기서는 가능한 것 전부 계산. */
    metric: BandMetric | null;
    per: BandStat | null;
    pbr: BandStat | null;
    psr: BandStat | null;
  };
}

/**
 * 시점값 시계열 한 점. `QuarterRecord` 와 달리 계정 하나만 담는다.
 *
 * **왜 스칼라가 아니라 시계열이 필요한가**: WO-SUB-04 의 막대축이 자기자본·현금잔고를
 * 요구한다. 파이프라인은 이 둘을 이미 분기별로 수집하고 있었는데(`equity`·`cash`
 * `PointObservation[]`) `assemble` 이 최신값만 스칼라로 남기고 나머지를 버렸다 —
 * 그래서 `ASSET_DEEP_VALUE`·`BIOTECH_PIPELINE` 차트가 데이터 없음으로 숨겨져 있었다.
 * 새로 수집하는 것이 아니라 **버리던 것을 남기는** 것이다.
 */
export interface BalancePoint {
  /** "2026Q1" — 기간말 기준 라벨. */
  period: string;
  period_end: string;
  /** look-ahead 판정용 공시일. */
  filed_at: string;
  value: number;
  /** 이 점을 만든 소스. 없으면 회계 소스로 대체된다(SEC 경로는 점 단위 출처가 없다). */
  source: string;
}

export interface FactSheetBalance {
  total_equity: number | null;
  debt_to_equity: number | null;
  net_cash: number | null;
  cash_and_equivalents: number | null;
  /** 최근 4분기 영업현금흐름 합이 음수일 때만 계산. 양수면 null("무한"이라 쓰지 않는다). */
  cash_runway_quarters: number | null;
  interest_coverage: number | null;
  /**
   * 분기별 자기자본, period_end 오름차순. 최근 20분기(5년) 상한.
   * WO-SUB-04 `ASSET_DEEP_VALUE`·`BANK_FINANCIAL` 막대축 입력.
   */
  equity_quarters: BalancePoint[];
  /**
   * 분기별 현금및현금성자산, period_end 오름차순. 최근 20분기 상한.
   * WO-SUB-04 `BIOTECH_PIPELINE` 막대축 + 런웨이 표기 입력.
   */
  cash_quarters: BalancePoint[];
}

/**
 * 현금흐름 (WO-SUB-03.5 → 02R 선행). **02R 자격 판정의 입력이다.**
 *
 * 왜 별도 절인가: `balance.cash_runway_quarters` 는 영업현금흐름을 **소비만** 하고 값을 남기지
 * 않아서, "런웨이가 null 인 이유가 흑자여서인지 현금흐름을 못 받아서인지" 구분되지 않았다.
 * 02R 의 세 유형(`HYPERGROWTH_UNPROFITABLE`·`BIOTECH_PIPELINE`·`MATURE_INCOME`)이 지목하는
 * 관측 지점이 정확히 이 값들이라, 확보 여부가 유형 자격 조건이 된다(규칙 3).
 *
 * 부호 관행: DART·SEC 모두 유출을 음수로 주는 종목과 양수로 주는 종목이 섞인다. 그래서
 * CapEx·배당은 **절대값으로 크기만** 쓴다 — 이 둘이 순유입인 경우는 없다. 영업현금흐름은
 * 부호가 의미를 가지므로(적자 소진 판정) 원부호를 유지한다.
 */
export interface FactSheetCashflow {
  /** TTM 영업활동현금흐름. 원부호 유지. 4분기 미달이면 null. */
  operating_ttm: number | null;
  /** TTM 유형자산 취득액(크기). 무형자산 취득은 포함하지 않는다. */
  capex_ttm: number | null;
  /** FCF = 영업현금흐름 − CapEx. 둘 중 하나라도 없으면 null(0으로 대체하지 않는다). */
  free_cash_flow_ttm: number | null;
  /** TTM 배당금지급액(크기). */
  dividend_paid_ttm: number | null;
  /**
   * 배당 유지 가능성 = 배당금지급 / 영업활동현금흐름. `MATURE_INCOME` 의 관측 지점.
   * 영업현금흐름이 0 이하면 `null` — 적자 기업의 배당 비율은 의미를 갖지 않는다.
   */
  dividend_coverage: number | null;
  /**
   * 분기당 현금 소진액(양수). 최근 4분기 영업현금흐름 합이 **음수일 때만** 값이 있다.
   * `HYPERGROWTH_UNPROFITABLE`·`BIOTECH_PIPELINE` 의 관측 지점.
   */
  burn_per_quarter: number | null;
  /** TTM 을 구성한 분기 라벨. 4개 미달이면 위 TTM 값들이 전부 null 인 이유가 여기 보인다. */
  composed_of: string[];
  /** 영업현금흐름이 관측된 분기 수. */
  observed_quarters: number;
  coverage_flag: CoverageFlag;
}

export interface FactSheetMarketData {
  market_cap: number | null;
  shares_outstanding: number | null;
  price: number | null;
  price_as_of: string | null;
}

export interface FactSheetConsensus {
  available: boolean;
  revenue_fy1: number | null;
  revenue_fy2: number | null;
  revenue_fy3: number | null;
  eps_fy1: number | null;
  eps_fy2: number | null;
  source: string | null;
  as_of: string | null;
  analyst_count: number | null;
  /**
   * 예상 구간의 기간 라벨(있는 것만). PHASE 4 가 "실적 vs 예상" 막대를 그릴 때
   * 어느 기간이 예상인지 알아야 연한 색 구간을 정할 수 있다.
   */
  periods: string[];
}

export interface FactSheetClassification {
  sector: string | null;
  industry: string | null;
  /** "GICS" | "nasdaq_industry" | "naver_industry_code" */
  scheme: string | null;
  source: string | null;
}

export interface SourceManifestEntry {
  source: string;
  fetched_at: string;
  /** 이 소스에서 무엇을 가져왔는지 + 알려진 제약(예: 수정주가 여부). */
  note?: string;
}

export interface FactSheet {
  symbol: string;
  market: Market;
  currency: Currency;
  /** 이 레코드를 만든 시각. */
  snapshot_at: string;
  /** 화면 표기용 회사명(원장·성적표와 동일 규칙). */
  display_name: string;
  /** 원장 조인 키(원문 유지). */
  canonical: string;

  fiscal: FactSheetFiscal;
  growth: FactSheetGrowth;
  margin: FactSheetMargin;
  valuation: FactSheetValuation;
  balance: FactSheetBalance;
  cashflow: FactSheetCashflow;
  market_data: FactSheetMarketData;
  consensus: FactSheetConsensus;
  classification: FactSheetClassification;

  /** 결측 필드의 전체 경로 목록. 필수. */
  missing_fields: string[];
  /**
   * 스칼라 필드별 출처·기준시각(§4 규칙 2 "모든 수치는 source·as_of 동반").
   * 키는 `missing_fields` 와 같은 필드 경로다 — 값이 있으면 여기에, 없으면 저기에 등재된다.
   * 모든 필드를 `SourcedValue<T>` 로 감싸는 대신 경로 맵으로 둔 이유: 소비자(WO-SUB-04·05)가
   * 숫자를 그대로 쓰면서도 출처 누락을 타입/테스트로 잡을 수 있다.
   */
  field_sources: Record<string, { source: string; as_of: string | null }>;
  source_manifest: Record<string, SourceManifestEntry>;
  /** 소스별 실패 사유(정직성) — "없음"과 "재보지 못함"을 구분한다. */
  source_errors: string[];
}

/** 저장 레코드 — 팩트시트 + 해시. */
export interface FactSheetRecord {
  factsheet: FactSheet;
  /** 정규화 JSON 의 안정적 해시(snapshot_at·fetched_at 제외). */
  factsheet_hash: string;
}
