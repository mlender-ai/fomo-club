import type { ScorecardPick } from "./judgmentLedgerClient";

/**
 * 성적표·내 기록의 계산부 (DS-04). 순수 함수만 둔다 — 화면은 이 결과를 그리기만 한다.
 *
 * ## 이 파일이 지키는 절대 규칙 (DS-04 §1-4)
 *
 * | 규칙 | 구현 |
 * |---|---|
 * | 표본 30 미만이면 비율을 내지 않는다 | `rateOrSampleShort()` → `표본 부족 (12건)` |
 * | 판정 불가를 분모에서 빼지 않는다 | `invalidationRows()` 가 세 값을 그대로 넘긴다 |
 * | 평균 금지 | `medianOf()` 만 제공한다. 평균 함수를 두지 않는다 |
 * | 나쁜 성적도 그대로 | 음수 필터가 없다 |
 */

/** 비율을 말할 수 있는 최소 표본. `packages/lab` 의 `MIN_SAMPLE` 과 같은 값이다(INV-C13). */
export const MIN_SAMPLE = 30;

/** 발행 후 채점이 시작되는 날수 — 가장 짧은 창(7일). */
export const FIRST_SCORING_DAYS = 7;

export function formatSignedPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/**
 * 비율 표시 — **표본 30 미만이면 비율 대신 표본을 말한다.**
 * `3건의 33%` 와 `300건의 33%` 를 같은 얼굴로 내보내지 않는다.
 */
export function rateOrSampleShort(rate: number | null, n: number): string {
  if (n < MIN_SAMPLE) return `표본 부족 (${n.toLocaleString("ko-KR")}건)`;
  if (rate === null) return "—";
  return `${rate.toFixed(1)}%`;
}

/** 값을 말할 수 있는가 — 표본 게이트를 통과했는지. 화면이 accent 를 어디 둘지 판단에 쓴다. */
export function hasEnoughSample(n: number): boolean {
  return n >= MIN_SAMPLE;
}

/** 중앙값. 평균은 제공하지 않는다 — 소수 대박이 왜곡한다(DS-04 §1-4). */
export function medianOf(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface PendingScoring {
  /** 채점 대기 중인 판단 수(가장 짧은 창이 아직 도래하지 않은 것). */
  pending: number;
  /** 가장 오래된 발행일 `YYYY-MM-DD`. 없으면 null. */
  firstPublishedAt: string | null;
  /** 첫 채점 예정일 `YYYY-MM-DD` — 첫 발행일 + 7일. 이미 지났으면 null. */
  firstScoringAt: string | null;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const at = new Date(Date.UTC(y, m - 1, d + days));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
}

/** `2026-08-24` → `8월 24일`. */
export function koreanDate(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  if (!m || !d) return isoDate;
  return `${Number(m)}월 ${Number(d)}일`;
}

/**
 * 채점 대기 현황 (DS-04 §1-5) — 빈 성적표가 **고장으로 보이지 않게** 하는 재료.
 * `첫 채점 예정일` 이 있으면 다시 올 이유가 생긴다.
 */
export function pendingScoring(picks: readonly ScorecardPick[], todayKst: string): PendingScoring {
  const mine = picks.filter((p) => p.pickType === "quiet");
  if (mine.length === 0) return { pending: 0, firstPublishedAt: null, firstScoringAt: null };
  const pending = mine.filter((p) => !p.returns["7"]).length;
  const firstPublishedAt = mine.reduce((min, p) => (p.date < min ? p.date : min), mine[0]!.date);
  const scoringAt = addDays(firstPublishedAt, FIRST_SCORING_DAYS);
  return {
    pending,
    firstPublishedAt,
    firstScoringAt: scoringAt > todayKst ? scoringAt : null,
  };
}

export interface SinceMove {
  /** 발행일 대비 현재 변동의 **중앙값**(%). 계산 대상이 없으면 null. */
  medianPct: number | null;
  /** 계산에 들어간 판단 수. */
  n: number;
}

/**
 * "우리가 짚은 뒤 지금까지" (DS-04 §1-5) — **채점 결과가 아니다.** 채점(고정 창 종가)이
 * 도래하지 않아도 이건 지금 계산할 수 있다. 화면에서 채점 결과와 반드시 구분해 표시한다.
 *
 * 종목마다 발행이 여러 번이면 **가장 오래된 발행가**를 기준으로 한 번만 센다 — 같은 종목을
 * 세 번 발행했다고 성적이 세 배로 반영되면 안 된다.
 */
export function sinceMove(
  picks: readonly ScorecardPick[],
  currentPriceOf: (canonical: string) => number | undefined
): SinceMove {
  const oldest = new Map<string, ScorecardPick>();
  for (const pick of picks) {
    if (pick.pickType !== "quiet") continue;
    if (!Number.isFinite(pick.priceAt) || pick.priceAt <= 0) continue;
    const prev = oldest.get(pick.canonical);
    if (!prev || pick.date < prev.date) oldest.set(pick.canonical, pick);
  }
  const returns: number[] = [];
  for (const [canonical, pick] of oldest) {
    const current = currentPriceOf(canonical);
    if (!Number.isFinite(current) || !current || current <= 0) continue;
    returns.push(((current - pick.priceAt) / pick.priceAt) * 100);
  }
  const median = medianOf(returns);
  return { medianPct: median === null ? null : Math.round(median * 10) / 10, n: returns.length };
}
