import type { HeatComponent } from "../types";
import type { CommunitySignals } from "./types";

export const COMMUNITY_HEAT_MAX = 30;
const NEUTRAL = COMMUNITY_HEAT_MAX / 2;

/**
 * Community Heat (0~30): 소셜 언급량 변화율 + bullish 비중의 결합.
 * 초기엔 단순 소스/mock 가능. 신호 없으면 중립값 폴백.
 */
export function communityHeat(signals: CommunitySignals = {}): HeatComponent {
  const mention =
    signals.mentionChangePct == null || Number.isNaN(signals.mentionChangePct)
      ? null
      : Math.max(0, Math.min(1, (signals.mentionChangePct + 50) / 150));

  const bullish =
    signals.bullishRatio == null || Number.isNaN(signals.bullishRatio)
      ? null
      : Math.max(0, Math.min(1, signals.bullishRatio));

  const parts = [mention, bullish].filter((v): v is number => v != null);
  const score =
    parts.length === 0
      ? NEUTRAL
      : Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * COMMUNITY_HEAT_MAX);

  return { key: "community", score: clamp(score), max: COMMUNITY_HEAT_MAX };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(COMMUNITY_HEAT_MAX, n));
}
