import type { HeatComponent } from "../types";
import type { WhaleEvent } from "./types";

export const WHALE_HEAT_MAX = 10;

/**
 * Whale Heat (0~10): 대형 청산 위기, ETF 대규모 유입, BTC 신고가, 섹터 급등, Short Squeeze 등
 * 이벤트 가중치 합. 이벤트가 없으면 0 (보너스성 Heat이므로 부재는 0이 안전한 기본값).
 */
export function whaleHeat(events: WhaleEvent[] = []): HeatComponent {
  const sum = events.reduce((acc, e) => acc + (Number.isFinite(e.weight) ? Math.max(0, e.weight) : 0), 0);
  return { key: "whale", score: clamp(Math.round(sum)), max: WHALE_HEAT_MAX };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(WHALE_HEAT_MAX, n));
}
