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

export * from "./banned-words";
export * from "./render-projection";
