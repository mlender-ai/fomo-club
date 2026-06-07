import { EMOTION_COLORS } from "@fomo/core";

/**
 * 시장의 포모 glow — FOMO Index 점수에 따른 배경광 색.
 * 지수가 높을수록 옅은 따뜻함(달아오름), 낮으면 차분(무채색~없음).
 * 게이트(1단계)와 홈이 공유. docs/MASCOT.md 색 체계.
 */
export function stateGlow(score: number): string | undefined {
  if (score >= 61) return EMOTION_COLORS.fomo; // 달아오름
  if (score >= 41) return "#5A5A5A"; // 관심 — 옅은 무채색
  return undefined; // 관망/무관심 — 잔잔, glow 없음
}
