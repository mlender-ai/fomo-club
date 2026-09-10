/**
 * 감정 치환 — 피드 감정 카테고리 타입. docs/PIVOT_FEED_FIRST.md.
 *
 * 시장 뉴스/커뮤니티를 "정보"가 아니라 "감정"으로 치환해 보여준다.
 * 피드 카테고리는 사용자 투표 감정(EmotionType)과 별개 축이다:
 * 투표의 "확신(conviction)" 대신 수동 소비에 맞는 "환희(joy)"를 쓴다.
 */

export type FeedEmotion = "fomo" | "fear" | "joy" | "regret" | "greed";

export const FEED_EMOTIONS: readonly FeedEmotion[] = [
  "fomo",
  "fear",
  "joy",
  "regret",
  "greed",
] as const;

export const FEED_EMOTION_LABELS: Record<FeedEmotion, string> = {
  fomo: "포모",
  fear: "공포",
  joy: "환희",
  regret: "후회",
  greed: "탐욕",
};

/** 감정 색 — docs/MASCOT.md §4 색 체계 재사용(환희=확신의 노랑 계열). */
export const FEED_EMOTION_COLORS: Record<FeedEmotion, string> = {
  fomo: "#FF5A36",
  fear: "#38BDF8",
  joy: "#FACC15",
  regret: "#8B7CF6",
  greed: "#34D399",
};

/** 감정으로 치환된 피드 카드. 정보가 아니라 감정이 주인공 — 수치는 근거로 작게. */
export interface EmotionCard {
  /** 안정 식별자. */
  id: string;
  emotion: FeedEmotion;
  /** 감정 치환 한 줄 (메인). 투자 조언·단정 금지, "너만 그런 거 아니야"의 결. */
  headline: string;
  /** 근거 — 출처/수치를 작게. 없으면 분위기 카드. */
  evidence?: {
    label: string;
    value?: string;
    sourceUrl?: string;
  };
  /** 분류 신뢰도 0~1. 낮으면 노출하지 않는다(잘못 분류된 카드 1개가 신뢰를 깬다). */
  confidence: number;
}

/** 노출 최소 신뢰도 — 이 미만은 피드에 싣지 않는다. 보수적으로. */
export const FEED_CONFIDENCE_THRESHOLD = 0.6;
