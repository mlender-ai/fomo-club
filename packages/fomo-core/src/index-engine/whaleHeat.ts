/**
 * Whale Heat (0~10): 대형 이벤트 보너스.
 *
 * @author 안티그래비티 — 1-B: HeatMeta(신뢰도 레벨) 반환 추가
 * 기존 로직 변경 없이 meta 필드만 병합.
 * Whale Heat는 보너스성이므로 이벤트 부재 = 0이 올바른 기본값.
 */

import type { HeatComponent } from "../types";
import type { WhaleEvent, HeatMeta } from "./types";

export const WHALE_HEAT_MAX = 10;

/**
 * Whale Heat (0~10): 대형 청산 위기, ETF 대규모 유입, BTC 신고가, 섹터 급등, Short Squeeze 등
 * 이벤트 가중치 합. 이벤트가 없으면 0 (보너스성 Heat이므로 부재는 0이 안전한 기본값).
 */
export function whaleHeat(events: WhaleEvent[] = []): HeatComponent {
  try {
    const validEvents = events.filter((e) => Number.isFinite(e.weight) && e.weight > 0);
    const sum = validEvents.reduce((acc, e) => acc + e.weight, 0);

    const meta: HeatMeta = {
      confidence: validEvents.length > 0 ? "high" : "fallback",
      sourcesTotal: 1, // 단일 소스: 이벤트 피드
      sourcesAvailable: validEvents.length > 0 ? 1 : 0,
    };

    return { key: "whale", score: clamp(Math.round(sum)), max: WHALE_HEAT_MAX, meta };
  } catch (err) {
    console.warn("[fomo-core/whaleHeat] unexpected error, using fallback", err);
    return {
      key: "whale",
      score: 0,
      max: WHALE_HEAT_MAX,
      meta: { confidence: "fallback", sourcesTotal: 1, sourcesAvailable: 0 },
    };
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(WHALE_HEAT_MAX, n));
}
