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
 * 관측이 없으면 0 이나 추정치로 채우지 않는다 — `ok: false` 와 사유를 돌려주고 채점기가
 * `insufficient_data` 로 남긴다. 비율의 분모가 0 이하일 때도 마찬가지다.
 *
 * `margin.trend_8q` 의 부호 전환은 직전 발행 스냅샷이 필요해 아직 판정하지 않는다.
 *
 * `fiscal.quarters[].credit_loss_provision`(BANK 대손 전입액)은 **WO-SUB-CLOSE PART A 에서
 * 수집이 배선됐다** — SEC XBRL 별칭 4종 합집합(CECL 전환으로 개념명이 갈린다). KR 은 소스가
 * 확인되지 않아 여전히 관측 0건이고, 그래서 KR 은행은 `insufficient_data` 로 남는다(대체하지 않는다).
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

/**
 * 대손충당금 전입액의 **가장 최근 연속 분기 구간**을 값 배열로 준다(오래된 것 → 최신).
 *
 * `consecutive_rise` 판정은 인접 값을 비교한다. 배열에서 그냥 인접하다는 이유로 비교하면
 * 중간에 빠진 분기를 건너뛰어 6개월 간격을 "연속 2분기"로 읽는다 — 은행은 4분기 값을
 * 10-K 에만 싣는 경우가 있어 구멍이 실제로 생긴다. 그래서 기간말 간격이 분기 범위 안인
 * 구간만 이어 붙이고, 끊기면 거기서 새 구간을 시작해 **마지막 구간**을 돌려준다.
 *
 * 짧은 구간을 길게 만들지 않는다 — 모자라면 호출자가 `insufficient_data` 로 남긴다.
 */
const CONTIGUOUS_MIN_DAYS = 60;
const CONTIGUOUS_MAX_DAYS = 130;

function latestContiguousRun(quarters: readonly QuarterRecord[]): number[] {
  const points = quarters
    .filter((quarter) => typeof quarter.credit_loss_provision === "number")
    .map((quarter) => ({ end: quarter.period_end, value: quarter.credit_loss_provision as number }))
    .sort((a, b) => a.end.localeCompare(b.end));
  let run: typeof points = [];
  for (const point of points) {
    const previous = run[run.length - 1];
    if (!previous) {
      run = [point];
      continue;
    }
    const gap = (Date.parse(point.end) - Date.parse(previous.end)) / 86_400_000;
    run = gap >= CONTIGUOUS_MIN_DAYS && gap <= CONTIGUOUS_MAX_DAYS ? [...run, point] : [point];
  }
  return run.map((point) => point.value);
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
    case "fiscal.quarters[].credit_loss_provision": {
      /**
       * 대손충당금 전입액 전년동기 증가율(%). 수집은 WO-SUB-CLOSE PART A 에서 배선됐다.
       *
       * **분모가 0 이하인 분기는 건너뛴다** — 전입액은 환입(음수)이 되는 분기가 실제로 있고,
       * 그때 증가율은 부호가 뒤집혀 "급증"을 거꾸로 읽는다. 비율로 만들지 않고 버린다.
       *
       * 필드가 아예 없으면(비은행·수집 실패) 관측 0건이 되어 채점기가 `insufficient_data` 로
       * 남긴다. 0 으로 채우지 않는다.
       */
      const collected = quarters.filter((quarter) => typeof quarter.credit_loss_provision === "number").length;
      if (collected === 0) return { ok: false, reason: "대손충당금 전입액 관측 0건(비은행이거나 SEC 수집 실패)" };
      const series = latestContiguousRun(quarters);
      if (series.length < 2) {
        return { ok: false, reason: `대손 연속 분기 부족(관측 ${collected}건, 인접 분기 구간 최장 ${series.length}개)` };
      }
      return { ok: true, series };
    }
    default:
      return { ok: false, reason: `알 수 없는 지표 경로: ${metric}` };
  }
}
