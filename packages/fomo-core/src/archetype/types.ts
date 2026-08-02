import type { BandMetric } from "../fundamentals/types";

export type ArchetypeCode =
  | "CYCLICAL_COMMODITY"
  | "HYPERGROWTH_UNPROFITABLE"
  | "QUALITY_COMPOUNDER"
  | "BANK_FINANCIAL"
  | "PHARMA_STABLE"
  | "BIOTECH_PIPELINE"
  | "MATURE_INCOME"
  | "TURNAROUND_LOSS"
  | "ASSET_DEEP_VALUE"
  | "UNCLASSIFIED";

/** `UNCLASSIFIED` 사유 — 완료 조건 6: 반드시 붙는다. */
export type UnclassifiedReason =
  | "no_fiscal"
  | "no_sector"
  | "unknown_scheme"
  | "no_rule_matched";

export interface MetricRef {
  path: string;
  label: string;
  why: string;
}

export interface ForbiddenRef {
  path: string;
  reason: string;
}

export interface UnavailableRef {
  label: string;
  reason: string;
}

/**
 * 막대에 쓸 시계열. **팩트시트에 실제로 있는 것과 없는 것을 구분해서 이름 짓는다** —
 * 없는 것을 이름만 붙여두고 그리면 규칙 2("없는 구간을 그리지 않는다") 위반이 된다.
 * 빌더가 해석하지 못하는 값은 차트를 숨기고 사유를 남긴다.
 */
export type ChartBarSeries =
  | "annual_revenue"
  | "quarterly_operating_income"
  | "annual_net_interest_income"
  | "annual_dps"
  | "quarterly_cash_balance"
  | "annual_equity";

/** 선(배수)에 쓸 지표 — `valuation` 절의 필드명과 같다. */
export type ChartLineMetric = "per_ttm" | "per_forward" | "pbr" | "psr_ttm" | "dividend_yield";

/**
 * 차트 축 매핑 (WO-SUB-04 §5-2).
 *
 * **독트린이 축의 정본이다.** 코드에 표를 하드코딩하면 02R 이 유형 목록을 바꿀 때 전면 수정이 된다.
 * 여기 있으면 유형 추가는 JSON 행 추가로 흡수된다.
 * `null` 이면 차트를 표시하지 않는다(`UNCLASSIFIED`).
 */
export interface ChartAxes {
  bar_series: ChartBarSeries;
  bar_label: string;
  /** `null` 이면 배수 선을 그리지 않는다(BIOTECH — 어떤 배수도 의미를 갖지 않는다). */
  line_metric: ChartLineMetric | null;
  line_label: string | null;
  /** 1순위 지표가 없을 때 내려갈 지표. 내려갔다는 사실은 캡션에 남긴다. */
  line_fallback_metric: ChartLineMetric | null;
  note: string | null;
}

export interface ArchetypeFrame {
  code: ArchetypeCode;
  label_ko: string;
  definition: string;
  boundary: string;
  display_metrics: MetricRef[];
  /** 렌더 금지 — INV-06 이 이 목록을 참조한다. */
  forbidden_metrics: ForbiddenRef[];
  /** 렌더하려면 경고문 부착이 필수 — INV-11 이 이 목록을 참조한다. */
  requires_warning_metrics: ForbiddenRef[];
  band_metric: BandMetric | null;
  band_note: string | null;
  /** WO-SUB-04 축 매핑. `null` 이면 차트 미표시. */
  chart_axes: ChartAxes | null;
  /** 카드용 축약 문안(WO-SUB-08 텍스트 예산). 없으면 경고 없음. */
  warning_short: string | null;
  /** 디테일용 전체 문안. */
  warning_full: string | null;
  risks: string[];
  examples: Array<{ name: string; note: string }>;
  /** WO 카탈로그가 요구하지만 현재 소스로 확보하지 못한 지표. */
  unavailable_metrics: UnavailableRef[];
}

export interface ArchetypeDoctrine {
  version: string;
  as_of: string;
  note: string;
  archetypes: ArchetypeFrame[];
  chart_axes_note?: string;
}

export interface ArchetypeResult {
  code: ArchetypeCode;
  /** 완료 조건 5 — 모든 분류 결과가 룰셋 버전을 동반한다. */
  ruleset_version: string;
  /** `UNCLASSIFIED` 일 때만 채워진다. */
  reason: UnclassifiedReason | null;
  /** 어느 규칙이 매치됐는지(감사용). */
  matched_rule: string;
  /**
   * 시클리컬 판정이 **통계로 확인된 것인지**. KR 은 분기·연간 관측이 부족해 업종 코드 단독 판정을
   * 허용하므로(독트린 §4-3 예외), 그 경우 `false` 다. WO-SUB-07 이 KR/US 오분류율을 분리 집계하는 근거.
   */
  stdev_confirmed: boolean;
  /** 판정에 쓰인 관측값(감사용). */
  inputs: {
    scheme: string | null;
    industry: string | null;
    coverage_flag: string;
    net_income_ttm: number | null;
    revenue_ttm: number | null;
    revenue_yoy: number | null;
    revenue_cagr_3y: number | null;
    operating_stdev_annual: number | null;
    operating_stdev_annual_years: number;
    dividend_yield: number | null;
    pbr: number | null;
    net_cash_ratio: number | null;
  };
}

/** 히스테리시스 상태 — 임계값 근처 진동 방지(§6-3). */
export interface ArchetypeHistory {
  /** 현재 확정된 분류. */
  confirmed: ArchetypeCode;
  /** 확정 대기 중인 새 분류(2회 연속 충족해야 확정). */
  pending: ArchetypeCode | null;
  /** `pending` 이 연속 몇 회 관측됐는지. */
  pending_streak: number;
  ruleset_version: string;
}

export interface ArchetypeDecision {
  /** 이번 갱신에서 실제로 적용할 분류. */
  code: ArchetypeCode;
  /** 규칙이 계산한 원 분류(히스테리시스 적용 전). */
  raw: ArchetypeCode;
  /** 변경 대기 중인지 — 카드·원장에 그대로 노출한다. */
  pending_change: ArchetypeCode | null;
  history: ArchetypeHistory;
  result: ArchetypeResult;
}
