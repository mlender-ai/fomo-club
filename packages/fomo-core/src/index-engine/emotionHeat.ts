import type { HeatComponent } from "../types";
import type { EmotionTally } from "./types";

export const EMOTION_HEAT_MAX = 30;
const NEUTRAL = EMOTION_HEAT_MAX / 2;

/**
 * Emotion Heat (0~30): FOMO Club 사용자 당일 감정 투표 집계.
 * FOMO/탐욕 비중↑ → 상승, 공포/후회↑ → 하락. 확신은 중립.
 * 투표가 0건이면 중립값(15)으로 폴백 (정직한 숫자: 표가 없으면 과열로 보지 않음).
 */
export function emotionHeat(tally: EmotionTally = {}): HeatComponent {
  const fomo = tally.fomo ?? 0;
  const greed = tally.greed ?? 0;
  const fear = tally.fear ?? 0;
  const regret = tally.regret ?? 0;
  const conviction = tally.conviction ?? 0;

  const total = fomo + greed + fear + regret + conviction;
  if (total === 0) {
    return { key: "emotion", score: NEUTRAL, max: EMOTION_HEAT_MAX };
  }

  const bullish = fomo + greed;
  const bearish = fear + regret;
  // net ∈ [-1, 1] — 확신(conviction)은 분모에 포함되어 과열을 희석.
  const net = (bullish - bearish) / total;
  const score = Math.round(NEUTRAL + net * NEUTRAL);

  return { key: "emotion", score: clamp(score), max: EMOTION_HEAT_MAX };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(EMOTION_HEAT_MAX, n));
}
