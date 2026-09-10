import { EMOTION_LABELS, EMOTION_TYPES, type EmotionType } from "./types";

/**
 * M4 — 타인의 목소리 = "구조화 한마디". docs/M4_EXECUTION_PLAN.md §3·4.2.
 * 자유 텍스트를 받지 않고(§2.2 형태가 곧 윤리) 정해진 선택지를 조합해
 * 정제된 한 줄을 만든다: [감정] + [상황] + [의연함] → composeVoice().
 *
 * 가드레일이 스키마에 내장: RESOLVE_OPTIONS에는 의연함(버팀/쉼/거리두기)만 존재.
 * 무모함("풀배팅", "추매 가즈아")은 선택지에 아예 없다 — 런타임 검사가 아니라
 * 선택지 설계 단계에서 강제. regulation-reviewer가 검사할 자유 텍스트 0.
 * mascot-lines.ts(담담한 톤)·banner.ts(순수 빌더) 패턴을 따른다.
 */

export interface VoiceOption {
  key: string;
  label: string;
}

/** 상황 선택지 — 담담한 사실만. 과장·자조·도박 미화 ❌. */
export const SITUATION_OPTIONS: readonly VoiceOption[] = [
  { key: "blue_day", label: "오늘도 파란 날이었지만" },
  { key: "all_day_chart", label: "하루 종일 차트만 봤지만" },
  { key: "deep_loss", label: "물린 지 꽤 됐지만" },
  { key: "missed_run", label: "오르는 걸 구경만 했지만" },
  { key: "late_night", label: "새벽까지 시세를 봤지만" },
  { key: "quiet_day", label: "별일 없는 하루였고" },
] as const;

/** 의연함 선택지 — 버팀/쉼/거리두기만. 무모함 키는 존재하지 않는다(가드레일). */
export const RESOLVE_OPTIONS: readonly VoiceOption[] = [
  { key: "no_panic", label: "허둥대진 않았어요" },
  { key: "closed_app", label: "오늘은 앱을 일찍 껐어요" },
  { key: "took_walk", label: "잠깐 산책하고 왔어요" },
  { key: "kept_routine", label: "그래도 할 일은 다 했어요" },
  { key: "no_impulse", label: "충동적으로 사고팔진 않았어요" },
  { key: "early_sleep", label: "오늘은 일찍 자려고요" },
] as const;

export interface FomoVoice {
  emotion: EmotionType;
  situationKey: string;
  resolveKey: string;
}

const SITUATION_MAP = new Map(SITUATION_OPTIONS.map((o) => [o.key, o.label]));
const RESOLVE_MAP = new Map(RESOLVE_OPTIONS.map((o) => [o.key, o.label]));

/** vote API 수신 검증용 — 알려진 키만 저장(스키마 가드레일의 서버측 짝). */
export function isSituationKey(k: unknown): k is string {
  return typeof k === "string" && SITUATION_MAP.has(k);
}
export function isResolveKey(k: unknown): k is string {
  return typeof k === "string" && RESOLVE_MAP.has(k);
}

/**
 * 3-슬롯을 결정적으로 한 줄로 조합한다.
 * 예: "공포 · 오늘도 파란 날이었지만, 허둥대진 않았어."
 * 잘못된 키(감정/상황/의연함 중 하나라도) → null(항목 생략 — 정직한 숫자 원칙).
 */
export function composeVoice(v: FomoVoice): string | null {
  if (!EMOTION_TYPES.includes(v.emotion)) return null;
  const situation = SITUATION_MAP.get(v.situationKey);
  const resolve = RESOLVE_MAP.get(v.resolveKey);
  if (!situation || !resolve) return null;
  return `${EMOTION_LABELS[v.emotion]} · ${situation}, ${resolve}.`;
}

/**
 * 콜드스타트 폴백 — 아직 사용자 voice가 없을 때 포모가 모아둔 한마디들.
 * 가짜 사용자 수·가짜 닉네임 ❌(정직한 숫자). UI는 "포모가 모아둔 마음"으로 표기한다.
 * restorativeLine 패턴: 날짜("YYYY-MM-DD") 해시 기반 결정적 선택 →
 * 같은 날은 동일, 매일 달라져 돌아올 이유가 된다.
 */
const CURATED_POOL: readonly { emotion: EmotionType; text: string }[] = [
  { emotion: "fear", text: "공포 · 오늘도 파란 날이었지만, 허둥대진 않았어요." },
  { emotion: "regret", text: "후회 · 물린 지 꽤 됐지만, 그래도 할 일은 다 했어요." },
  { emotion: "fomo", text: "FOMO · 오르는 걸 구경만 했지만, 충동적으로 사고팔진 않았어요." },
  { emotion: "fear", text: "공포 · 새벽까지 시세를 봤지만, 오늘은 일찍 자려고요." },
  { emotion: "greed", text: "탐욕 · 하루 종일 차트만 봤지만, 오늘은 앱을 일찍 껐어요." },
  { emotion: "regret", text: "후회 · 오늘도 파란 날이었지만, 잠깐 산책하고 왔어요." },
  { emotion: "conviction", text: "확신 · 별일 없는 하루였고, 그래도 할 일은 다 했어요." },
  { emotion: "fomo", text: "FOMO · 새벽까지 시세를 봤지만, 허둥대진 않았어요." },
  { emotion: "fear", text: "공포 · 물린 지 꽤 됐지만, 충동적으로 사고팔진 않았어요." },
] as const;

export interface CuratedVoice {
  emotion: EmotionType;
  text: string;
}

/** 그날의 큐레이션 한마디 N개(기본 3). 날짜 결정적 — 새로고침에도 동일. */
export function curatedVoices(date: string, count = 3): CuratedVoice[] {
  let sum = 0;
  for (let i = 0; i < date.length; i++) sum += date.charCodeAt(i);
  const n = Math.min(count, CURATED_POOL.length);
  const out: CuratedVoice[] = [];
  for (let i = 0; i < n; i++) {
    out.push(CURATED_POOL[(sum + i * 3) % CURATED_POOL.length]!);
  }
  return out;
}
