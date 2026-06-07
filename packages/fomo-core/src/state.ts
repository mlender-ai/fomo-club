import type { FomoState, FomoFace } from "./types";

/**
 * FOMO Index(0~100) → 5구간 상태 + 마스코트 표정.
 * docs/FOMO_INDEX.md 스케일과 docs/MASCOT.md §5 표정 매핑을 한 곳에 고정한다.
 * 구간 경계값을 바꾸면 이 표 하나만 수정하면 지표·마스코트가 함께 따라온다.
 */
interface StateBand {
  /** 구간 하한 (이상). */
  min: number;
  state: FomoState;
  face: FomoFace;
  emoji: string;
  /** 구간 배경 포인트 색. 검정 배경 위 glow 색으로 사용. docs/DESIGN_FOMO.md */
  color: string;
  /** 3초 이내 직관 이해를 돕는 한 줄 설명. */
  description: string;
}

const BANDS: readonly StateBand[] = [
  { min: 81, state: "광기",  face: "manic",   emoji: "🚀", color: "#FF2D20", description: "감정이 시장보다 앞서 달리는 날이에요." },
  { min: 61, state: "FOMO",  face: "excited", emoji: "🔥", color: "#FF5A36", description: "놓치기 싫은 마음이 커지고 있어요." },
  { min: 41, state: "관심",  face: "curious", emoji: "👀", color: "#FACC15", description: "특정 종목·섹터로 시선이 모이는 중이에요." },
  { min: 21, state: "관망",  face: "calm",    emoji: "🙂", color: "#38BDF8", description: "관심은 있지만 서두르지 않는 분위기예요." },
  { min: 0,  state: "무관심", face: "sleepy", emoji: "😴", color: "#64748B", description: "다들 잠잠한 하루예요." },
] as const;

/** 점수를 0~100으로 보정. */
export function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function bandFor(score: number): StateBand {
  const s = clampScore(score);
  for (const band of BANDS) {
    if (s >= band.min) return band;
  }
  // BANDS의 마지막(min:0)이 항상 매칭되므로 도달하지 않음.
  return BANDS[BANDS.length - 1]!;
}

export function scoreToState(score: number): FomoState {
  return bandFor(score).state;
}

export function scoreToFace(score: number): FomoFace {
  return bandFor(score).face;
}

export function scoreToEmoji(score: number): string {
  return bandFor(score).emoji;
}

/** 구간 포인트 색 (검정 배경 위 glow). */
export function scoreToColor(score: number): string {
  return bandFor(score).color;
}

/** 구간 3초 설명 문장. */
export function scoreToDescription(score: number): string {
  return bandFor(score).description;
}

/** 전체 구간 메타데이터 (UI 범례, 설정 화면 등 활용). */
export const ZONE_BANDS = BANDS.map(({ min, state, face, emoji, color, description }) => ({
  min,
  state,
  face,
  emoji,
  color,
  description,
}));
