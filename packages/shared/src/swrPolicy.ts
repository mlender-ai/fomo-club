// stale-while-revalidate 결정 로직 — 컴포넌트와 분리해 회귀 봉쇄.
// dataAt(ISO 8601) 기준 freshness를 평가해 fetch 동작을 결정.

import { classifyFreshness } from "./staleness.js";

export type FetchAction =
  | "skip"                  // 캐시 fresh이고 force=false → fetch 전혀 안 함
  | "background-revalidate" // 캐시 stale → 캐시 즉시 표시 + 백그라운드 fetch
  | "fetch-blocking";       // 캐시 expired/없음 → loading=true 후 fetch

export interface SwrInput {
  cachedDataAt: string | null | undefined; // 캐시된 응답의 dataAt
  force: boolean;                          // RefreshControl 등 명시적 새로고침
  now: number;
  freshTtlMs: number;
  staleTtlMs: number;
}

export function decideSwrAction(input: SwrInput): FetchAction {
  if (input.force) return "fetch-blocking";
  if (!input.cachedDataAt) return "fetch-blocking";

  const freshness = classifyFreshness(
    input.cachedDataAt,
    input.now,
    input.freshTtlMs,
    input.staleTtlMs
  );

  if (freshness === "fresh") return "skip";
  if (freshness === "stale") return "background-revalidate";
  return "fetch-blocking";
}
