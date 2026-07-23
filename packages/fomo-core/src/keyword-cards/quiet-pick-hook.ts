/**
 * WO-G1A 「오늘의 조용한 픽」 훅 문장 — 탈템플릿(결정론).
 *
 * 형식: [누가] [얼마를] [얼마나 조용히]. 실공시 수치만 넣는다(가짜 수치 금지).
 * 같은 신호라도 실측 수치(주체 수·규모·일수)를 문장에 주입해 유니크도를 확보하고,
 * 문장 구조를 결정론 인덱스로 로테이션한다(최소 4종). 같은 입력 → 같은 출력.
 *
 * CI 게이트(quiet-pick-hook.test.ts): 30 픽에서 동일 문장 ≤2회 · 구조 ≥4종 · 모든 훅에 실수치(숫자) 포함.
 */

import { josa } from "./josa";

export type QuietPickSignalKind =
  | "insider_cluster"
  | "institution_streak"
  | "foreign_streak"
  | "multi_cluster";

export interface QuietPickHookInput {
  kind: QuietPickSignalKind;
  /** 누가 — "내부자 3명" / "기관" / "외국인" / "외국인·기관". 실주체만. */
  actors: string;
  /** 얼마를 — "$4.6M" / "27만주" 등 실공시 수치. 숫자 포함 필수. */
  scale: string;
  /** 지속·윈도우 일수(streak 일수 또는 최근 N일). 0 이하면 일수 문구를 쓰지 않는다. */
  days: number;
}

/** "얼마나 조용히" — 화제 없음/미발견을 담담히. 투자조언·예측 어휘 금지. */
const QUIET_DESCRIPTORS = [
  "뉴스 한 줄 없이",
  "아무도 안 보는 중",
  "조용히 담는 중",
  "화제 되기 전에",
  "남들 모르게",
  "관심 붙기 전에",
] as const;

/** 결정론 해시 — 입력 문자열을 안정적인 음이 아닌 정수로. (Math.random 금지: 결정론 유지) */
function stableHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 구조 개수(≥4). days 를 요구하는 구조(3·4)는 days<2일 때 회피한다. */
const STRUCTURE_COUNT = 5;

function renderStructure(index: number, input: QuietPickHookInput, quiet: string): string {
  const { actors, scale, days } = input;
  const iGa = josa(actors, "이가");
  switch (index) {
    case 0:
      return `${actors}${iGa} ${scale} — ${quiet}`;
    case 1:
      return `${quiet}, ${actors}만 ${scale}`;
    case 2:
      return `${actors} ${scale} 매집 — ${quiet}`;
    case 3:
      return `${days}일째 ${actors} ${scale}, ${quiet}`;
    case 4:
    default:
      return `${quiet} ${actors}${iGa} ${scale}`;
  }
}

/**
 * 픽 훅 한 줄. 실수치(actors·scale·days)를 문장에 주입 + 구조/조용함 로테이션으로 탈템플릿.
 * 결정론: 같은 입력이면 항상 같은 문장.
 */
export function buildQuietPickHook(input: QuietPickHookInput): string {
  const seed = stableHash(`${input.kind}:${input.actors}:${input.scale}:${input.days}`);
  const quiet = QUIET_DESCRIPTORS[seed % QUIET_DESCRIPTORS.length]!;
  let structure = seed % STRUCTURE_COUNT;
  // days 를 쓰는 구조(3)는 일수가 의미 있을 때만. 아니면 다음 구조로 결정론 대체.
  if (structure === 3 && input.days < 2) structure = (seed >> 3) % 3; // 0·1·2 중 하나
  return renderStructure(structure, input, quiet);
}
