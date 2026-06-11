import type { BannerItem } from "./banner";

/**
 * 롤링 시그널 — 시장 신호를 "정보"가 아니라 "분위기"로 치환한다. docs/PIVOT_FEED_FIRST.md.
 *
 * 원칙:
 * - 정보 나열 ❌ ("코스피 +1.2%") / 집단 감정 묘사 ⭕ ("다들 신났어. 못 탄 사람 여기 많아")
 * - 투자 조언·단정(매수/매도/오른다) ❌
 * - 액션 요구 문구 ❌ (pulse-empty "첫 감정을 남겨보세요" 등은 제외)
 * - 정직한 숫자: 폴백 mock도 사실 주장 없는 분위기 문장만 (가짜 수치 금지)
 *
 * 실제 뉴스/커뮤니티 → 감정 치환 엔진은 emotion-translation(Phase 3)이 담당하고,
 * 이 모듈은 기존 배너 신호를 오늘 탭의 분위기 줄로 바꾸는 1차 변환이다.
 */
export interface MoodSignal {
  id: string;
  emoji: string;
  /** 분위기 한 줄. */
  text: string;
}

/** 보합 판정 임계(%) — 이보다 작으면 "잠잠한" 분위기로 본다. */
const FLAT_THRESHOLD = 0.3;

/** 데이터 결측 시에도 빈 화면을 만들지 않는, 사실 주장 없는 분위기 폴백. */
export const MOOD_FALLBACK_SIGNALS: readonly MoodSignal[] = [
  { id: "mood-fallback-1", emoji: "👥", text: "오늘도 다들 비슷한 마음으로 여기 들렀어." },
  { id: "mood-fallback-2", emoji: "🌙", text: "놓친 것 같은 날엔 다들 여기 모여. 너만 그런 거 아니야." },
  { id: "mood-fallback-3", emoji: "🫧", text: "조급한 마음, 오늘 여기 두고 가도 돼." },
] as const;

function metricChange(item: BannerItem): number | null {
  const c = item.detail?.metric?.change;
  return typeof c === "number" ? c : null;
}

/** 배너 신호 1개 → 분위기 줄. 치환 불가(정보형·액션 요구형)는 null. */
export function moodifyBannerItem(item: BannerItem): MoodSignal | null {
  // 지수/참여 집계는 홈 화면이 직접 보여주고, pulse-empty는 액션 요구라 제외.
  if (item.kind === "pulse") return null;

  if (item.id === "fallback") {
    return { id: item.id, emoji: item.emoji, text: item.text };
  }

  if (item.kind === "macro") {
    const label = item.detail?.title;
    const change = metricChange(item);
    if (!label || change === null) return null;
    if (change >= FLAT_THRESHOLD) {
      return {
        id: item.id,
        emoji: "🔥",
        text: `오늘 ${label} 쪽은 다들 신났어 🔥 못 탄 사람도 여기 많아.`,
      };
    }
    if (change <= -FLAT_THRESHOLD) {
      return {
        id: item.id,
        emoji: item.emoji,
        text: `${label} 가라앉은 날. 다들 같은 화면 보고 있어.`,
      };
    }
    return {
      id: item.id,
      emoji: item.emoji,
      text: `${label}는 오늘 잠잠해. 같이 쉬어가는 날이야.`,
    };
  }

  // whale — CoinGecko 시장신호
  if (item.id === "whale-marketcap") {
    const change = metricChange(item);
    if (change === null) return null;
    return change >= 0
      ? { id: item.id, emoji: "🐋", text: "코인판 또 달아올랐대. 안 탄 사람 여기 많아." }
      : { id: item.id, emoji: "🐋", text: "코인판도 식은 날이야. 같이 버티는 중." };
  }
  if (item.id.endsWith("-ath")) {
    // "전고점 대비 -x% — 고점에 물린 건 너만이 아니야" — 이미 분위기 결이라 그대로.
    return { id: item.id, emoji: item.emoji, text: item.text };
  }
  if (item.id === "whale-breadth") {
    return { id: item.id, emoji: item.emoji, text: "오늘은 코인들 다 같이 내려앉았어. 너 혼자 아니야." };
  }
  // whale-worst 등 수치 나열형은 분위기 치환 근거가 부족 → 보수적으로 제외.
  return null;
}

/**
 * 배너 신호 → 오늘 탭 롤링 시그널.
 * 치환된 신호가 minCount 미만이면 분위기 폴백으로 채운다(빈 화면 금지).
 */
export function moodifyBanner(items: BannerItem[], minCount = 3): MoodSignal[] {
  const out: MoodSignal[] = [];
  for (const item of items) {
    const mood = moodifyBannerItem(item);
    if (mood) out.push(mood);
  }
  for (const fb of MOOD_FALLBACK_SIGNALS) {
    if (out.length >= minCount) break;
    out.push(fb);
  }
  return out;
}
