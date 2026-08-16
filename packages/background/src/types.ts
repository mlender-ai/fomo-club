/**
 * CTX-04 배경 후보 엔진 — 타입 정본.
 *
 * **단정하지 않고 후보를 낸다(§1).** 우리가 아는 것은 "이런 것들이 동시에 관측된다" 까지고
 * 그 이상은 추측이다. 그래서 후보에는 반드시 **근거·신뢰도·반증조건**이 붙는다.
 *
 * **LLM 으로 배경을 생성하지 않는다(§9). 규칙 기반이다.**
 */

export type BackgroundCode =
  | "DEEP_DRAWDOWN"
  | "RANGE_ACCUMULATION"
  | "PRE_EVENT"
  | "POST_MATERIAL"
  | "GUIDANCE_SHIFT"
  | "SHAKEOUT_BUY"
  | "VOLUME_WAKING"
  | "NO_VISIBLE_REASON";

/**
 * §4-1.
 * - `observed` — 근거가 전부 직접 관측치(가격·거래량·공시)
 * - `circumstantial` — 근거 일부가 **시점 인접성**에 의존
 *
 * **둘 다 "확실하다" 는 뜻이 아니다.** 화면 문구에 반영한다.
 */
export type BackgroundConfidence = "observed" | "circumstantial";

export interface BackgroundEvidence {
  /** "52주 고점 대비 -38%" */
  text: string;
  /** "drawdown_from_high" */
  metric: string;
  value: number | string;
  source: string;
  as_of: string;
}

/**
 * 근거 2개 이상을 **타입으로** 강제한다(§3-1 규칙 3 · 완료조건 2).
 * 배열 길이는 타입으로 하한을 못 박으므로 튜플 + 나머지로 표현한다.
 */
export type EvidencePair = [BackgroundEvidence, BackgroundEvidence, ...BackgroundEvidence[]];

export interface BackgroundCandidate {
  code: BackgroundCode;
  label_ko: string;
  /** **2개 이상.** 미만이면 후보를 만들지 않는다. */
  evidence: EvidencePair;
  confidence: BackgroundConfidence;
  /** "이 배경이 아니라면 무엇이 관측되어야 하나" — **자동 판정 가능한 형태**여야 한다(§9). */
  falsifier: string;
  ruleset_version: string;
}

export interface BackgroundAssessment {
  symbol: string;
  as_of: string;
  /** 0~2개. 근거 강도 순(§3-1 규칙 1 · §6). */
  candidates: BackgroundCandidate[];
  /** 후보와 별개로 나열하는 사실. */
  co_observed: Array<{ text: string; source: string; as_of: string }>;
  inputs_version: { flow: string; structure: string; materials: string };
}

/** §3-1 규칙 1 — 카드가 무거워지지 않도록 최대 2개(§9 실패 모드). */
export const MAX_CANDIDATES = 2;

/** §3-1 규칙 3 — 근거 하한. */
export const MIN_EVIDENCE = 2;

/**
 * 완료조건 5 — **모든 후보 표시에 붙는 꼬리표.**
 * 인과로 읽히는 것을 막는 마지막 방어선이라 문구를 한 곳에 고정한다.
 */
export const CO_OBSERVATION_NOTE = "이 사실들이 같은 시기에 관측됐다는 뜻이에요. 인과는 확인할 수 없어요.";

/**
 * 근거가 2개 미만이면 후보를 만들지 않는다(완료조건 2 런타임 가드).
 * 타입 가드와 런타임 가드를 함께 둔다 — 어댑터에서 `any` 로 들어오는 경로를 막는다.
 */
export function toEvidencePair(evidence: readonly BackgroundEvidence[]): EvidencePair | null {
  if (evidence.length < MIN_EVIDENCE) return null;
  return [evidence[0]!, evidence[1]!, ...evidence.slice(2)];
}
