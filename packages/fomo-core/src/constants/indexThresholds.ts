/**
 * FOMO Index 5구간 상·하한 기준값.
 * docs/FOMO_INDEX.md 스케일 정의와 마스코트 표정 매핑을 외부화한 단일 진실의 원천.
 * 경계값을 바꿀 때는 이 파일 하나만 수정하면 state.ts + UI가 함께 따라온다.
 */
export const INDEX_THRESHOLDS = {
  /** 각 구간의 하한(이상). BANDS 순서와 1:1 대응. */
  manic: 81,      // 81~100: 광기
  fomo: 61,       // 61~80: FOMO
  curious: 41,    // 41~60: 관심
  calm: 21,       // 21~40: 관망
  sleepy: 0,      // 0~20:  무관심
} as const;

export type IndexThresholdKey = keyof typeof INDEX_THRESHOLDS;

/**
 * 도움말 텍스트: 홈 화면 FOMO Index 하단 설명 문구.
 * 사용자가 "왜 이 표정인지" 3초 안에 이해할 수 있도록 설계.
 */
export const INDEX_HINT_TEXT: Record<string, string> = {
  "무관심": "현재 이 구간은 시장 참여자들이 느끼는 FOMO가 매우 낮음을 나타냅니다.",
  "관망":   "시장의 관심이 조금씩 깨어나는 구간입니다. 참여자들은 아직 관망 중입니다.",
  "관심":   "시장에 관심이 모이고 있습니다. 감정이 서서히 달아오르는 신호입니다.",
  "FOMO":   "많은 참여자가 놓칠까 봐 불안해하는 구간입니다. 감정이 고조되고 있습니다.",
  "광기":   "극도로 달아오른 구간입니다. 참여자 대부분이 FOMO를 강하게 느끼고 있습니다.",
} as const;
