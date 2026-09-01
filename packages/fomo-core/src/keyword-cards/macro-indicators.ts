/**
 * MACRO-01 §A — **우리가 매일 보는 거시 지표.**
 *
 * ## 왜 하나로는 안 되나
 *
 * 종전에는 5종을 정의해 두고 사실상 유가 하나만 카드가 됐다. 거시 지표는 매일 여러 개가
 * 움직이는데 하나만 나온 건 **하나만 만들었기 때문**이었다. 그리고 우리 종목은 대부분
 * 국내인데 정작 국내 지표(코스피·코스닥·국고채·회사채)가 하나도 없었다.
 *
 * ## 분류가 왜 필요한가
 *
 * 하루 카드 수를 제한할 때 **같은 분류에서 2장을 넘지 않게** 하려면 분류가 있어야 한다.
 * 국고채·회사채·미 국채가 같은 날 다 움직이는 건 흔한 일이고, 그날 덱이 금리 카드 세 장이
 * 되면 그건 거시 카드가 아니라 금리 브리핑이다.
 *
 * ## 파생 지표는 계산한다
 *
 * `creditspread`(회사채 3년 − 국고채 3년)와 `yieldcurve`(미 국채 10년 − 2년)는 받아오는
 * 게 아니라 **두 시리즈에서 만든다.** 스프레드는 그 자체가 신용 경계심의 값이고, 장단기
 * 역전은 어느 한쪽 금리보다 훨씬 큰 사건이다.
 */

/** 우리가 다루는 거시 지표. */
export type MacroIndicatorId =
  // 환율
  | "usdkrw"
  | "jpykrw"
  // 금리
  | "ktb3y"
  | "ust10y"
  | "ust2y"
  | "yieldcurve"
  // 신용
  | "corp3y"
  | "creditspread"
  // 지수
  | "kospi"
  | "kosdaq"
  | "sp500"
  | "nasdaq"
  | "vix"
  // 원자재
  | "oil"
  | "gold";

/** 하루 카드 상한을 분류별로 걸기 위한 묶음(§C-2). */
export type MacroCategory = "fx" | "rate" | "credit" | "index" | "commodity";

/** 값 표기 단위. */
export type MacroUnit = "krw" | "usd" | "percent" | "point" | "pp";

export interface MacroIndicator {
  id: MacroIndicatorId;
  /** 화면 이름 — `원달러 환율`. */
  name: string;
  category: MacroCategory;
  unit: MacroUnit;
  /**
   * 연속 흐름 카드가 되려면 넘어야 하는 **누적 변동률**(%). 지표별 과거 분포에서 잡았다 —
   * `docs/MACRO_THRESHOLDS.md` 가 근거다. 감으로 정하지 않는다.
   */
  movePct: number;
  /** 하루 만에 이만큼 움직이면 그 자체로 사건이다(§D-3 `급변`). 분포에서 잡은 값. */
  spikePct: number;
  /**
   * 심리적 기준선(§C-1 `임계 돌파`). 이 값을 **넘거나 밑돌면** 변동폭과 무관하게 카드가 된다.
   * 없는 지표는 비워 둔다 — 억지로 만들지 않는다.
   */
  levels?: readonly number[];
  /**
   * 0을 기준으로 뒤집히는 지표인가(§C-1 `관계 역전`). 장단기 금리차만 해당한다.
   * 스프레드가 마이너스로 가는 것은 값이 조금 변한 것과 전혀 다른 사건이다.
   */
  invertible?: boolean;
}

/**
 * **임계값의 출처는 `docs/MACRO_THRESHOLDS.md` 다.** `scripts/macro-calibrate.ts` 가 최근
 * 730일 분포를 재서 뽑았고(2026-09-01 측정), 다시 돌리면 같은 값이 나온다.
 *
 * `movePct` = 연속 3일 이상인 날의 누적 변동률 **P50**, `spikePct` = 하루 변동률 **P97**.
 *
 * 두 백분위가 크게 다른 이유가 있다. **급변은 드물어야 급변이다** — 후보 수를 맞추느라
 * 같이 내렸더니 P79 가 나왔고, 그러면 닷새에 하루가 「급변」이 된다. `하루에 0.7% 올랐어요`
 * 를 급변이라 쓰는 건 거짓말에 가깝다. 그래서 급변은 P97 로 못 박고, 후보 수는 연속
 * 임계로만 맞췄다.
 *
 * 연속 임계가 P50(중앙값)까지 내려간 것은 **바닥을 친 결과**다. 목표(하루 2건)를 P50 에서도
 * 못 채웠다(1.79건). 병목은 임계가 아니라 `MACRO_MIN_STREAK = 3` 이다 — 3일 이상 같은
 * 방향인 날 자체가 지표당 20~27% 뿐이라, 임계를 0으로 놔도 후보는 그 이상 안 나온다.
 * 카드를 더 늘리려면 임계가 아니라 **지표를 더 늘려야** 한다. `docs/MACRO_THRESHOLDS.md` 참고.
 *
 * 손으로 적었던 첫 값이 얼마나 틀렸는지 남겨 둔다: 코스피를 3.4 로 적었는데 실측 분포는
 * 전혀 다른 자리에 있었다. 지표별로 다른 이유는 자명하다 — 환율이 3일에 2% 움직이는 것과
 * VIX 가 2% 움직이는 것은 전혀 다른 사건이다.
 */
export const MACRO_INDICATORS: readonly MacroIndicator[] = [
  // ── 환율 ──
  { id: "usdkrw", name: "원달러 환율", category: "fx", unit: "krw", movePct: 1.4, spikePct: 1.4, levels: [1300, 1350, 1400, 1450] },
  { id: "jpykrw", name: "원엔 환율", category: "fx", unit: "krw", movePct: 1.6, spikePct: 1.6 },
  // ── 금리 ──
  { id: "ktb3y", name: "국고채 3년 금리", category: "rate", unit: "percent", movePct: 3.4, spikePct: 3.2, levels: [3, 3.5, 4] },
  { id: "ust10y", name: "미 국채 10년 금리", category: "rate", unit: "percent", movePct: 3.1, spikePct: 2.5, levels: [4, 4.5, 5] },
  { id: "ust2y", name: "미 국채 2년 금리", category: "rate", unit: "percent", movePct: 3.5, spikePct: 3.1 },
  { id: "yieldcurve", name: "미 장단기 금리차", category: "rate", unit: "pp", movePct: 17.5, spikePct: 60, invertible: true },
  // ── 신용 ──
  { id: "corp3y", name: "회사채 3년 금리", category: "credit", unit: "percent", movePct: 2.3, spikePct: 2.5 },
  { id: "creditspread", name: "회사채 가산금리", category: "credit", unit: "pp", movePct: 4.9, spikePct: 4.1 },
  // ── 지수 ──
  { id: "kospi", name: "코스피", category: "index", unit: "point", movePct: 5.1, spikePct: 6.6 },
  { id: "kosdaq", name: "코스닥", category: "index", unit: "point", movePct: 4.6, spikePct: 6 },
  { id: "sp500", name: "S&P 500", category: "index", unit: "point", movePct: 2.3, spikePct: 2.2 },
  { id: "nasdaq", name: "나스닥", category: "index", unit: "point", movePct: 3.4, spikePct: 2.8 },
  { id: "vix", name: "변동성 지수", category: "index", unit: "point", movePct: 17.8, spikePct: 18.8, levels: [20, 30] },
  // ── 원자재 ──
  { id: "oil", name: "국제 유가", category: "commodity", unit: "usd", movePct: 6.2, spikePct: 7, levels: [70, 80, 90, 100] },
  { id: "gold", name: "금값", category: "commodity", unit: "krw", movePct: 3.1, spikePct: 3.1 },
];

const BY_ID = new Map(MACRO_INDICATORS.map((i) => [i.id, i]));

export function macroIndicator(id: MacroIndicatorId): MacroIndicator | undefined {
  return BY_ID.get(id);
}

/** 값 표기 — 지표 단위에 맞춘다. */
export function formatMacroValue(indicator: MacroIndicator, value: number): string {
  switch (indicator.unit) {
    case "krw":
      // 금값은 원/g 이라 자리가 크다. 환율과 같은 규칙으로 반올림해 쉼표를 넣는다.
      return `${Math.round(value).toLocaleString("en-US")}원`;
    case "usd":
      return `$${value.toFixed(1)}`;
    case "percent":
      return `${value.toFixed(2)}%`;
    case "pp":
      // 스프레드·금리차는 「퍼센트포인트」다. `%` 로 쓰면 금리 자체로 읽힌다.
      return `${value.toFixed(2)}%p`;
    default:
      return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}

/**
 * **미 기준금리(`FEDFUNDS`)를 왜 뺐나.**
 *
 * WO §A-1 이 목록에 넣었고 FRED 에 있기도 하다. 그런데 그건 **월간** 시리즈다 — 2년에
 * 23관측. 연속·급변을 잴 표본이 안 되고, 최신값이 언제나 한 달 이상 묵어 있어 신선도
 * 게이트(§B-3)에 무조건 걸린다.
 *
 * 넣어 두면 목록은 길어 보이지만 카드는 영영 안 나온다. **현재 데이터로 채울 수 없는 것은
 * 자리도 만들지 않는다**(DS-00 §1-1). 일별 기준금리를 주는 소스를 찾으면 그때 넣는다.
 */
