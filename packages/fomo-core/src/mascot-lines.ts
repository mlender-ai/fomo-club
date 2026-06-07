import type { EmotionType, FomoState } from "./types";

/**
 * 포모의 담담한 한마디. docs/IDENTITY_AND_MILESTONES.md §2.1 "담담한 솔직함".
 * 가짜 긍정("곧 반등")❌ / 거침("존버 가즈아")❌ / 투자 조언·단정❌.
 * 사실을 담담히 인정하고 "너만 그런 거 아니야"를 조용히 전한다.
 * lovable-reviewer + regulation-reviewer 검사 대상.
 */

// 1단계 — 시장의 포모(진입 직후, FOMO Index 상태별 idle 멘트)
const MARKET_LINES: Record<FomoState, string> = {
  무관심: "오늘은 다들 조용하네. 잠깐 쉬어가도 되는 날이야.",
  관망: "딱히 큰일은 없어. 그냥 같이 지켜보는 중이야.",
  관심: "사람들 시선이 한쪽으로 모이고 있어. 너도 느껴지지.",
  FOMO: "다들 들떠 있어. 놓치기 싫은 마음, 너만 그런 거 아니야.",
  광기: "오늘은 감정이 시장보다 앞서 달리는 날이야. 잠깐 숨 고르자.",
};

// 2단계 — 나의 포모(감정 선택에 대한 담담한 반응)
const MINE_LINES: Record<EmotionType, string> = {
  fomo: "놓친 것 같아 조급하지. 그 마음 알아. 너만 그런 거 아니야.",
  fear: "무서울 수 있어. 다들 들떠 있어도 너는 그럴 수 있어. 그래도 괜찮아.",
  regret: "이미 지난 건 어쩔 수 없지. 오늘 여기 와준 것만으로 충분해.",
  greed: "더 갖고 싶은 마음, 자연스러워. 잠깐 천천히 가도 돼.",
  conviction: "오늘은 마음이 또렷하구나. 그 느낌, 기억해 둬.",
};

export function marketLine(state: FomoState): string {
  return MARKET_LINES[state];
}

export function mineLine(emotion: EmotionType): string {
  return MINE_LINES[emotion];
}

/**
 * 잔잔한 날 = 치유의 날 (M2). docs/IDENTITY_AND_MILESTONES.md §M2.
 * 변동성 없는 날에도 포모를 열 이유 — 회복적 공감(잘 버팀/의연함).
 * 투자 조언·종목 언급 ❌ / 차트에서 벗어나 마음을 돌보는 담담한 한마디 ⭕.
 * regulation-reviewer + lovable-reviewer 검사 대상.
 */
const RESTORATIVE_LINES: readonly string[] = [
  "오늘은 시장도 한 박자 쉬어가는 날. 차트 잠깐 덮어두고 숨 한 번 쉬자.",
  "조용한 하루야. 잘 버텨온 너를, 오늘은 좀 쉬게 해줘도 돼.",
  "큰일 없는 날. 이런 하루하루가 사실 마음이 회복되는 시간이야.",
  "오늘은 멀리서 지켜보는 날. 아무것도 안 해도 괜찮아.",
  "잔잔한 날엔 잔잔하게. 산책 한 바퀴, 물 한 잔. 그거면 충분해.",
  "시장이 조용할 땐 마음도 정리하기 좋아. 오늘 네 기분은 어땠어?",
  "무던한 하루를 버티는 것도 실력이야. 너, 잘하고 있어.",
] as const;

/** 잔잔한 날(낮은 FOMO Index)인지 — 무관심/관망 구간. */
export function isCalmDay(state: FomoState): boolean {
  return state === "무관심" || state === "관망";
}

/**
 * 그날의 회복 콘텐츠 한 줄. 날짜("YYYY-MM-DD") 기반 결정적 선택 →
 * 같은 날 새로고침해도 동일, 매일은 달라져 "돌아올 이유"가 된다.
 */
export function restorativeLine(date: string): string {
  let sum = 0;
  for (let i = 0; i < date.length; i++) sum += date.charCodeAt(i);
  return RESTORATIVE_LINES[sum % RESTORATIVE_LINES.length]!;
}
