/**
 * CTX-02 가격·거래량 구조 판정 — 타입 정본.
 *
 * 이 패키지는 **관측 사실을 구조화**한다. 매매 시그널·진입가·목표가를 만들지 않는다(§3·§11).
 * 와이코프 용어(Phase A/B/C/D · Spring · LPS)는 **화면 문구에 쓰지 않는다**(§1·완료조건 9).
 * FCE 엔진 코드를 가져오지 않는다 — 미해결 결함 15건이 화면으로 나가면 안 된다(§1).
 *
 * 전 함수 **순수**: 네트워크·시각·난수 의존 없음(§8). 같은 입력 → 같은 판정(완료조건 8).
 */

/**
 * 일봉 하나. `packages/shared` 의 `CandleDto` 는 `symbol`·`timeframe`·`openTime`/`closeTime` 을
 * 요구해 순수 계산에는 과하다. 여기서는 계산에 실제로 쓰는 필드만 둔다 — `CandleDto` 는
 * `{date: closeTime.slice(0,10), ...}` 로 매핑하면 그대로 들어온다.
 */
export interface DailyCandle {
  /** 거래일 (YYYY-MM-DD). 오름차순 정렬을 전제한다. */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── §4 산출 지표 ────────────────────────────────────────────────

/** 최근 N일 고저 폭 / 과거 M일 평균 폭. */
export interface RangeCompression {
  ratio: number | null;
  recentAvgRange: number | null;
  priorAvgRange: number | null;
}

/** 최근 N일 평균 거래량 / 과거 M일 평균. */
export interface VolumeRatio {
  ratio: number | null;
  recentAvgVolume: number | null;
  priorAvgVolume: number | null;
}

/** 평균 대비 임계 배수를 넘은 날. */
export interface VolumeSpikeDays {
  count: number;
  dates: string[];
}

/** 최근 N개 저점의 절상 여부. */
export interface HigherLows {
  isHigherLows: boolean;
  lows: Array<{ date: string; low: number }>;
}

/** 특정 가격대 재접근 횟수. */
export interface SupportTests {
  count: number;
  level: number | null;
  dates: string[];
}

/** 하단 이탈 후 되돌아온 사례. */
export interface BelowRangeRecovery {
  events: Array<{ date: string; depthPct: number; recoveryDays: number }>;
}

/** 20/60/120일선 배열 상태. 화면 문구는 일상어로 바꿔 쓴다. */
export type MaAlignment = "상승정렬" | "하락정렬" | "혼조" | null;

/** §4 지표 묶음. 산출 불가 항목은 `null` — 추정으로 메우지 않는다. */
export interface StructureIndicators {
  range_compression: RangeCompression;
  volume_ratio: VolumeRatio;
  volume_spike_days: VolumeSpikeDays;
  higher_lows: HigherLows;
  support_tests: SupportTests;
  below_range_recovery: BelowRangeRecovery;
  /** 현재가의 최근 N일 레인지 내 백분위 0~100. */
  position_in_range: number | null;
  /** 52주 고점 대비 낙폭 %. 음수 = 고점 아래. */
  drawdown_from_high: number | null;
  /** 52주 고점 이후 경과 거래일. */
  days_since_high: number | null;
  ma_alignment: MaAlignment;
}

// ── §5 구간 유형 ────────────────────────────────────────────────

export type StructureType =
  | "QUIET_RANGE"
  | "BASE_LIFTING"
  | "SHAKEOUT_RECOVERED"
  | "VOLUME_WAKING"
  | "EXTENDED"
  | "DECLINING"
  | "UNDETERMINED";

/** 화면 문구(§5) — 와이코프 용어 없음. */
export const STRUCTURE_LABEL: Readonly<Record<StructureType, string>> = {
  QUIET_RANGE: "좁은 범위에서 조용해요",
  BASE_LIFTING: "저점이 조금씩 올라오고 있어요",
  SHAKEOUT_RECOVERED: "아래로 뚫렸다가 되돌아왔어요",
  VOLUME_WAKING: "조용하다가 거래가 붙기 시작했어요",
  EXTENDED: "이미 많이 올라온 자리예요",
  DECLINING: "아직 내려오는 중이에요",
  UNDETERMINED: "구조를 판정하지 못했어요",
};

/** `UNDETERMINED` 사유(완료조건 7). 판정 불가는 정상 출력이다. */
export type UndeterminedReason =
  | "insufficient_candles"
  | "no_rule_matched"
  | "insufficient_evidence";

/** 판정에 동반하는 근거 지표(완료조건 6 — 3개). 근거 없는 라벨은 출력하지 않는다. */
export interface StructureEvidence {
  /** §4 지표 코드. */
  code: keyof StructureIndicators;
  /** 사람이 읽는 값 표현. 수치는 그대로 둔다 — 문장으로 녹이지 않는다. */
  value: number | string | boolean | null;
}

export interface StructureVerdict {
  type: StructureType;
  label: string;
  /** 정확히 3개. 부족하면 `UNDETERMINED`(`insufficient_evidence`)로 보낸다. */
  evidence: StructureEvidence[];
  /** `type === "UNDETERMINED"` 일 때만 채워진다. */
  undetermined_reason: UndeterminedReason | null;
  /** 판단 원장 채점용(§6-2). */
  params_version: string;
  indicators: StructureIndicators;
}

/** §7 히스테리시스 — 유형이 매일 튀면 사용자 경험과 채점이 함께 망가진다. */
export interface StabilizedVerdict extends StructureVerdict {
  /** 2거래일 연속 충족 전이라 아직 확정 못 한 새 유형. */
  pending_change: StructureType | null;
}
