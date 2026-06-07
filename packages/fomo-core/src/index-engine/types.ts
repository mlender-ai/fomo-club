/**
 * FOMO Index 산출 엔진 입력 타입.
 * 모든 입력은 부분/미비 가능 → 각 Heat 함수가 안전한 기본값으로 폴백한다.
 * docs/FOMO_INDEX.md 공식 참조.
 *
 * @author 안티그래비티
 * - HeatConfidence: 각 Heat 컴포넌트의 데이터 신뢰도 레벨 추가 (1-B 폴백 견고화)
 * - CommunitySignals: Reddit/소셜 멀티소스 확장 (1-A Community Heat 데이터 소스 확장)
 */

import type { EmotionType } from "../types";

// ---------------------------------------------------------------------------
// 1-B: 신뢰도 메타데이터 — 정직한 숫자 원칙
// ---------------------------------------------------------------------------

/**
 * 각 Heat 컴포넌트의 데이터 신뢰도 수준.
 *
 * - `high`:     실시간 데이터 소스 정상 연결, 최신 데이터 기반 산출.
 * - `medium`:   일부 데이터 소스 누락, 가용한 소스만으로 산출.
 * - `low`:      대부분 소스 실패, 캐시된 이전 값 또는 극히 제한된 데이터 사용.
 * - `fallback`: 전체 소스 미비/실패 → 중립 기본값(15/15/15/0) 사용.
 *
 * UI에서 이 레벨에 따라 "X시간 전 기준" 등 투명한 표기를 할 수 있다.
 */
export type HeatConfidence = "high" | "medium" | "low" | "fallback";

/**
 * HeatComponent에 대한 신뢰도 + 진단 메타데이터.
 * calculate 단계에서 각 Heat 함수의 결과에 병합된다.
 */
export interface HeatMeta {
  confidence: HeatConfidence;
  /** 총 가능 데이터 소스 수 (예: market 4개, community N개). */
  sourcesTotal: number;
  /** 실제로 유효한 값을 제공한 소스 수. */
  sourcesAvailable: number;
  /** 캐시 사용 시 타임스탬프(ISO 8601). 미사용이면 undefined. */
  cachedAt?: string;
}

// ---------------------------------------------------------------------------
// Heat 입력 타입
// ---------------------------------------------------------------------------

/** Market Heat 입력 (0~30). 거래량/거래대금/검색량/ETF 자금. 변화율(%) 단위. */
export interface MarketSignals {
  volumeChangePct?: number;
  turnoverChangePct?: number;
  searchChangePct?: number;
  etfInflowPct?: number;
}

/**
 * Community Heat 입력 (0~30).
 *
 * @author 안티그래비티 — 1-A Community Heat 데이터 소스 확장
 * 기존 mentionChangePct + bullishRatio에 Reddit 소스 추가.
 * last30days 패턴: engagement-weighted scoring (upvotes·comments 가중).
 */
export interface CommunitySignals {
  /** 소셜 언급량 변화율(%). 기존 단일 소스. */
  mentionChangePct?: number;
  /** bullish 게시물 비율 0~1 (To The Moon/All In 등). */
  bullishRatio?: number;
  /** Reddit 소스 집계 결과 (1-A 확장). */
  reddit?: RedditSignal[];
}

/**
 * Reddit Public JSON에서 추출한 개별 서브레딧 시그널.
 *
 * @author 안티그래비티
 * Reddit Public JSON API(무료, 키 불필요)를 통해 수집.
 * last30days 패턴: engagement-weighted scoring.
 */
export interface RedditSignal {
  /** 서브레딧 이름 (예: "wallstreetbets"). */
  subreddit: string;
  /** 수집 기간(24h) 내 관련 게시물 수. */
  postCount: number;
  /** 수집된 게시물의 총 upvote 수. */
  totalUpvotes: number;
  /** 수집된 게시물의 총 댓글 수. */
  totalComments: number;
  /** bullish 키워드 비율 (0~1). */
  bullishRatio: number;
  /** 수집 시각(ISO 8601). */
  fetchedAt: string;
}

/** Emotion Heat 입력 (0~30). 당일 감정 투표 집계 (감정별 표 수). */
export type EmotionTally = Partial<Record<EmotionType, number>>;

/** Whale Heat 입력 (0~10). 이벤트별 가중치. */
export interface WhaleEvent {
  /** 이벤트 가중치 (양수). 예: BTC 신고가 4, 대형 청산 3, Short Squeeze 3. */
  weight: number;
  label?: string;
}
