/**
 * CTX-02 §6-2 파라미터 상수.
 *
 * ⚠️ **임계값은 아직 비어 있다. 감으로 채우지 않는다.**
 *
 * §6 은 임계값 결정 절차를 못박는다: 층화 표본 200종목(시드 고정) → 지표 분포 산출 →
 * 사람이 차트를 보고 라벨한 골든셋 60종목 → 대조 → 오분류 비대칭 반영 → 근거 기록.
 * 완료조건 3 은 **"근거 없는 임계값이 없다"** 이고, §11 은 결정할 수 없으면
 * **"임의로 정하지 말고 분포와 선택지를 정리해 질문한다"** 고 지시한다.
 *
 * 그래서 이 파일은 **형태만 확정하고 값은 비워 둔다.** 값이 없으면 분류기는 전부
 * `UNDETERMINED("insufficient_evidence")` 로 떨어진다 — 틀린 라벨보다 라벨 없음이 낫다(§5-1 규칙 3).
 *
 * 분포 산출에는 유니버스 일봉이 필요한데 2026-08-16 현재 그 접근이 열려 있지 않다
 * (`AUDIT_TOKEN` 미설정). 열리면 §6-1 절차를 실행하고 이 파일을 채운다.
 */

export const STRUCTURE_PARAMS_VERSION = "structure-v1.0.0-draft";

/** 지표 산출 창(§4 의 N·M). 분류 임계값과 달리 **계산 창**이라 호출자가 명시적으로 넘긴다. */
export interface IndicatorWindows {
  /** 최근 구간 길이(거래일). */
  recent: number;
  /** 비교 대상 과거 구간 길이(거래일). */
  prior: number;
}

/** §5 판정에 쓰는 임계값. `null` = 미확정 — §6 절차 전에는 채우지 않는다. */
export interface StructureThresholds {
  /** `range_compression` 이 이 값 이하면 "범위 축소". */
  rangeCompressionMax: number | null;
  /** `volume_ratio` 가 이 값 이하면 "거래량 감소". */
  volumeQuietMax: number | null;
  /** 일별 거래량이 평균의 이 배수를 넘으면 급증일. */
  volumeSpikeMultiple: number | null;
  /** `drawdown_from_high` 가 이 값보다 크면(절댓값) "낙폭 큼". */
  drawdownDeepMin: number | null;
  /** `position_in_range` 가 이 값 이상이면 "레인지 상단". */
  positionHighMin: number | null;
  /** `days_since_high` 가 이 값 이하면 "고점 근접". */
  daysSinceHighNear: number | null;
}

/**
 * 전부 `null` 이다. **의도된 상태다.**
 * 시장별(KR/US) 분리가 필요한지도 §6-2 에 따라 분포 비교로 확인한 뒤 결정한다 — 지금은 단일이다.
 */
export const STRUCTURE_THRESHOLDS_V1: Readonly<StructureThresholds> = {
  rangeCompressionMax: null,
  volumeQuietMax: null,
  volumeSpikeMultiple: null,
  drawdownDeepMin: null,
  positionHighMin: null,
  daysSinceHighNear: null,
};

/** §5-1 규칙 5 — 일봉 120거래일 미만이면 무조건 `UNDETERMINED`. 이 값은 WO 본문이 직접 준다. */
export const MIN_CANDLES_FOR_VERDICT = 120;

/** §5-1 규칙 4 — 판정에 동반하는 근거 지표 개수. WO 본문이 직접 준다. */
export const REQUIRED_EVIDENCE_COUNT = 3;

/** §7 — 새 유형이 확정되기까지 필요한 연속 거래일 수. WO 본문이 직접 준다. */
export const HYSTERESIS_CONSECUTIVE_DAYS = 2;

/** 임계값이 하나라도 비어 있으면 분류를 시도하지 않는다. */
export function thresholdsResolved(t: Readonly<StructureThresholds>): boolean {
  return Object.values(t).every((v) => typeof v === "number");
}
