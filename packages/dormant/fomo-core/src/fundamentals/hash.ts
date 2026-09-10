import type { FactSheet } from "./types";

/**
 * 팩트시트 정규화 직렬화 (WO-SUB-01 §7-3, 완료 조건 3).
 *
 * `factsheet_hash` 는 "같은 입력이면 같은 값"이어야 한다. 그래서 해시 대상에서
 * **시각 필드를 뺀다** — `snapshot_at`·`fetched_at` 은 실행할 때마다 달라지므로
 * 그대로 두면 내용이 동일해도 해시가 매번 바뀌고, WO-SUB-07 의 스냅샷 참조가 무의미해진다.
 *
 * 해시 함수 자체는 여기 두지 않는다(fomo-core 는 node 빌트인을 쓰지 않는다).
 * 소비자가 이 문자열에 sha256 을 걸면 된다.
 */

/** 해시에서 제외할 필드 이름 — 내용이 아니라 실행 시각이다. */
const VOLATILE_KEYS = new Set<string>(["snapshot_at", "fetched_at"]);

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !VOLATILE_KEYS.has(key))
      .sort(([a], [b]) => a.localeCompare(b));
    const out: Record<string, unknown> = {};
    for (const [key, child] of entries) out[key] = normalize(child);
    return out;
  }
  // 부동소수 표현 차이(0.1 vs 0.10)를 없애기 위해 숫자는 JSON 기본 표현을 그대로 쓴다.
  return value;
}

/** 필드 순서에 의존하지 않는 정규화 JSON. 이 문자열에 해시를 건다. */
export function canonicalFactsheetJson(factsheet: FactSheet): string {
  return JSON.stringify(normalize(factsheet));
}
