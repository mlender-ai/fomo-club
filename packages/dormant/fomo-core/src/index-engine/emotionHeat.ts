/**
 * Emotion Heat (0~30): FOMO Club 사용자 당일 감정 투표 집계.
 *
 * @author 안티그래비티 — 1-B: HeatMeta(신뢰도 레벨) 반환 추가
 * 기존 로직 변경 없이 meta 필드만 병합.
 * 투표 총 수를 sourcesAvailable로 반영하여 표본 크기 투명성 확보.
 */

import type { HeatComponent } from "../types";
import type { EmotionTally, HeatMeta, HeatConfidence } from "./types";

export const EMOTION_HEAT_MAX = 30;
const NEUTRAL = EMOTION_HEAT_MAX / 2;

/**
 * 투표 총 수 기반 신뢰도.
 * 투표가 많을수록 대표성이 높다 (감정 집계 특성).
 */
function voteConfidence(total: number): HeatConfidence {
  if (total === 0) return "fallback";
  if (total >= 50) return "high";
  if (total >= 10) return "medium";
  return "low";
}

/**
 * Emotion Heat (0~30): FOMO Club 사용자 당일 감정 투표 집계.
 * FOMO/탐욕 비중↑ → 상승, 공포/후회↑ → 하락. 확신은 중립.
 * 투표가 0건이면 중립값(15)으로 폴백 (정직한 숫자: 표가 없으면 과열로 보지 않음).
 */
export function emotionHeat(tally: EmotionTally = {}): HeatComponent {
  try {
    const fomo = tally.fomo ?? 0;
    const greed = tally.greed ?? 0;
    const fear = tally.fear ?? 0;
    const regret = tally.regret ?? 0;
    const conviction = tally.conviction ?? 0;

    const total = fomo + greed + fear + regret + conviction;

    if (total === 0) {
      const meta: HeatMeta = {
        confidence: "fallback",
        sourcesTotal: 1, // 단일 소스: 사용자 투표
        sourcesAvailable: 0,
      };
      return { key: "emotion", score: NEUTRAL, max: EMOTION_HEAT_MAX, meta };
    }

    const bullish = fomo + greed;
    const bearish = fear + regret;
    // net ∈ [-1, 1] — 확신(conviction)은 분모에 포함되어 과열을 희석.
    const net = (bullish - bearish) / total;
    const score = Math.round(NEUTRAL + net * NEUTRAL);

    const meta: HeatMeta = {
      confidence: voteConfidence(total),
      sourcesTotal: 1,
      sourcesAvailable: 1,
    };

    return { key: "emotion", score: clamp(score), max: EMOTION_HEAT_MAX, meta };
  } catch (err) {
    console.warn("[fomo-core/emotionHeat] unexpected error, using fallback", err);
    return {
      key: "emotion",
      score: NEUTRAL,
      max: EMOTION_HEAT_MAX,
      meta: { confidence: "fallback", sourcesTotal: 1, sourcesAvailable: 0 },
    };
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(EMOTION_HEAT_MAX, n));
}
