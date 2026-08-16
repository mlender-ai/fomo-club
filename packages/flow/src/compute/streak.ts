import type { DailyParticipantFlow, StreakBreak } from "../types";

/**
 * 연속일수 산출 (CTX-01 §4). 순수·결정론.
 *
 * ```
 * 최근 거래일부터 역방향으로, net_value 의 부호가 유지되는 연속 거래일 수
 *  - net_value == 0 인 날은 연속을 끊지 않고 건너뛴다 (거래 없음)
 *  - 데이터 결손일은 연속을 끊는다 (모르는 것을 이어붙이지 않는다)
 *  - 휴장일은 애초에 거래일이 아니므로 판정에 들어오지 않는다
 * ```
 *
 * **거래일 캘린더를 인자로 받는다.** 저장된 행만 보면 "휴장이라 행이 없는 날" 과
 * "거래일인데 데이터가 빠진 날" 을 구분할 수 없다. 그 둘을 뭉개면 결손을 건너뛰고 이어붙이는
 * 바로 그 실패 모드가 된다 — 그래서 캘린더를 밖에서 주입받고, 없으면 추측하지 않는다.
 */
export interface StreakResult {
  /** 순매수 연속이면 양수, 순매도면 음수, 판정 불가·혼조면 0. */
  streak_days: number;
  streak_start: string | null;
  cumulative_shares_streak: number | null;
  cumulative_value_streak: number | null;
  streak_broken_by: StreakBreak;
}

const EMPTY: StreakResult = {
  streak_days: 0,
  streak_start: null,
  cumulative_shares_streak: null,
  cumulative_value_streak: null,
  streak_broken_by: null,
};

/**
 * @param rows        주체별 일별 원자료. 순서 무관(내부에서 날짜순 정렬).
 * @param tradingDays 판정 대상 거래일 목록(YYYY-MM-DD). 휴장일은 여기 없어야 한다.
 */
export function computeStreak(
  rows: readonly DailyParticipantFlow[],
  tradingDays: readonly string[]
): StreakResult {
  if (tradingDays.length === 0) return EMPTY;

  const byDate = new Map<string, DailyParticipantFlow>();
  for (const row of rows) byDate.set(row.date, row);

  // 거래일만, 최신순으로 훑는다. 휴장일은 목록에 없으므로 자연히 제외된다.
  const days = [...tradingDays].sort().reverse();

  let sign = 0;
  let count = 0;
  let start: string | null = null;
  let shares: number | null = null;
  let value = 0;
  let broke: StreakBreak = null;

  for (const day of days) {
    const row = byDate.get(day);
    // 거래일인데 행이 없거나 금액을 모른다 → 결손. 여기서 끊고 사유를 남긴다.
    if (!row || row.net_value == null) {
      broke = "missing_data";
      break;
    }
    // 거래 없음(0)은 연속을 끊지 않고 건너뛴다. 누적에도 기여하지 않는다.
    if (row.net_value === 0) continue;

    const rowSign = row.net_value > 0 ? 1 : -1;
    if (sign === 0) sign = rowSign;
    else if (rowSign !== sign) break; // 부호 반전 = 정상 종료

    count += 1;
    start = day;
    value += row.net_value;
    if (row.net_shares != null) shares = (shares ?? 0) + row.net_shares;
  }

  if (count === 0) return { ...EMPTY, streak_broken_by: broke };

  return {
    streak_days: sign * count,
    streak_start: start,
    cumulative_shares_streak: shares,
    cumulative_value_streak: value,
    streak_broken_by: broke,
  };
}
