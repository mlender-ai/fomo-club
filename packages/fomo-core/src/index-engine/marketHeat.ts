/**
 * Market Heat (0~30): 거래량·거래대금·검색량·ETF 유입의 평균 강도.
 *
 * @author 안티그래비티 — 1-B: HeatMeta(신뢰도 레벨) 반환 추가
 * 기존 로직 변경 없이 meta 필드만 병합.
 */

import type { HeatComponent } from "../types";
import type { MarketSignals, HeatMeta, HeatConfidence } from "./types";

export const MARKET_HEAT_MAX = 30;
const NEUTRAL = MARKET_HEAT_MAX / 2; // 데이터 미비 시 중립값(인위적 과열/과냉 방지)

/** 변화율(%)을 0~1 강도로 변환. +100%에서 포화. 음수는 0으로 수렴. */
function intensity(pct: number | undefined): number | null {
  if (pct == null || Number.isNaN(pct)) return null;
  return Math.max(0, Math.min(1, (pct + 50) / 150)); // -50% → 0, +100% → 1, 0% → 0.33
}

function determineConfidence(available: number, total: number): HeatConfidence {
  if (available === 0) return "fallback";
  const ratio = available / total;
  if (ratio >= 0.75) return "high";
  if (ratio >= 0.4) return "medium";
  return "low";
}

/**
 * Market Heat (0~30): 거래량·거래대금·검색량·ETF 유입의 평균 강도.
 * 신호가 하나도 없으면 중립값(15)으로 폴백. 절대 에러/빈값 노출 금지.
 */
export function marketHeat(signals: MarketSignals = {}): HeatComponent {
  const parts = [
    intensity(signals.volumeChangePct),
    intensity(signals.turnoverChangePct),
    intensity(signals.searchChangePct),
    intensity(signals.etfInflowPct),
  ].filter((v): v is number => v != null);

  const SOURCES_TOTAL = 4;
  const sourcesAvailable = parts.length;

  const score =
    parts.length === 0
      ? NEUTRAL
      : Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * MARKET_HEAT_MAX);

  const meta: HeatMeta = {
    confidence: determineConfidence(sourcesAvailable, SOURCES_TOTAL),
    sourcesTotal: SOURCES_TOTAL,
    sourcesAvailable,
  };

  return { key: "market", score: clamp(score), max: MARKET_HEAT_MAX, meta };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(MARKET_HEAT_MAX, n));
}
