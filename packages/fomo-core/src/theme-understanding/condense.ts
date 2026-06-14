import type {
  Evidence,
  InsightSourceRef,
  KeyWording,
  ThemeInsight,
  ThemeInsightConfidence,
  ThemeStance,
} from "./types";

/**
 * 재가공/응축 레이어 — DATA_ENGINE_STRATEGY §4 Track B.
 *
 * A(understandTheme)의 grounded 출력을 "한 카드 분량"으로 응축한다.
 *
 * 환각 차단(절대 원칙 "응축 과정에서 원문에 없는 말이 새로 끼어들면 안 된다"):
 *   응축은 *새 생성(LLM)이 아니라* A의 이미-grounded 된 근거를 **결정론적으로 선택·조립**한다.
 *   whyHot 의 사실 문장은 전부 A의 claim 그대로(연결어만 비사실 스캐폴딩). → grounding 100% 유지.
 *
 * 균형 필수: 강세/약세 둘 다. 한쪽뿐이면 stanceNote 로 정직 표기(A에서 계산된 값 그대로).
 * 정직한 빈 상태: A가 insufficient 면 응축도 insufficient(가짜 응축 금지).
 */

export interface CondensedPoint {
  claim: string;
  /** 근거 출처(SourceDoc.id) — sources 에서 url 매핑. */
  sourceId: string;
}

export interface CondensedInsight {
  theme: string;
  /** "왜 떴나" 2~3문장 — A의 grounded claim 들을 결정론적으로 종합(새 사실 추가 없음). */
  whyHot: string;
  bull: CondensedPoint[];
  bear: CondensedPoint[];
  wordings: KeyWording[];
  stance: ThemeStance;
  stanceNote: string;
  /** 근거가 가리킨 원문(원문 보기 링크용 — 검증 가능하게 유지). */
  sources: InsightSourceRef[];
  confidence: ThemeInsightConfidence;
  /** 정직성/진단 — 왜 이 confidence·stance 인지(A의 reason 그대로). 빈 상태 원인 추적용. */
  reason: string;
}

export interface CondenseOptions {
  maxPerSide?: number;
  maxWordings?: number;
}

const toPoint = (e: Evidence): CondensedPoint => ({ claim: e.claim, sourceId: e.sourceId });

/** 응축 — 결정론적 선택 + 비사실 연결어로 whyHot 조립(사실은 전부 A의 claim). */
export function condenseThemeInsight(
  insight: ThemeInsight,
  opts: CondenseOptions = {}
): CondensedInsight {
  const maxPerSide = opts.maxPerSide ?? 2;
  const maxWordings = opts.maxWordings ?? 2;

  const base = {
    theme: insight.theme,
    stance: insight.stance,
    stanceNote: insight.stanceNote,
    sources: insight.sources,
    confidence: insight.confidence,
    reason: insight.reason,
  };

  // 정직한 빈 상태 — A가 근거를 못 뽑았으면 응축도 비운다(가짜 생성 금지).
  if (insight.confidence === "insufficient" || insight.bull.length + insight.bear.length === 0) {
    return { ...base, whyHot: insight.stanceNote, bull: [], bear: [], wordings: [] };
  }

  const bull = insight.bull.slice(0, maxPerSide);
  const bear = insight.bear.slice(0, maxPerSide);
  const wordings = insight.wordings.slice(0, maxWordings);

  return {
    ...base,
    whyHot: buildWhyHot(insight.theme, insight.stance, insight.stanceNote, bull, bear),
    bull: bull.map(toPoint),
    bear: bear.map(toPoint),
    wordings,
  };
}

/**
 * whyHot — 결정론적. 사실 문장은 A의 claim 그대로 박고, 연결어("오늘 X는…")만 스캐폴딩.
 * 새로운 사실/일반론을 만들지 않는다(환각 차단).
 */
function buildWhyHot(
  theme: string,
  stance: ThemeStance,
  stanceNote: string,
  bull: readonly Evidence[],
  bear: readonly Evidence[]
): string {
  const join = (xs: readonly Evidence[]) => xs.map((e) => e.claim.replace(/\s+$/, "")).join(" ");

  if (stance === "bull-dominant") {
    return `오늘 ${theme} 쪽은 강세 얘기가 우세해. ${join(bull)} ${stanceNote}`.trim();
  }
  if (stance === "bear-dominant") {
    return `오늘 ${theme} 쪽은 약세·리스크 얘기가 우세해. ${join(bear)} ${stanceNote}`.trim();
  }
  // balanced
  const parts = [`오늘 ${theme}는 강세와 약세가 엇갈려.`];
  if (bull.length) parts.push(`강세 쪽은 — ${join(bull)}`);
  if (bear.length) parts.push(`약세 쪽은 — ${join(bear)}`);
  return parts.join(" ");
}
