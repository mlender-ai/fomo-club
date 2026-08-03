import type { BandStat } from "../fundamentals/types";
import type { ArchetypeCode, ChartBarSeries, ChartLineMetric } from "../archetype/types";

/**
 * 값의 상태 차트 데이터 계약 (WO-SUB-04 §5-3).
 *
 * **렌더 시점이 아니라 배치에서 만든다**(완료 조건 7). 렌더에서 만들면 종목마다 계산이 흩어져
 * 같은 화면에서 다른 기준일의 값이 섞인다.
 */

/** 막대 한 칸. `kind` 로 실적/예상을 나눈다 — 색이 아니라 데이터가 구분의 근거다. */
export interface ChartBar {
  /** "24", "25" — 표시용 짧은 라벨. */
  label: string;
  value: number | null;
  kind: "actual" | "estimate";
  source: string;
  as_of: string;
}

/** 배수 선의 한 점. `value: null` 이면 **선을 끊는다**(보간 금지). */
export interface ChartLinePoint {
  date: string;
  value: number | null;
}

export interface EstimateMeta {
  present: boolean;
  source: string | null;
  as_of: string | null;
  analyst_count: number | null;
}

/**
 * 차트를 그리지 못하는 사유. **"없음"과 "못 그림"을 구분한다** —
 * 화면에서는 둘 다 안 보이지만, 운영에서는 전혀 다른 문제다.
 */
export type ChartUnavailableReason =
  | "unclassified"
  | "no_axes"
  | "bar_series_unavailable"
  | "no_bar_data";

export interface ValuationChartData {
  symbol: string;
  archetype: ArchetypeCode;
  ruleset_version: string;

  bars: ChartBar[];
  /** `null` 이면 배수 선 자체가 없다(BIOTECH, 또는 지표 미확보). */
  line: ChartLinePoint[] | null;

  bar_metric: ChartBarSeries | null;
  bar_label: string | null;
  line_metric: ChartLineMetric | null;
  line_label: string | null;
  currency: "KRW" | "USD";

  estimate_meta: EstimateMeta;

  band: BandStat | null;
  /** 독트린에서 로드한 경고문. 코드에 문안을 두지 않는다. */
  warning: string | null;
  /** 캡션 — 템플릿으로만 생성된다. 자유 서술 금지. */
  captions: string[];

  /** `false` 면 차트 영역 **자체를 감춘다**(빈 박스로 남기지 않는다 — 완료 조건 2). */
  renderable: boolean;
  /** `renderable: false` 일 때만 채워진다. */
  unavailable_reason: ChartUnavailableReason | null;
}
