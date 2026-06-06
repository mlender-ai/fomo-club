import type { HeatComponent } from "../types";
import { MARKET_HEAT_MAX } from "./marketHeat";

const COMMUNITY_HEAT_MAX = 30;
const EMOTION_HEAT_MAX = 30;
const WHALE_HEAT_MAX = 10;

/**
 * 4 Heat 컴포넌트의 안전한 폴백 기본값.
 * Heat 입력이 null/undefined 또는 산출 중 예외가 발생해도
 * 사용자에게 빈 화면이나 에러를 노출하지 않는다 (CEO Standing Constraints).
 *
 * 기본값 설계 근거:
 *  - Market/Community/Emotion: 중립값 (각 max의 50%) — 과열도 과냉도 없는 관망 신호
 *  - Whale: 0 — 고래 이벤트 없음이 기본 상태
 */
export function getFallbackComponents(): HeatComponent[] {
  return [
    { key: "market",    score: Math.round(MARKET_HEAT_MAX / 2),    max: MARKET_HEAT_MAX },
    { key: "community", score: Math.round(COMMUNITY_HEAT_MAX / 2), max: COMMUNITY_HEAT_MAX },
    { key: "emotion",   score: Math.round(EMOTION_HEAT_MAX / 2),   max: EMOTION_HEAT_MAX },
    { key: "whale",     score: 0,                                    max: WHALE_HEAT_MAX },
  ];
}

/**
 * 개별 HeatComponent 값이 유효한지 검증.
 * 음수·NaN·max 초과는 모두 잘못된 값으로 간주한다.
 */
export function isValidHeatComponent(c: HeatComponent): boolean {
  return (
    Number.isFinite(c.score) &&
    c.score >= 0 &&
    c.score <= c.max
  );
}

/**
 * components 배열에서 유효하지 않은 항목을 폴백값으로 교체한다.
 * 데이터 파이프라인 중간에 오염된 Heat를 안전하게 복구한다.
 */
export function sanitizeComponents(components: HeatComponent[]): HeatComponent[] {
  const fallbacks = getFallbackComponents();
  return components.map((c) => {
    if (isValidHeatComponent(c)) return c;
    console.warn(`[fomo-core] invalid heat component key=${c.key} score=${c.score} — using fallback`);
    return fallbacks.find((f) => f.key === c.key) ?? c;
  });
}
