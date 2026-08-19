import type { ScorecardPick } from "./judgmentLedgerClient";

/**
 * 우리 기록 — "우리가 언제 짚었고 그 뒤 얼마인가" (DS-01 §3-⑥ · DS-03 §9).
 *
 * ## `7일 아직 / 30일 아직 / 90일 아직` 을 왜 버리는가
 *
 * 그건 **채점 상태이지 성적이 아니다.** 8/17 에 4.37 로 짚어 지금 4.945 면 +13.1% 인데,
 * 화면은 "아직" 을 아홉 번 반복했다. 맞은 걸 눈앞에 두고 아무 말도 하지 않는 셈이다.
 * 그래서 **가장 오래된 발행일 대비 현재 수익률**을 직접 계산한다 — 원장에 이미 있는 값이다.
 *
 * T+7/30/90 은 **도래한 것만** 별도로 넘긴다(`graded`). 도래하지 않은 지평은 목록에 없다.
 *
 * 원장에는 레거시 30장 덱 기록도 섞여 있으므로 `pickType === "quiet"` 만 센다.
 */

export interface OurRecordHistory {
  /** 발행일 `YYYY-MM-DD`. */
  date: string;
  /** 발행 당시가. */
  priceAt: number;
}

export interface OurRecordGrade {
  /** 지평(일). */
  horizon: 7 | 30 | 90;
  returnPct: number;
}

export interface OurRecord {
  /** 가장 오래된 발행일 `YYYY-MM-DD`. */
  firstPublishedAt: string;
  /** 화면 문구 — `8월 17일에 짚은 뒤`. */
  sinceText: string;
  /** 그 발행일 당시가 대비 현재 수익률(%). 음수도 그대로. */
  returnPct: number;
  /** 발행 이력(최신순, 최대 5). 1건뿐이면 빈 배열 — 목록을 만들지 않는다. */
  history: OurRecordHistory[];
  /** 채점이 **도래한** 지평만. */
  graded: OurRecordGrade[];
}

const HORIZONS = [7, 30, 90] as const;
const MAX_HISTORY = 5;

/** `2026-08-17` → `8월 17일에 짚은 뒤`. 서버 문구가 없을 때 화면이 쓰는 유일한 조립 지점. */
export function sinceText(date: string): string {
  const [, month, day] = date.split("-");
  if (!month || !day) return `${date}에 짚은 뒤`;
  return `${Number(month)}월 ${Number(day)}일에 짚은 뒤`;
}

/**
 * 이 종목의 발행 기록 → 우리 기록. 없거나 **오늘 첫 발행**이면 `null`(블록을 그리지 않는다).
 *
 * @param picks 전체 발행 기록(성적표 원장). 종목 필터는 이 함수가 한다.
 * @param todayKst 오늘 날짜 `YYYY-MM-DD`(KST). 오늘 첫 발행 판정에 쓴다.
 */
export function computeOurRecord(
  picks: readonly ScorecardPick[],
  canonical: string,
  currentPrice: number | undefined,
  todayKst: string
): OurRecord | null {
  if (!Number.isFinite(currentPrice) || !currentPrice || currentPrice <= 0) return null;
  const mine = picks
    .filter((p) => p.canonical === canonical)
    // 레거시 30장 기록 혼입 금지 — 우리 성적은 **픽** 이력만 센다.
    .filter((p) => p.pickType === "quiet")
    .filter((p) => Number.isFinite(p.priceAt) && p.priceAt > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (mine.length === 0) return null;

  const first = mine[0]!;
  // 오늘 첫 발행 — 성적이라 부를 게 없다. 자리도 만들지 않는다.
  if (first.date >= todayKst) return null;

  const returnPct = Math.round(((currentPrice - first.priceAt) / first.priceAt) * 100 * 10) / 10;
  /**
   * `0.0%` 는 성적이 아니다. 발행 당시가와 현재가가 같은 카드(오늘 갓 기록된 픽)에서
   * `8월 19일에 짚은 뒤 0.0%` 가 accent 로 올라왔다 — 자랑할 것도 반성할 것도 없는 값이다.
   * 움직임이 생기면 그때 나온다.
   */
  if (Math.abs(returnPct) < 0.1) return null;

  const graded: OurRecordGrade[] = [];
  for (const horizon of HORIZONS) {
    const value = first.returns[String(horizon) as "7" | "30" | "90"];
    if (value && Number.isFinite(value.returnPct)) graded.push({ horizon, returnPct: value.returnPct });
  }

  return {
    firstPublishedAt: first.date,
    sinceText: sinceText(first.date),
    returnPct,
    // 1건뿐이면 목록이 수익률과 같은 말을 두 번 한다 — 그때는 목록을 만들지 않는다.
    history: mine.length > 1 ? [...mine].reverse().slice(0, MAX_HISTORY).map((p) => ({ date: p.date, priceAt: p.priceAt })) : [],
    graded,
  };
}
