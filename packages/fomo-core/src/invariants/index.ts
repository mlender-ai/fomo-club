import registry from "./registry.json";

/**
 * 불변식 레지스트리 (WO-SUB-09 / WO-SUB-03.5 PART A).
 *
 * 정본은 `registry.json` **하나**다. `docs/quality/INVARIANTS.md` 는 생성물이고
 * 동기화 테스트가 어긋남을 잡는다(독트린과 같은 방식) — 문서와 코드가 갈라지면
 * 게이트가 있다고 착각하게 된다.
 */

export type InvariantStatus = "active" | "deferred";

export interface InvariantEntry {
  id: string;
  title: string;
  statement: string;
  precondition: string;
  status: InvariantStatus;
  /** `deferred` 면 왜 미뤘는지. 사유 없는 유예는 방치와 구분되지 않는다. */
  defer_reason?: string;
  source_of_truth: string;
  scope_note?: string;
  /**
   * **어기면 사용자가 무엇을 잘못 믿게 되는가**(CTX-07 §8).
   *
   * 이 문장을 쓸 수 없으면 그 불변식은 불필요하다. 그래서 필드로 강제한다 —
   * "코드가 이렇게 돼 있으니 지키자" 는 규칙은 시간이 지나면 아무도 왜인지 모른 채 끈다.
   */
  misbelief?: string;
  /**
   * **의도적 위반 케이스**(CTX-07 §3). 활성 불변식은 반드시 갖는다.
   *
   * 왜 필수인가: 통과 케이스만 있는 테스트는 게이트가 아니다. 실제로 이 저장소에서
   * 가격 무효선이 발행 시점 값끼리 비교하면서 타입·테스트를 전부 통과했고, 소급 스캔은
   * 위반을 찾고도 `exit 0` 이었다. **검사가 약한 건지 구조가 튼튼한 건지 구분되지 않는다.**
   *
   * 여기에는 무엇을 주입하고 무엇이 실패해야 하는지를 적는다. 실행은
   * `packages/fomo-core/__tests__/invariant-falsification.test.ts` 가 한다.
   */
  falsification?: string;
}

export interface InvariantRegistry {
  registry_version: string;
  note: string;
  invariants: InvariantEntry[];
}

export const INVARIANT_REGISTRY = registry as InvariantRegistry;

export function invariant(id: string): InvariantEntry {
  const found = INVARIANT_REGISTRY.invariants.find((entry) => entry.id === id);
  if (!found) throw new Error(`불변식 없음: ${id}`);
  return found;
}

export function activeInvariants(): InvariantEntry[] {
  return INVARIANT_REGISTRY.invariants.filter((entry) => entry.status === "active");
}

export function deferredInvariants(): InvariantEntry[] {
  return INVARIANT_REGISTRY.invariants.filter((entry) => entry.status === "deferred");
}

/**
 * 활성 불변식이 갖춰야 할 필드가 빠졌으면 그 목록을 돌려준다(CTX-07 완료조건 1·2).
 *
 * 스키마 테스트가 이걸 써서 **역검증 없는 활성화를 구조적으로 막는다.** 활성으로 바꾸는
 * 순간 `falsification` 을 쓰지 않으면 CI 가 떨어진다 — 문서 규약이 아니라 게이트다.
 */
export function invariantSchemaGaps(): Array<{ id: string; missing: string[] }> {
  const gaps: Array<{ id: string; missing: string[] }> = [];
  for (const entry of INVARIANT_REGISTRY.invariants) {
    const missing: string[] = [];
    if (!entry.misbelief?.trim()) missing.push("misbelief");
    if (entry.status === "active" && !entry.falsification?.trim()) missing.push("falsification");
    if (entry.status === "deferred" && !entry.defer_reason?.trim()) missing.push("defer_reason");
    if (missing.length > 0) gaps.push({ id: entry.id, missing });
  }
  return gaps;
}

export * from "./banned-words";
export * from "./render-projection";
export * from "./render-scan";
export * from "./card-front-budget";
