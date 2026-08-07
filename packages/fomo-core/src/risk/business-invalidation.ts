/**
 * 사업 기준 무효 조건 (WO-SUB-06 §5-3 · 커밋 5).
 *
 * ## 왜 필요한가
 *
 * 지금 우리가 가진 것은 **가격 무효선 하나**다("52주 저점 이탈 시 이 관점은 무효예요").
 * 좋은 장치지만 주가가 안 빠지면서 논리가 깨지는 경우 — 증설 물량 도래, 대손 급증, 성장 둔화 —
 * 를 말하지 않는다. 사업 사실 기준의 무효 조건을 가격 무효선과 **병행**한다.
 *
 * ## 관측 가능해야 한다
 *
 * 다음 실적 발표 데이터로 **자동 판정 가능한 형태로만** 정의한다. 서술형 조건은 WO-SUB-07 이
 * 채점할 수 없고, 채점 못 하는 조건은 표시만 되고 검증되지 않는다 — 그건 무효 조건이 아니라
 * 장식이다. 그래서 조건은 팩트시트 경로(`metric`)와 판정 방향으로만 표현하고,
 * `judgeBusinessInvalidation` 이 같은 입력에서 항상 같은 결론을 낸다.
 *
 * 조건을 만들 수 없으면 `null`. 억지로 만들지 않는다.
 */

import type { ArchetypeCode } from "../archetype/types";

/**
 * 판정 방향.
 *
 * `consecutive_decline`/`consecutive_rise` 는 "2분기 연속" 처럼 **추세**를 본다 —
 * 값 하나로는 판정할 수 없어서 관측 3개가 필요하다(연속 2회 변화 = 값 3개).
 */
export type InvalidationDirection = "above" | "below" | "sign_change" | "consecutive_decline" | "consecutive_rise";

export interface BusinessInvalidation {
  /** 화면 문안. 해요체, 조건형. */
  condition_text: string;
  /** 관측 지표의 팩트시트 경로 또는 시계열 키. 자동 판정의 입력이다. */
  metric: string;
  direction: InvalidationDirection;
  /** `above`/`below` 에서만 쓰인다. 추세 방향에서는 null. */
  threshold: number | null;
  /** 추세 방향에서 요구하는 연속 횟수(2 = 2분기 연속). 그 외 null. */
  consecutive: number | null;
  /** 다음 확인 시점. 실적 발표일을 모르면 null 이지만 사유를 짝으로 남긴다(#1040 규약). */
  check_at: string | null;
  check_at_status: "earnings_date" | "no_source_kr" | "outside_window" | "unknown";
}

/**
 * 아키타입별 기본 조건 카탈로그.
 *
 * WO §5-3 표를 관측 가능한 형태로 옮긴 것이다. `BANK_FINANCIAL` 의 대손충당금 전입액은
 * 소스가 없다고 단정하기 전에 실측했다 — SEC XBRL 에 있고 12종목 중 11 이 판정 가능하다.
 * 별칭 4종을 합집합으로 봐야 한다(CECL 전환으로 개념명이 갈린다):
 *   ProvisionForLoanLeaseAndOtherLosses · ProvisionForLoanAndLeaseLosses ·
 *   ProvisionForLoanLossesExpensed · FinancingReceivableExcludingAccruedInterestCreditLossExpenseReversal
 * `InterestIncomeExpenseAfterProvisionForLoanLoss`(순이자이익 **차감후** 값)는 전입액이 아니므로
 * 쓰지 않는다 — 관측 수만 보고 고르면 의미가 다른 개념을 집는다.
 */
const CATALOG: Partial<Record<ArchetypeCode, Omit<BusinessInvalidation, "check_at" | "check_at_status">>> = {
  CYCLICAL_COMMODITY: {
    condition_text: "영업이익률이 2분기 연속 낮아지면 이 관점은 다시 봐야 해요",
    metric: "fiscal.quarters[].operating_margin",
    direction: "consecutive_decline",
    threshold: null,
    consecutive: 2,
  },
  HYPERGROWTH_UNPROFITABLE: {
    condition_text: "매출이 늘어나는 속도가 2분기 연속 느려지면 이 관점은 다시 봐야 해요",
    metric: "fiscal.quarters[].revenue_yoy",
    direction: "consecutive_decline",
    threshold: null,
    consecutive: 2,
  },
  QUALITY_COMPOUNDER: {
    condition_text: "영업이익률 추세가 내려가는 쪽으로 바뀌면 이 관점은 다시 봐야 해요",
    metric: "margin.trend_8q",
    direction: "sign_change",
    threshold: null,
    consecutive: null,
  },
  BANK_FINANCIAL: {
    condition_text: "이익에서 미리 떼어 두는 대손 금액이 2분기 연속 늘면 이 관점은 다시 봐야 해요",
    metric: "fiscal.quarters[].credit_loss_provision",
    direction: "consecutive_rise",
    threshold: null,
    consecutive: 2,
  },
  BIOTECH_PIPELINE: {
    condition_text: "가진 현금으로 버틸 기간이 4분기 아래로 내려가면 이 관점은 다시 봐야 해요",
    metric: "balance.cash_runway_quarters",
    direction: "below",
    threshold: 4,
    consecutive: null,
  },
  MATURE_INCOME: {
    condition_text: "나눠주는 배당이 쓰고 남는 현금을 넘어서면 이 관점은 다시 봐야 해요",
    metric: "cashflow.dividend_paid_ttm/free_cash_flow_ttm",
    direction: "above",
    threshold: 1,
    consecutive: null,
  },
  TURNAROUND_LOSS: {
    condition_text: "분기 영업이익이 흑자로 바뀌지 않으면 이 관점은 다시 봐야 해요",
    metric: "fiscal.quarters[].operating_income",
    direction: "sign_change",
    threshold: null,
    consecutive: null,
  },
  STABLE_EARNINGS: {
    condition_text: "영업이익률이 2분기 연속 낮아지면 이 관점은 다시 봐야 해요",
    metric: "fiscal.quarters[].operating_margin",
    direction: "consecutive_decline",
    threshold: null,
    consecutive: 2,
  },
};

/**
 * 조건을 만들 수 없는 유형.
 *
 * 억지로 만들지 않는다(§5-3). `PHARMA_STABLE` 의 특허 만료일과 `ASSET_DEEP_VALUE` 의
 * 자산 재평가·지배구조 결정은 **실적 발표 데이터에 없다** — 서술형으로 쓰면 WO-SUB-07 이
 * 채점할 수 없어 장식이 된다. `UNCLASSIFIED` 는 유형 해석 자체를 하지 않는다.
 */
export const NO_BUSINESS_INVALIDATION: Partial<Record<ArchetypeCode, string>> = {
  PHARMA_STABLE: "특허 만료일·약가 고시는 실적 발표 데이터에 없어 자동 판정 불가",
  ASSET_DEEP_VALUE: "자산 재평가·환원 결정은 실적 발표 데이터에 없어 자동 판정 불가",
  UNCLASSIFIED: "유형 해석을 제공하지 않는다",
};

export interface EarningsCheckpoint {
  date: string | null;
  status: BusinessInvalidation["check_at_status"];
}

/** 아키타입 → 사업 무효 조건. 조건이 없으면 null(사유는 `NO_BUSINESS_INVALIDATION`). */
export function businessInvalidationFor(code: ArchetypeCode, checkpoint: EarningsCheckpoint): BusinessInvalidation | null {
  const base = CATALOG[code];
  if (!base) return null;
  return { ...base, check_at: checkpoint.date, check_at_status: checkpoint.status };
}

/**
 * 판정 가능성 검사 (§7 커밋 5 "판정 가능성 검사" · 완료 조건 5).
 *
 * 조건이 형태만 갖추고 값이 없으면 채점 시점에 조용히 통과한다. 그래서 **정의 시점에** 검사한다.
 */
export interface JudgeabilityResult {
  judgeable: boolean;
  reason: string | null;
  /** 추세 방향이 요구하는 최소 관측 수. 호출자가 시계열 길이를 이걸로 검사한다. */
  requiredObservations: number;
}

export function judgeability(invalidation: BusinessInvalidation): JudgeabilityResult {
  const trend = invalidation.direction === "consecutive_decline" || invalidation.direction === "consecutive_rise";
  if (trend) {
    if (!invalidation.consecutive || invalidation.consecutive < 1) {
      return { judgeable: false, reason: "추세 조건인데 연속 횟수가 없다", requiredObservations: 0 };
    }
    if (invalidation.threshold !== null) {
      return { judgeable: false, reason: "추세 조건에 임계값이 붙어 있다 — 판정 규칙이 둘이 된다", requiredObservations: 0 };
    }
    // 연속 N회 변화 = 값 N+1 개
    return { judgeable: true, reason: null, requiredObservations: invalidation.consecutive + 1 };
  }
  if (invalidation.direction === "above" || invalidation.direction === "below") {
    if (invalidation.threshold === null) {
      return { judgeable: false, reason: "임계값 조건인데 threshold 가 없다", requiredObservations: 0 };
    }
    return { judgeable: true, reason: null, requiredObservations: 1 };
  }
  // sign_change
  if (invalidation.threshold !== null) {
    return { judgeable: false, reason: "부호 전환 조건에 임계값이 붙어 있다", requiredObservations: 0 };
  }
  return { judgeable: true, reason: null, requiredObservations: 2 };
}

export type InvalidationVerdict = "invalidated" | "holding" | "insufficient_data";

export interface JudgeInput {
  /** 관측 시계열, 오래된 것 → 최신. 결측은 넣지 않는다(0 으로 대체하면 가짜 판정이 된다). */
  series: readonly number[];
  /** `sign_change` 에서 "어느 부호로 바뀌면 무효인가". 기본은 양수 → 음수. */
  signChangeTo?: "negative" | "positive";
}

/**
 * 자동 판정 — WO-SUB-07 이 소비하는 지점. 같은 입력 → 같은 출력.
 *
 * 데이터가 부족하면 `holding` 이 아니라 `insufficient_data` 다. 둘을 합치면 "아직 유효함" 과
 * "판정하지 못함" 이 같은 말이 되는데, 그건 §11 이 금지한 혼용("리스크 없음"과 "확보하지 못함")과
 * 같은 종류의 거짓이다.
 */
export function judgeBusinessInvalidation(invalidation: BusinessInvalidation, input: JudgeInput): InvalidationVerdict {
  const check = judgeability(invalidation);
  if (!check.judgeable) return "insufficient_data";
  const series = input.series.filter((value) => Number.isFinite(value));
  if (series.length < check.requiredObservations) return "insufficient_data";

  switch (invalidation.direction) {
    case "below":
      return series[series.length - 1]! < invalidation.threshold! ? "invalidated" : "holding";
    case "above":
      return series[series.length - 1]! > invalidation.threshold! ? "invalidated" : "holding";
    case "consecutive_decline": {
      const window = series.slice(-(invalidation.consecutive! + 1));
      const declining = window.every((value, index) => index === 0 || value < window[index - 1]!);
      return declining ? "invalidated" : "holding";
    }
    case "consecutive_rise": {
      const window = series.slice(-(invalidation.consecutive! + 1));
      const rising = window.every((value, index) => index === 0 || value > window[index - 1]!);
      return rising ? "invalidated" : "holding";
    }
    case "sign_change": {
      const previous = series[series.length - 2]!;
      const latest = series[series.length - 1]!;
      const to = input.signChangeTo ?? "negative";
      if (to === "negative") return previous >= 0 && latest < 0 ? "invalidated" : "holding";
      return previous <= 0 && latest > 0 ? "invalidated" : "holding";
    }
  }
}

/** 카탈로그 전체 — 문서 렌더·감사용. */
export function businessInvalidationCatalog(): Array<{ code: ArchetypeCode; invalidation: BusinessInvalidation | null; absentReason: string | null }> {
  const codes = [...new Set([...Object.keys(CATALOG), ...Object.keys(NO_BUSINESS_INVALIDATION)])] as ArchetypeCode[];
  return codes.sort().map((code) => ({
    code,
    invalidation: businessInvalidationFor(code, { date: null, status: "unknown" }),
    absentReason: NO_BUSINESS_INVALIDATION[code] ?? null,
  }));
}
