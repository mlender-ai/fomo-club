/**
 * Feature Flags — FOMO Club 방향 전환(액션 제로 / 감정 탭). docs/PIVOT_FEED_FIRST.md.
 *
 * 기존 기능은 삭제하지 않고 이 플래그로 화면에서만 숨긴다(코드·DB·로직 보존).
 * 기본값은 코드 상수가 단일 소스이며, 필요 시 환경변수로 덮어쓸 수 있다
 * (웹=NEXT_PUBLIC_, 네이티브=EXPO_PUBLIC_ 접두사 — .env.example 참조).
 */

/** "true"/"false" 문자열 환경변수 → boolean. 미설정/그 외 값은 fallback. */
function readFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}

/** 감정 선택/투표 (오늘의 감정 고르기, EmotionGate). 숨김 — 복원 가능. */
export const FEATURE_EMOTION_VOTE = readFlag(
  process.env.NEXT_PUBLIC_FEATURE_EMOTION_VOTE ??
    process.env.EXPO_PUBLIC_FEATURE_EMOTION_VOTE,
  false
);

/** 감정 기록 (조각 고르기/한마디 남기기, VoiceFeed). 숨김 — 복원 가능. */
export const FEATURE_EMOTION_JOURNAL = readFlag(
  process.env.NEXT_PUBLIC_FEATURE_EMOTION_JOURNAL ??
    process.env.EXPO_PUBLIC_FEATURE_EMOTION_JOURNAL,
  false
);

/** 감정 캘린더 (한 달 색칠, EmotionCalendar). 숨김 — 복원 가능. */
export const FEATURE_EMOTION_CALENDAR = readFlag(
  process.env.NEXT_PUBLIC_FEATURE_EMOTION_CALENDAR ??
    process.env.EXPO_PUBLIC_FEATURE_EMOTION_CALENDAR,
  false
);

/** 하단 기록 탭. 숨김 — 복원 가능. */
export const FEATURE_HISTORY_TAB = readFlag(
  process.env.NEXT_PUBLIC_FEATURE_HISTORY_TAB ??
    process.env.EXPO_PUBLIC_FEATURE_HISTORY_TAB,
  false
);

/** 신규 피드 — 감정 카테고리 탭(포모/공포/환희/후회/탐욕). */
export const FEATURE_FEED_EMOTION_TABS = readFlag(
  process.env.NEXT_PUBLIC_FEATURE_FEED_EMOTION_TABS ??
    process.env.EXPO_PUBLIC_FEATURE_FEED_EMOTION_TABS,
  true
);
