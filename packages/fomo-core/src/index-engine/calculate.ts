import type { FomoIndex, HeatComponent } from "../types";
import { scoreToState } from "../state";
import { marketHeat, MARKET_HEAT_MAX } from "./marketHeat";
import { communityHeat, COMMUNITY_HEAT_MAX } from "./communityHeat";
import { emotionHeat, EMOTION_HEAT_MAX } from "./emotionHeat";
import { whaleHeat, WHALE_HEAT_MAX } from "./whaleHeat";
import type { MarketSignals, CommunitySignals, EmotionTally, WhaleEvent } from "./types";

export interface FomoIndexInputs {
  market?: MarketSignals;
  community?: CommunitySignals;
  emotion?: EmotionTally;
  whale?: WhaleEvent[];
}

/** 데이터 소스 오류 시 사용하는 안전한 중립 기본값. */
const FALLBACK_COMPONENTS: HeatComponent[] = [
  { key: "market", score: MARKET_HEAT_MAX / 2, max: MARKET_HEAT_MAX, meta: { confidence: "fallback", sourcesTotal: 4, sourcesAvailable: 0 } },
  { key: "community", score: COMMUNITY_HEAT_MAX / 2, max: COMMUNITY_HEAT_MAX, meta: { confidence: "fallback", sourcesTotal: 3, sourcesAvailable: 0 } },
  { key: "emotion", score: EMOTION_HEAT_MAX / 2, max: EMOTION_HEAT_MAX, meta: { confidence: "fallback", sourcesTotal: 1, sourcesAvailable: 0 } },
  { key: "whale", score: 0, max: WHALE_HEAT_MAX, meta: { confidence: "fallback", sourcesTotal: 1, sourcesAvailable: 0 } },
];

function safeHeat<T>(fn: (input: T | undefined) => HeatComponent, input: T | undefined, fallback: HeatComponent): HeatComponent {
  try {
    return fn(input);
  } catch (err) {
    console.warn(`[fomo-core] ${fallback.key}Heat 산출 오류 — 폴백 적용`, err);
    return fallback;
  }
}

/**
 * 4개 Heat를 합산하여 FOMO Index(0~100) + 상태를 산출한다.
 * Market 30 + Community 30 + Emotion 30 + Whale 10. docs/FOMO_INDEX.md.
 * 데이터 소스 오류 시 개별 Heat를 폴백 값으로 대체하고 파이프라인을 중단하지 않는다.
 */
export function computeFomoIndex(inputs: FomoIndexInputs, date: string): FomoIndex {
  const components: HeatComponent[] = [
    safeHeat(marketHeat, inputs.market, FALLBACK_COMPONENTS[0]!),
    safeHeat(communityHeat, inputs.community, FALLBACK_COMPONENTS[1]!),
    safeHeat(emotionHeat, inputs.emotion, FALLBACK_COMPONENTS[2]!),
    safeHeat((w) => whaleHeat(w), inputs.whale, FALLBACK_COMPONENTS[3]!),
  ];
  const score = components.reduce((acc, c) => acc + c.score, 0);
  return { date, score, state: scoreToState(score), components };
}
