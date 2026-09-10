/**
 * CTX-01 수급 주체·연속성 — 타입 정본.
 *
 * 규약 (CTX-01 §3-1):
 *  1. **확보 안 된 주체는 배열에서 제외**하고 `missing_participants` 에 등재한다. `0` 으로 채우지 않는다.
 *  2. `streak_days` 는 순매수 연속이면 양수, 순매도 연속이면 음수, 혼조면 0.
 *  3. 연속 판정은 **거래일 캘린더 기준**이다. 휴장일·거래정지일은 포함하지 않는다.
 *  4. 통화 환산 금지. 원통화로 저장한다.
 */

export type Participant = "retail" | "institution" | "foreign" | "insider";

export const PARTICIPANTS: readonly Participant[] = ["retail", "institution", "foreign", "insider"];

/** 연속이 끊긴 사유. 정상 종료(부호 반전)면 `null`. */
export type StreakBreak = "missing_data" | null;

/** 한 주체의 하루치 원자료. 값이 없으면 `null` — 0 과 구분한다(거래 없음 ≠ 모름). */
export interface DailyParticipantFlow {
  /** 거래일 (YYYY-MM-DD). */
  date: string;
  net_shares: number | null;
  net_value: number | null;
}

export interface ParticipantFlow {
  participant: Participant;
  /** 순매수 수량 (음수 = 순매도). */
  net_shares: number | null;
  /** 순매수 금액, 원통화. */
  net_value: number | null;
  /** 연속 순매수일. 순매도면 음수. 혼조면 0. */
  streak_days: number | null;
  streak_start: string | null;
  /** 연속 구간 누적. */
  cumulative_shares_streak: number | null;
  cumulative_value_streak: number | null;
  /** 해당 기간 거래량 대비 비중. 거래량을 모르면 `null`. */
  pct_of_volume: number | null;
  /**
   * 연속이 결손으로 끊겼으면 `"missing_data"`.
   *
   * **이 필드가 이 WO 의 핵심이다.** 결손일을 건너뛰고 이으면 "26일 연속" 이 거짓이 된다.
   * 끊고, 사유를 남긴다.
   */
  streak_broken_by: StreakBreak;
  source: string;
  as_of: string;
}

export type Coverage = "full" | "partial" | "none";

export interface FlowSnapshot {
  symbol: string;
  market: "KR" | "US";
  as_of: string;
  /** 확보된 주체만. 없는 주체는 배열에서 제외한다. */
  participants: ParticipantFlow[];

  // ── 파생 ──
  net_buyers: Participant[];
  net_sellers: Participant[];
  /** 연속 구간 누적 금액 최대. 금액을 모르면 후보에서 빠진다. */
  dominant_buyer: Participant | null;
  dominant_seller: Participant | null;

  coverage: Coverage;
  missing_participants: Participant[];
}
