import type { FomoIndex } from "../types";
import { scoreToEmoji } from "../state";
import type { EmotionTally } from "./types";
import { EMOTION_LABELS } from "../types";

/**
 * FOMO Index 스냅샷 → AI Summary 1~2문장 (규칙 기반 폴백).
 * 외부 AI 런타임은 파이프라인/API 레이어에서 이 결과를 덮어쓸 수 있다(fomo-core는 순수 유지).
 * 투자 조언/단정 표현 금지 — 감정 체감 묘사만. regulation-reviewer 검사 대상.
 */
export function buildSummary(index: FomoIndex, tally: EmotionTally = {}): string {
  const emoji = scoreToEmoji(index.score);
  const moodLine = STATE_LINE[index.state];

  const entries = (Object.entries(tally) as [keyof typeof EMOTION_LABELS, number][]).filter(
    ([, n]) => (n ?? 0) > 0
  );
  if (entries.length === 0) {
    return `${emoji} 오늘 시장 감정은 '${index.state}' 부근입니다. ${moodLine}`;
  }
  const [topEmotion] = entries.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]!;
  return `${emoji} 오늘 시장 감정은 '${index.state}'. 가장 많이 선택된 감정은 「${EMOTION_LABELS[topEmotion]}」이에요. ${moodLine}`;
}

const STATE_LINE: Record<FomoIndex["state"], string> = {
  무관심: "다들 잠잠한 하루예요.",
  관망: "관심은 있지만 서두르진 않는 분위기예요.",
  관심: "특정 종목·섹터로 시선이 모이고 있어요.",
  FOMO: "놓치기 싫은 마음이 커지는 중이에요. 당신만 그런 게 아니에요.",
  광기: "감정이 시장보다 앞서 달리는 날이에요. 잠깐 숨 고르기 좋아요.",
};
