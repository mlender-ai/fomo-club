import type { EmotionType } from "../types";

/**
 * FOMO Index 산출 엔진 입력 타입.
 * 모든 입력은 부분/미비 가능 → 각 Heat 함수가 안전한 기본값으로 폴백한다.
 * docs/FOMO_INDEX.md 공식 참조.
 */

/** Market Heat 입력 (0~30). 거래량/거래대금/검색량/ETF 자금. 변화율(%) 단위. */
export interface MarketSignals {
  volumeChangePct?: number;
  turnoverChangePct?: number;
  searchChangePct?: number;
  etfInflowPct?: number;
}

/** Community Heat 입력 (0~30). 소셜 언급량 변화율 + bullish 비중(0~1). */
export interface CommunitySignals {
  mentionChangePct?: number;
  /** bullish 게시물 비율 0~1 (To The Moon/All In 등). */
  bullishRatio?: number;
}

/** Emotion Heat 입력 (0~30). 당일 감정 투표 집계 (감정별 표 수). */
export type EmotionTally = Partial<Record<EmotionType, number>>;

/** Whale Heat 입력 (0~10). 이벤트별 가중치. */
export interface WhaleEvent {
  /** 이벤트 가중치 (양수). 예: BTC 신고가 4, 대형 청산 3, Short Squeeze 3. */
  weight: number;
  label?: string;
}
