import type { FomoIndex, HeatKey } from "../types";
import { scoreToEmoji } from "../state";
import type { EmotionTally } from "./types";
import { EMOTION_LABELS } from "../types";

const HEAT_LABELS: Record<HeatKey, string> = {
  market: "시장",
  community: "커뮤니티",
  emotion: "감정",
  whale: "고래",
};

/**
 * FOMO Index 상위 2개 Heat 컴포넌트를 "라벨(비율%)" 형식으로 요약.
 * components가 없으면 빈 문자열 반환.
 */
function topHeatContext(index: FomoIndex): string {
  if (!index.components || index.components.length === 0) return "";
  const sorted = [...index.components]
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score / b.max - a.score / a.max)
    .slice(0, 2);
  if (sorted.length === 0) return "";
  const parts = sorted.map((c) => {
    const pct = Math.round((c.score / c.max) * 100);
    return `${HEAT_LABELS[c.key]} ${pct}%`;
  });
  return `(${parts.join(", ")})`;
}

/**
 * FOMO Index 스냅샷 → AI Summary 1~2문장 (규칙 기반 폴백).
 * 외부 AI 런타임은 파이프라인/API 레이어에서 이 결과를 덮어쓸 수 있다(fomo-core는 순수 유지).
 * 투자 조언/단정 표현 금지 — 감정 체감 묘사만. regulation-reviewer 검사 대상.
 */
export function buildSummary(index: FomoIndex, tally: EmotionTally = {}): string {
  const emoji = scoreToEmoji(index.score);
  const moodLine = STATE_LINE[index.state];
  const heatCtx = topHeatContext(index);

  const entries = (Object.entries(tally) as [keyof typeof EMOTION_LABELS, number][]).filter(
    ([, n]) => (n ?? 0) > 0
  );

  if (entries.length === 0) {
    return `${emoji} 오늘 시장은 '${index.state}'${heatCtx ? " " + heatCtx : ""}. ${moodLine}`;
  }

  const [topEmotion] = entries.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]!;
  return `${emoji} 오늘 시장은 '${index.state}'${heatCtx ? " " + heatCtx : ""}. 가장 많이 선택된 감정은 「${EMOTION_LABELS[topEmotion]}」이에요. ${moodLine}`;
}

/**
 * FOMO Index 헤드라인 — 숫자 옆에서 현재 온도를 3초 안에 직관적으로 전달.
 * 상위 2개 Heat 분포를 포함해 "왜 이 지수인지"를 담백하게 설명한다.
 * 투자 조언·단정 금지. docs/FOMO_INDEX.md.
 */
export function buildHeadline(index: FomoIndex): string {
  const heatCtx = topHeatContext(index);
  const base = HEADLINE_LINE[index.state];
  return heatCtx ? `${base} — ${heatCtx}` : base;
}

const HEADLINE_LINE: Record<FomoIndex["state"], string> = {
  무관심: "오늘 시장은 침착",
  관망: "잔잔하게 관망 중",
  관심: "조금씩 달아오르는 중",
  FOMO: "다들 들떠 있어요",
  광기: "감정이 시장보다 앞서요",
};

const STATE_LINE: Record<FomoIndex["state"], string> = {
  무관심: "다들 잠잠한 하루예요.",
  관망: "관심은 있지만 서두르진 않는 분위기예요.",
  관심: "특정 종목·섹터로 시선이 모이고 있어요.",
  FOMO: "놓치기 싫은 마음이 커지는 중이에요. 당신만 그런 게 아니에요.",
  광기: "감정이 시장보다 앞서 달리는 날이에요. 잠깐 숨 고르기 좋아요.",
};
