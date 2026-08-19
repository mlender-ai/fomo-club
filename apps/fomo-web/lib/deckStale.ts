/**
 * 스테일 서빙 라벨 (DS-02 §9).
 *
 * 직전 페이로드를 그대로 보여주는 것은 정상 동작이다 — 다만 **언제 기준인지 밝힌다.**
 * 밝히지 않으면 사용자는 지금 시각의 사실로 읽는다. 값이 없거나 깨졌으면 아무 말도 하지
 * 않는다(지어내지 않는다).
 */

/** 이 시간이 지난 페이로드부터 기준 시각을 밝힌다. 그 안쪽은 잡음이라 붙이지 않는다. */
export const STALE_AFTER_MS = 60 * 60_000;

/** `2026-08-19T06:12:00Z` → `3시간 전 기준`. 1시간 미만이면 `null`. */
export function staleLabel(asOf: string | undefined, now: number): string | null {
  if (!asOf) return null;
  const at = Date.parse(asOf);
  if (!Number.isFinite(at)) return null;
  const age = now - at;
  if (age < STALE_AFTER_MS) return null;
  const hours = Math.floor(age / 3_600_000);
  if (hours < 24) return `${hours}시간 전 기준`;
  return `${Math.floor(hours / 24)}일 전 기준`;
}
