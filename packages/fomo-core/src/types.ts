/**
 * FOMO Club 핵심 타입.
 * docs/FOMO_INDEX.md (지표 정의) + docs/MASCOT.md (마스코트 색/표정) 기준.
 *
 * FOMO Index는 금융 지표가 아닌 감정 체감 지표(0~100)다.
 */

/** 사용자가 선택하는 감정 5종. docs/MASCOT.md §4. */
export type EmotionType = "fomo" | "fear" | "regret" | "greed" | "conviction";

export const EMOTION_TYPES: readonly EmotionType[] = [
  "fomo",
  "fear",
  "regret",
  "greed",
  "conviction",
] as const;

/** FOMO Index 5구간 상태 라벨. docs/FOMO_INDEX.md. */
export type FomoState = "무관심" | "관망" | "관심" | "FOMO" | "광기";

/** 마스코트 포모의 5표정 키. 5구간과 1:1 직결. docs/MASCOT.md §5. */
export type FomoFace = "sleepy" | "calm" | "curious" | "excited" | "manic";

/** FOMO Index를 구성하는 4개 Heat 컴포넌트. 가중치 30/30/30/10. */
export type HeatKey = "market" | "community" | "emotion" | "whale";

/**
 * @author 안티그래비티 — 1-B: HeatMeta(신뢰도) 필드 추가
 */
export interface HeatComponent {
  key: HeatKey;
  /** 산출 점수 (0 ~ max). */
  score: number;
  /** 컴포넌트 만점 (market/community/emotion=30, whale=10). */
  max: number;
  /** 데이터 신뢰도 + 진단 메타. UI에서 "X시간 전 기준" 표기용. */
  meta?: import("./index-engine/types").HeatMeta;
}

/** 하루치 FOMO Index 스냅샷의 코어 형태. */
export interface FomoIndex {
  /** YYYY-MM-DD */
  date: string;
  /** 0~100 */
  score: number;
  state: FomoState;
  components: HeatComponent[];
}

/** 익명 세션 기반 감정 투표. 웹/모바일 공통. 1세션 1일 1회. */
export interface EmotionVote {
  sessionId: string;
  emotion: EmotionType;
  source: "web" | "mobile";
  /** YYYY-MM-DD (1일 1회 제한용) */
  votedDate: string;
}

/**
 * 데일리 챌린지 상태 (P2). 익명 세션 기반, 1세션 1일 1챌린지.
 * accepted(수락) → completed(완료) 순으로 전이하며 완료 시 포인트가 적립된다.
 */
export interface ChallengeStatus {
  /** YYYY-MM-DD */
  date: string;
  /** 챌린지 수락 여부. */
  accepted: boolean;
  /** 챌린지 완료 여부. */
  completed: boolean;
  /** 이 챌린지로 적립된 포인트. */
  points: number;
}

/** 챌린지 상태 변경 액션. POST 본문 action 필드. */
export type ChallengeAction = "accept" | "complete";

/**
 * 감정 색상 체계 (검정 배경 위 포인트 색). docs/MASCOT.md §4.
 * FOMO=빨강 / 공포=파랑 / 후회=보라 / 탐욕=초록 / 확신=노랑.
 */
export const EMOTION_COLORS: Record<EmotionType, string> = {
  fomo: "#FF5A36", // 빨강~주황: 달아오르는 불꽃
  fear: "#38BDF8", // 파랑~청록: 얼어붙는 차가움
  regret: "#8B7CF6", // 보라~남색: 가라앉아 곱씹음
  greed: "#34D399", // 초록/황금: 돈의 욕망
  conviction: "#FACC15", // 노랑/밝은 골드: 또렷한 자신감
};

/** 감정 한글 라벨. */
export const EMOTION_LABELS: Record<EmotionType, string> = {
  fomo: "FOMO",
  fear: "공포",
  regret: "후회",
  greed: "탐욕",
  conviction: "확신",
};
