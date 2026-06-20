import type { FomoIndex } from "../types";
import { scoreToEmoji } from "../state";
import type { EmotionTally } from "./types";
import { EMOTION_LABELS } from "../types";

/** 각 Heat 컴포넌트의 한글 레이블. */
const HEAT_LABELS: Record<string, string> = {
  market:    "시장",
  community: "커뮤니티",
  emotion:   "감정",
  whale:     "고래",
};

/**
 * FOMO Index 스냅샷 → AI Summary 1~2문장 (규칙 기반 폴백).
 * 외부 AI 런타임은 파이프라인/API 레이어에서 이 결과를 덮어쓸 수 있다(fomo-core는 순수 유지).
 * 투자 조언/단정 표현 금지 — 감정 체감 묘사만. regulation-reviewer 검사 대상.
 *
 * @author CEO Brief 2026-06-09 #428
 * 상위 2개 Heat 점수를 헤드라인에 포함해 3초 직관 이해도를 높인다.
 */
export function buildSummary(index: FomoIndex, tally: EmotionTally = {}): string {
  const emoji = scoreToEmoji(index.score);
  const moodLine = STATE_LINE[index.state];

  // 상위 2개 Heat를 점수 비율(%)로 표시 — "정직한 숫자" 원칙 준수.
  const topHeats = [...index.components]
    .filter((c) => c.max > 0)
    .map((c) => ({
      label: HEAT_LABELS[c.key] ?? c.key,
      pct: Math.round((c.score / c.max) * 100),
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 2);

  const heatLine = topHeats.map((h) => `${h.label} ${h.pct}%`).join(", ");

  // 정직한 숫자: 폴백이 3개 이상이면 데이터 한정 사실을 명시한다.
  const fallbackCount = index.components.filter((c) => c.meta?.confidence === "fallback").length;
  const qualifier = fallbackCount >= 3 ? " (데이터 제한적)" : "";

  const entries = (Object.entries(tally) as [keyof typeof EMOTION_LABELS, number][]).filter(
    ([, n]) => (n ?? 0) > 0
  );
  if (entries.length === 0) {
    return `${emoji} 오늘 시장 감정은 '${index.state}' — ${heatLine}${qualifier}. ${moodLine}`;
  }
  const [topEmotion] = entries.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]!;
  return `${emoji} 오늘 시장 감정은 '${index.state}' — ${heatLine}${qualifier}. 가장 많이 선택된 감정은 「${EMOTION_LABELS[topEmotion]}」이에요. ${moodLine}`;
}

const STATE_LINE: Record<FomoIndex["state"], string> = {
  무관심: "다들 잠잠한 하루예요.",
  관망: "관심은 있지만 서두르진 않는 분위기예요.",
  관심: "특정 종목·섹터로 시선이 모이고 있어요.",
  FOMO: "놓치기 싫은 마음이 커지는 중이에요. 당신만 그런 게 아니에요.",
  광기: "감정이 시장보다 앞서 달리는 날이에요. 잠깐 숨 고르기 좋아요.",
};
