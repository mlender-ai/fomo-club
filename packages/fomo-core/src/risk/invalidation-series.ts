/**
 * 사업 무효 조건 판정 입력 추출 (WO-SUB-07 §6-4).
 *
 * 스탬프의 `metric` 문자열 → 팩트시트에서 뽑은 시계열. `judgeBusinessInvalidation()` 이 이 값을 먹는다.
 *
 * ## 왜 문자열 경로인가
 *
 * 조건 카탈로그(06)가 경로를 문자열로 갖는다. 함수 참조로 두면 카탈로그가 코드에 묶여 원장에
 * 기록할 수 없다 — 발행 시점 스탬프는 **데이터**여야 나중에 그 순간을 복원할 수 있다.
 * 그래서 경로는 문자열로 남기고 해석기를 여기 둔다.
 *
 * ## 뽑을 수 없는 경로가 있다 (정직하게 비운다)
 *
 * `fiscal.quarters[].credit_loss_provision`(BANK 대손 전입액)은 **팩트시트에 없다.**
 * 06 의 프로브가 SEC XBRL 에 있다는 것을 실측했지만(12종목 중 11) 그건 *소스에 있다*는 뜻이고,
 * 팩트시트 수집 파이프라인(WO-SUB-01)이 아직 그 개념을 담지 않는다. 여기서 0 이나 추정치로
 * 채우면 채점이 거짓이 된다 — `unavailable` 을 돌려주고 채점기가 `insufficient_data` 로 남긴다.
 * 수집이 붙으면 이 파일만 고치면 된다.
 */

import type { FactSheet, QuarterRecord } from "../fundamentals/types";

export type SeriesResult =
  | { ok: true; series: number[] }
  | { ok: false; reason: string };

/** 분기 영업이익률(%). 매출이 0 이하면 비율이 의미를 잃으므로 건너뛴다. */
function operatingMargins(quarters: readonly QuarterRecord[]): number[] {
  const out: number[] = [];
  for (const quarter of quarters) {
    const revenue = quarter.revenue;
    const operating = quarter.operating_income;
    if (revenue === null || operating === null || revenue <= 0) continue;
    out.push((operating / revenue) * 100);
  }
  return out;
}

/**
 * 분기 매출 전년동기 증가율(%).
 *
 * 전년 동기는 **4분기 전**이다. 직전 분기 대비로 계산하면 계절성이 성장률로 둔갑한다 —
 * WO-SUB-02 에서 분기 표준편차가 계절성에 오염됐던 것과 같은 함정이다.
 */
function revenueYoy(quarters: readonly QuarterRecord[]): number[] {
  const out: number[] = [];
  for (let i = 4; i < quarters.length; i += 1) {
    const now = quarters[i]!.revenue;
    const year = quarters[i - 4]!.revenue;
    if (now === null || year === null || year <= 0) continue;
    out.push(((now - year) / year) * 100);
  }
  return out;
}

const TREND_TO_NUMBER: Record<string, number> = { expanding: 1, flat: 0, contracting: -1, unknown: Number.NaN };

/**
 * 경로 → 시계열.
 *
 * 스칼라 지표는 길이 1 배열로 돌려준다(임계값 조건은 관측 1개면 판정된다).
 * 시계열이 필요한 추세 조건은 관측 수가 모자라면 채점기가 `insufficient_data` 로 판정한다 —
 * 여기서 길이를 채우지 않는다.
 */
export function seriesForMetric(metric: string, factsheet: FactSheet): SeriesResult {
  const quarters = factsheet.fiscal?.quarters ?? [];

  switch (metric) {
    case "fiscal.quarters[].operating_margin": {
      const series = operatingMargins(quarters);
      return series.length > 0 ? { ok: true, series } : { ok: false, reason: "분기 영업이익률 관측 0건" };
    }
    case "fiscal.quarters[].revenue_yoy": {
      const series = revenueYoy(quarters);
      return series.length > 0 ? { ok: true, series } : { ok: false, reason: "전년동기 비교 가능한 분기 부족(4분기 이상 필요)" };
    }
    case "fiscal.quarters[].operating_income": {
      const series = quarters.map((quarter) => quarter.operating_income).filter((value): value is number => value !== null);
      return series.length > 0 ? { ok: true, series } : { ok: false, reason: "분기 영업이익 관측 0건" };
    }
    case "margin.trend_8q": {
      const trend = factsheet.margin?.trend_8q;
      const value = trend ? TREND_TO_NUMBER[trend] : Number.NaN;
      if (value === undefined || Number.isNaN(value)) return { ok: false, reason: `영업이익률 추세 미확보(${trend ?? "없음"})` };
      // 부호 전환 판정은 값 2개가 필요하다. 추세는 스칼라라 이전 값이 없으므로
      // **직전 스냅샷 없이는 판정하지 않는다** — 여기서 0 을 앞에 붙이면 없는 전환을 만든다.
      return { ok: false, reason: "추세 전환은 직전 발행 시점 값이 필요(스냅샷 비교 미배선)" };
    }
    case "balance.cash_runway_quarters": {
      const value = factsheet.balance?.cash_runway_quarters;
      return typeof value === "number" && Number.isFinite(value)
        ? { ok: true, series: [value] }
        : { ok: false, reason: "현금 런웨이 미확보(영업현금흐름 흑자면 정상적으로 null)" };
    }
    case "cashflow.dividend_paid_ttm/free_cash_flow_ttm": {
      const dividend = factsheet.cashflow?.dividend_paid_ttm;
      const fcf = factsheet.cashflow?.free_cash_flow_ttm;
      if (typeof dividend !== "number" || typeof fcf !== "number") return { ok: false, reason: "배당·잉여현금흐름 미확보" };
      if (fcf <= 0) return { ok: false, reason: "잉여현금흐름이 0 이하 — 비율이 의미를 갖지 않음" };
      return { ok: true, series: [dividend / fcf] };
    }
    case "fiscal.quarters[].credit_loss_provision":
      // 소스(SEC XBRL)에는 있으나 팩트시트가 아직 수집하지 않는다. 추정치로 채우지 않는다.
      return { ok: false, reason: "대손충당금 전입액을 팩트시트가 수집하지 않음(SEC 소스에는 존재 — 수집 미배선)" };
    default:
      return { ok: false, reason: `알 수 없는 지표 경로: ${metric}` };
  }
}
