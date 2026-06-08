/**
 * FOMO Index 입력 데이터 검증/정제 유틸리티.
 *
 * 외부 소스(시장 API, 소셜, Reddit)에서 유입된 데이터가 의도적 조작이나
 * 오류 값을 포함할 경우 FOMO Index 신뢰성을 손상시킬 수 있다.
 * 이 모듈은 허용 범위 클램핑 + 이상치 탐지로 파이프라인 입력을 보호한다.
 * #397 — 데이터 주입 공격 방지
 */

import type { MarketSignals, CommunitySignals, RedditSignal } from "./types";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export interface ValidationResult<T> {
  data: T;
  /** 범위 초과·비정상값 발견 시 메시지 목록. 빈 배열이면 이상 없음. */
  anomalies: string[];
}

// ---------------------------------------------------------------------------
// 허용 범위 상수
// ---------------------------------------------------------------------------

/** 변화율(%) 허용 범위: -100%~+500% 밖은 API 오류나 주입 의심. */
const PCT_BOUNDS = { min: -100, max: 500 } as const;
/** 비율(0~1) 허용 범위. */
const RATIO_BOUNDS = { min: 0, max: 1 } as const;

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * 수치 필드 범위 검사 + 클램핑.
 * undefined/NaN은 그대로 undefined 반환 (anomaly 기록 없음).
 * 범위 초과 시 anomaly를 기록하고 클램핑된 값 반환.
 */
function checkAndClamp(
  v: number | undefined,
  name: string,
  bounds: { min: number; max: number },
  anomalies: string[]
): number | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  if (v < bounds.min || v > bounds.max) {
    anomalies.push(`${name}=${v} 범위 초과 [${bounds.min}, ${bounds.max}] — 클램핑`);
    return clamp(v, bounds.min, bounds.max);
  }
  return v;
}

// ---------------------------------------------------------------------------
// 공개 함수
// ---------------------------------------------------------------------------

/**
 * Market Heat 입력 정제.
 * 변화율이 허용 범위를 벗어나면 클램핑하고 anomalies에 기록한다.
 */
export function sanitizeMarketSignals(
  raw: Partial<MarketSignals>
): ValidationResult<Partial<MarketSignals>> {
  const anomalies: string[] = [];
  const data: Partial<MarketSignals> = {};

  const vol = checkAndClamp(raw.volumeChangePct,   "volumeChangePct",   PCT_BOUNDS, anomalies);
  const trn = checkAndClamp(raw.turnoverChangePct, "turnoverChangePct", PCT_BOUNDS, anomalies);
  const sch = checkAndClamp(raw.searchChangePct,   "searchChangePct",   PCT_BOUNDS, anomalies);
  const etf = checkAndClamp(raw.etfInflowPct,      "etfInflowPct",      PCT_BOUNDS, anomalies);

  if (vol !== undefined) data.volumeChangePct   = vol;
  if (trn !== undefined) data.turnoverChangePct = trn;
  if (sch !== undefined) data.searchChangePct   = sch;
  if (etf !== undefined) data.etfInflowPct      = etf;

  return { data, anomalies };
}

/**
 * Community Heat 입력 정제.
 * bullishRatio 범위 체크 + Reddit 신호 무결성 검사.
 */
export function sanitizeCommunitySignals(
  raw: Partial<CommunitySignals>
): ValidationResult<Partial<CommunitySignals>> {
  const anomalies: string[] = [];
  const data: Partial<CommunitySignals> = {};

  const mention = checkAndClamp(raw.mentionChangePct, "mentionChangePct", PCT_BOUNDS,   anomalies);
  const bullish  = checkAndClamp(raw.bullishRatio,    "bullishRatio",     RATIO_BOUNDS, anomalies);

  if (mention !== undefined) data.mentionChangePct = mention;
  if (bullish  !== undefined) data.bullishRatio    = bullish;

  if (raw.reddit && raw.reddit.length > 0) {
    const before = raw.reddit.length;
    data.reddit = raw.reddit.filter((s): s is RedditSignal => (
      typeof s.subreddit === "string" && s.subreddit.length > 0 &&
      Number.isFinite(s.postCount)     && s.postCount >= 0 &&
      Number.isFinite(s.totalUpvotes)  && s.totalUpvotes >= 0 &&
      Number.isFinite(s.totalComments) && s.totalComments >= 0 &&
      Number.isFinite(s.bullishRatio)  && s.bullishRatio >= 0 && s.bullishRatio <= 1
    ));
    const removed = before - data.reddit.length;
    if (removed > 0) {
      anomalies.push(`Reddit: ${removed}개 유효하지 않은 신호 제거`);
    }
  }

  return { data, anomalies };
}

/**
 * 이상치 급변 탐지.
 * current가 previous 대비 threshold 배 이상 크거나 작으면 이상치로 판단.
 * 급등(current/previous)과 급락(previous/current) 양방향을 모두 탐지한다.
 * 시계열 파이프라인에서 직전 값과 비교할 때 사용한다.
 */
export function detectSpikeAnomaly(
  current: number,
  previous: number,
  threshold = 3
): boolean {
  if (previous === 0) return current > 30;
  const ratio = current > previous ? current / previous : previous / current;
  return ratio > threshold;
}
