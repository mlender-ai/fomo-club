/**
 * 의존 변수 카탈로그 (WO-SUB-03 §4-6).
 *
 * 슬롯 3 은 **자유 서술 금지**다. 슬롯 2 가 지목한 의존 대상을 이 카탈로그에 매핑하고,
 * 매핑에 실패하면 슬롯 3 을 렌더링하지 않는다. 카탈로그에 없는 변수를 즉석에서 만들면
 * "무엇에 걸려 있나"가 근거 없는 서술로 바뀐다.
 *
 * 각 변수는 **우리가 실제로 값을 가져올 수 있는 것만** 등재한다.
 * `source` 가 `null` 인 변수는 소스 미확보 — 매핑돼도 슬롯 3 이 비고, 그 사실을 대시보드에 노출한다.
 */

export type DependencyVariableCode =
  | "interest_rate_short"
  | "interest_rate_10y"
  | "yield_curve_spread"
  | "oil_price"
  | "usd_krw"
  | "usd_index"
  | "memory_dram_price"
  | "shipping_rate_container"
  | "steel_price"
  | "copper_price"
  | "gold_price"
  | "ai_capex_proxy"
  | "credit_spread"
  | "kospi_index"
  | "sp500_index";

export interface DependencyVariable {
  code: DependencyVariableCode;
  label_ko: string;
  /** 슬롯 2 문장에서 이 변수로 매핑할 키워드. 한국어 표기 기준. */
  keywords: readonly string[];
  /** 값 소스. `null` = 미확보(슬롯 3 렌더 불가, 정직하게 비운다). */
  source: string | null;
  /** 값 표기 단위 힌트. */
  unit: string;
}

export const DEPENDENCY_VARIABLES: readonly DependencyVariable[] = [
  {
    code: "interest_rate_short",
    label_ko: "단기 정책금리",
    keywords: ["단기금리", "조달금리", "정책금리", "기준금리", "예금금리", "단기 조달"],
    source: "FRED:DFF",
    unit: "%",
  },
  {
    code: "interest_rate_10y",
    label_ko: "미국 10년물 금리",
    keywords: ["장기금리", "10년물", "국채금리"],
    source: "FRED:DGS10",
    unit: "%",
  },
  {
    code: "yield_curve_spread",
    label_ko: "장단기 금리차(10년−2년)",
    keywords: ["장단기 금리차", "금리 역전", "예대마진", "순이자마진", "NIM"],
    source: "FRED:T10Y2Y",
    unit: "%p",
  },
  { code: "oil_price", label_ko: "국제유가(WTI)", keywords: ["유가", "원유", "정제마진", "석유"], source: "FRED:DCOILWTICO", unit: "USD/배럴" },
  { code: "usd_krw", label_ko: "원/달러 환율", keywords: ["환율", "원달러", "달러 강세", "원화"], source: "FRED:DEXKOUS", unit: "원" },
  { code: "usd_index", label_ko: "달러지수", keywords: ["달러지수", "달러 인덱스"], source: "FRED:DTWEXBGS", unit: "지수" },
  // 아래는 슬롯 2 가 자주 지목하지만 **무료 소스를 확보하지 못한** 변수다.
  // 매핑은 되지만 값이 없어 슬롯 3 이 비고, 그 사실이 대시보드에 남는다.
  { code: "memory_dram_price", label_ko: "DRAM 현물가", keywords: ["메모리 가격", "DRAM", "낸드", "반도체 가격"], source: null, unit: "USD" },
  { code: "shipping_rate_container", label_ko: "컨테이너 운임", keywords: ["운임", "컨테이너", "SCFI", "해상운임"], source: null, unit: "지수" },
  { code: "steel_price", label_ko: "철강 가격", keywords: ["철강 가격", "열연", "철광석"], source: null, unit: "USD/톤" },
  { code: "copper_price", label_ko: "구리 가격", keywords: ["구리", "동가격", "전기동"], source: null, unit: "USD/톤" },
  { code: "gold_price", label_ko: "금 가격", keywords: ["금값", "금 가격"], source: null, unit: "USD/온스" },
  {
    code: "ai_capex_proxy",
    label_ko: "빅테크 AI 투자 규모",
    keywords: ["AI capex", "AI 투자", "데이터센터 투자", "하이퍼스케일러"],
    source: null,
    unit: "USD",
  },
  { code: "credit_spread", label_ko: "신용 스프레드", keywords: ["신용 스프레드", "대손", "연체율", "부실채권"], source: "FRED:BAMLH0A0HYM2", unit: "%p" },
  { code: "kospi_index", label_ko: "코스피", keywords: ["코스피", "국내 증시"], source: null, unit: "지수" },
  { code: "sp500_index", label_ko: "S&P 500", keywords: ["S&P", "미국 증시"], source: null, unit: "지수" },
];

const BY_CODE = new Map(DEPENDENCY_VARIABLES.map((v) => [v.code, v]));

export function dependencyVariable(code: string): DependencyVariable | undefined {
  return BY_CODE.get(code as DependencyVariableCode);
}

/** 값 소스가 있는 변수만 — 슬롯 3 을 실제로 채울 수 있는 것. */
export function renderableVariables(): DependencyVariable[] {
  return DEPENDENCY_VARIABLES.filter((v) => v.source !== null);
}

/**
 * 슬롯 2 문장 → 변수 매핑. **결정론**이다(LLM 없음, 키워드 사전 매칭).
 * 여러 변수가 걸리면 문장에서 **더 앞에 나온** 키워드의 변수를 쓴다 — 문장의 주된 의존 대상이 앞에 온다.
 * 하나도 안 걸리면 `null`(슬롯 3 미표시).
 */
export function mapDependencyVariable(slot2Text: string): DependencyVariable | null {
  const text = slot2Text.replace(/\s+/g, " ");
  let best: { variable: DependencyVariable; at: number } | null = null;
  for (const variable of DEPENDENCY_VARIABLES) {
    for (const keyword of variable.keywords) {
      const at = text.indexOf(keyword);
      if (at < 0) continue;
      if (!best || at < best.at) best = { variable, at };
    }
  }
  return best?.variable ?? null;
}
