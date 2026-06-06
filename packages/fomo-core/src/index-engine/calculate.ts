import type { FomoIndex, HeatComponent } from "../types";
import { scoreToState } from "../state";
import { marketHeat } from "./marketHeat";
import { communityHeat } from "./communityHeat";
import { emotionHeat } from "./emotionHeat";
import { whaleHeat } from "./whaleHeat";
import { sanitizeComponents, getFallbackComponents } from "./fallback";
import type { MarketSignals, CommunitySignals, EmotionTally, WhaleEvent } from "./types";

export interface FomoIndexInputs {
  market?: MarketSignals;
  community?: CommunitySignals;
  emotion?: EmotionTally;
  whale?: WhaleEvent[];
}

/**
 * 4개 Heat를 합산하여 FOMO Index(0~100) + 상태를 산출한다.
 * Market 30 + Community 30 + Emotion 30 + Whale 10. docs/FOMO_INDEX.md.
 * 모든 입력 미비 시에도 중립 스냅샷을 반환한다(절대 에러 없음).
 * 산출 중 이상값이 감지되면 sanitizeComponents()로 폴백 처리한다.
 */
export function computeFomoIndex(inputs: FomoIndexInputs, date: string): FomoIndex {
  let components: HeatComponent[];
  try {
    components = sanitizeComponents([
      marketHeat(inputs.market),
      communityHeat(inputs.community),
      emotionHeat(inputs.emotion),
      whaleHeat(inputs.whale),
    ]);
  } catch (err) {
    console.warn("[fomo-core] computeFomoIndex: heat calculation failed, using fallback", err);
    components = getFallbackComponents();
  }
  const score = components.reduce((acc, c) => acc + c.score, 0);
  return { date, score, state: scoreToState(score), components };
}
