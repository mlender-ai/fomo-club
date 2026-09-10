/**
 * §5 표현 규칙 — 화면에 그대로 나가는 문안의 금지어 사전 (완료조건 4).
 *
 * 이 WO 의 성패는 **"단정하지 않으면서 유용한가"** 에 달려 있다(§10). 문안이 인과·의도·평가·
 * 예측으로 새는 순간 제품 원칙이 깨지므로, 사람 눈이 아니라 **테스트가 막는다.**
 *
 * 순수 함수다. 사전은 데이터로 노출해 CTX-05 가 같은 기준을 재사용할 수 있게 한다.
 */

export type ForbiddenReason = "causal" | "intent" | "evaluation" | "opinion" | "prediction";

export interface ForbiddenRule {
  reason: ForbiddenReason;
  pattern: RegExp;
  /** 위반 시 사람에게 보여줄 설명. */
  why: string;
}

/** §5-1 금지 표현. */
export const FORBIDDEN_RULES: readonly ForbiddenRule[] = [
  { reason: "causal", pattern: /때문에/, why: "인과 단정" },
  { reason: "causal", pattern: /(으)?로\s*인해/, why: "인과 단정" },
  { reason: "causal", pattern: /덕분에/, why: "인과 단정" },
  { reason: "intent", pattern: /사려고|매집하려/, why: "의도 추정" },
  /**
   * 한국어 인과 연결어미 + 매수 서술. §5-2 의 ✕ 예시가 정확히 이 형태다:
   * "실적이 좋아**져서** 기관이 **사고 있어요**".
   *
   * `에서`(장소)는 **일부러 넣지 않았다** — "많이 떨어진 자리**에서** 사고 있어요" 는
   * 허용 문안이고, 그것까지 막으면 카탈로그가 통째로 걸린다.
   */
  {
    reason: "causal",
    pattern: /(아서|어서|여서|해서|져서|라서|니까|므로)[^.!?]{0,30}(사고\s*있|샀|사\s*모|순?매수)/,
    why: "인과·의도 서술",
  },
  { reason: "evaluation", pattern: /호재|악재/, why: "평가" },
  { reason: "opinion", pattern: /저평가|고평가|기회|유망|추천/, why: "투자의견" },
  { reason: "prediction", pattern: /곧\s*오를|곧\s*상승|상승\s*전망|급등\s*임박|지금\s*안\s*사면/, why: "예측" },
];

export interface CopyViolation {
  reason: ForbiddenReason;
  matched: string;
  why: string;
}

/** 문안을 검사한다. 위반이 없으면 빈 배열. */
export function findCopyViolations(text: string): CopyViolation[] {
  const value = text ?? "";
  const out: CopyViolation[] = [];
  for (const rule of FORBIDDEN_RULES) {
    const m = rule.pattern.exec(value);
    if (m) out.push({ reason: rule.reason, matched: m[0], why: rule.why });
  }
  return out;
}

export function isCopySafe(text: string): boolean {
  return findCopyViolations(text).length === 0;
}

/**
 * 여러 문안을 한 번에 검사한다. 후보 라벨·근거 문장·반증조건 전부를 통과시켜야 한다.
 * 하나라도 걸리면 **그 후보를 내보내지 않는다** — 고쳐서 내보내지 않는다. 사람이 다시 쓴다.
 */
export function assertCopySafe(texts: readonly string[]): { ok: boolean; violations: CopyViolation[] } {
  const violations = texts.flatMap((t) => findCopyViolations(t));
  return { ok: violations.length === 0, violations };
}
