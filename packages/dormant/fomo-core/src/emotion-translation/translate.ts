import type { Classification, RawSignal } from "./classify";
import type { EmotionCard, FeedEmotion } from "./types";

/**
 * translate — 분류된 신호를 감정 한 줄로 번역한다. docs/PIVOT_FEED_FIRST.md Phase 3.
 *
 * 톤: 담담한 솔직함. "너만 그런 거 아니야"의 결. 정보 나열 금지 — 수치는 근거로 작게.
 * 규제: 매수/매도/단정 금칙어를 출구에서 한 번 더 검사한다(템플릿이라도 가드).
 * LLM 연결 시 이 템플릿 대신 생성문을 쓰되, passesRegulation 을 반드시 통과시킨다.
 */

/** 투자 조언·단정 금칙어. 걸리면 그 카드는 노출하지 않는다. */
// 주의: JS \b 는 한글에 안 통한다(한글=비단어문자) — 경계 없는 리터럴만 쓴다.
const REGULATION_BANNED =
  /매수|매도|사세요|파세요|팔아라|들어가라|올라간다|떨어진다|오른다|내린다|급등 예상|급락 예상|확실|보장|추천/;

/** 출구 규제 검사 — 템플릿/LLM 생성문 공통 게이트. */
export function passesRegulation(text: string): boolean {
  return !REGULATION_BANNED.test(text);
}

const FALLBACK_LABEL = "시장";

/** 감정별 치환 템플릿 — label(대상명)을 끼워 분위기 문장을 만든다. */
const TEMPLATES: Record<FeedEmotion, (label: string) => string> = {
  fomo: (l) => `${l} 또 올랐대. 안 탄 사람 여기 많아.`,
  fear: (l) => `${l} 내려앉은 날. 오늘 다들 같은 화면 보고 있어.`,
  joy: (l) => `오늘 ${l} 쪽은 다들 신났어 🔥 너도 봤지?`,
  regret: (l) => `${l} 고점에 들어간 마음, 너만 그런 거 아니야.`,
  greed: (l) => `${l} 더 갖고 싶다는 말이 많은 날이야. 천천히 가도 돼.`,
};

/** 커뮤니티 신호 전용 — 대상명 없이 분위기 자체를 옮긴다. */
const COMMUNITY_TEMPLATES: Partial<Record<FeedEmotion, string>> = {
  greed: "오늘 커뮤니티는 다들 더 담고 싶어 하는 분위기야. 너만 그런 거 아니야.",
  fear: "오늘 커뮤니티엔 무섭다는 말이 많아. 혼자 무서운 거 아니야.",
};

/** 근거 라벨 — 수치의 출처를 작게. */
function evidenceFor(raw: RawSignal): EmotionCard["evidence"] {
  if (raw.source === "community") {
    return {
      label: "커뮤니티 분위기",
      ...(typeof raw.mentions === "number" ? { value: `게시물 ${raw.mentions}건` } : {}),
      ...(raw.sourceUrl ? { sourceUrl: raw.sourceUrl } : {}),
    };
  }
  const label =
    typeof raw.athChangePct === "number" && raw.athChangePct <= -30
      ? "전고점 대비"
      : raw.source === "whale"
        ? "24시간"
        : "전일 대비";
  return {
    label,
    ...(raw.value ? { value: raw.value } : {}),
    ...(raw.sourceUrl ? { sourceUrl: raw.sourceUrl } : {}),
  };
}

/**
 * 분류된 신호 → 피드 카드. 금칙어에 걸리면 null (보수적으로 버린다).
 */
export function translateSignal(raw: RawSignal, cls: Classification): EmotionCard | null {
  const headline =
    raw.source === "community"
      ? (COMMUNITY_TEMPLATES[cls.emotion] ?? TEMPLATES[cls.emotion](raw.label ?? "커뮤니티"))
      : TEMPLATES[cls.emotion](raw.label ?? FALLBACK_LABEL);

  if (!passesRegulation(headline)) return null;

  const evidence = evidenceFor(raw);
  return {
    id: `feed-${raw.id}`,
    emotion: cls.emotion,
    headline,
    ...(evidence ? { evidence } : {}),
    confidence: cls.confidence,
  };
}
