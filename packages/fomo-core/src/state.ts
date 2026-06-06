import type { FomoState, FomoFace } from "./types";
import { INDEX_THRESHOLDS } from "./constants/indexThresholds";

/**
 * FOMO Index(0~100) → 5구간 상태 + 마스코트 표정.
 * 경계값은 constants/indexThresholds.ts 에서 중앙 관리 — 한 곳만 수정하면 된다.
 */
interface StateBand {
  /** 구간 하한 (이상). */
  min: number;
  state: FomoState;
  face: FomoFace;
  emoji: string;
}

const BANDS: readonly StateBand[] = [
  { min: INDEX_THRESHOLDS.manic,   state: "광기",  face: "manic",   emoji: "🚀" },
  { min: INDEX_THRESHOLDS.fomo,    state: "FOMO",  face: "excited", emoji: "🔥" },
  { min: INDEX_THRESHOLDS.curious, state: "관심",  face: "curious", emoji: "👀" },
  { min: INDEX_THRESHOLDS.calm,    state: "관망",  face: "calm",    emoji: "🙂" },
  { min: INDEX_THRESHOLDS.sleepy,  state: "무관심", face: "sleepy",  emoji: "😴" },
] as const;

/** 점수를 0~100으로 보정. */
export function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function bandFor(score: number): StateBand {
  const s = clampScore(score);
  for (const band of BANDS) {
    if (s >= band.min) return band;
  }
  // BANDS의 마지막(min:0)이 항상 매칭되므로 도달하지 않음.
  return BANDS[BANDS.length - 1]!;
}

export function scoreToState(score: number): FomoState {
  return bandFor(score).state;
}

export function scoreToFace(score: number): FomoFace {
  return bandFor(score).face;
}

export function scoreToEmoji(score: number): string {
  return bandFor(score).emoji;
}
