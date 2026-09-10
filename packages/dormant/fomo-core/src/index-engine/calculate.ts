import type { FomoIndex, HeatComponent, HeatKey } from "../types";
import { scoreToState } from "../state";
import { marketHeat } from "./marketHeat";
import { communityHeat } from "./communityHeat";
import { emotionHeat } from "./emotionHeat";
import { whaleHeat } from "./whaleHeat";
import type { MarketSignals, CommunitySignals, EmotionTally, WhaleEvent } from "./types";

export interface FomoIndexInputs {
  market?: MarketSignals;
  community?: CommunitySignals;
  emotion?: EmotionTally;
  whale?: WhaleEvent[];
}

/** 각 Heat 호출을 격리 — 한 Heat 실패 시 나머지 Heat는 정상 산출을 이어간다. */
function safeHeat(
  key: string,
  fn: () => HeatComponent,
  fallback: HeatComponent
): HeatComponent {
  try {
    return fn();
  } catch (err) {
    console.warn(`[fomo-core/computeFomoIndex] ${key} 산출 실패, 폴백 사용`, err);
    return fallback;
  }
}

/**
 * 4개 Heat를 합산하여 FOMO Index(0~100) + 상태를 산출한다.
 * Market 30 + Community 30 + Emotion 30 + Whale 10. docs/FOMO_INDEX.md.
 * 모든 입력 미비 시에도 중립 스냅샷을 반환한다(절대 에러 없음).
 */
export function computeFomoIndex(inputs: FomoIndexInputs, date: string): FomoIndex {
  const fallbackHeat = (key: HeatKey, max: number): HeatComponent => ({
    key,
    score: key === "whale" ? 0 : max / 2,
    max,
    meta: { confidence: "fallback", sourcesTotal: 1, sourcesAvailable: 0 },
  });

  const components: HeatComponent[] = [
    safeHeat("market",    () => marketHeat(inputs.market),       fallbackHeat("market",    30)),
    safeHeat("community", () => communityHeat(inputs.community), fallbackHeat("community", 30)),
    safeHeat("emotion",   () => emotionHeat(inputs.emotion),     fallbackHeat("emotion",   30)),
    safeHeat("whale",     () => whaleHeat(inputs.whale),         fallbackHeat("whale",     10)),
  ];
  const score = components.reduce((acc, c) => acc + c.score, 0);
  return { date, score, state: scoreToState(score), components };
}
