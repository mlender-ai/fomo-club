import type { FactSheet } from "./types";

/**
 * 결측 정직성 (WO-SUB-01 §10-2, WO-SUB-09 INV-12).
 *
 * `missing_fields` 는 **실제 결손과 정확히 일치해야** 한다. 그래서 손으로 나열하지 않고
 * 완성된 팩트시트를 걸어서 만든다 — 필드를 추가하고 목록 갱신을 잊는 실패를 원천 차단한다.
 */

/** 값 자체가 메타/상태라서 `null` 이 "없음"을 뜻하지 않는 경로. */
const STATUS_NULL_PATHS = new Set<string>([
  "fiscal.fiscal_anomaly", // null = 이상 없음
  "valuation.band_5y.metric", // null = WO-SUB-02 가 아직 정하지 않음
  // 아래 둘은 "데이터를 못 받았다"가 아니라 **해당 사항이 없다**는 뜻이다.
  // 결손으로 세면 CF 확보율이 실제보다 낮게 보이고, 02R 자격 판정 입력이 오염된다.
  "cashflow.burn_per_quarter", // null = 영업현금흐름 흑자(소진하지 않는다)
  "cashflow.dividend_coverage", // null = 무배당이거나 영업현금흐름 ≤ 0
]);

/** 결측 집계 대상이 아닌 메타 필드. */
const META_KEYS = new Set<string>(["missing_fields", "field_sources", "source_manifest", "source_errors"]);

/** `insufficient_reason` 은 밴드가 왜 불충분한지 설명하는 상태값이다(null = 충분). */
function isStatusPath(path: string): boolean {
  if (STATUS_NULL_PATHS.has(path)) return true;
  return path.endsWith(".insufficient_reason");
}

function walk(value: unknown, path: string, out: string[]): void {
  if (value === null || value === undefined) {
    if (!isStatusPath(path)) out.push(path);
    return;
  }
  if (Array.isArray(value)) {
    // 빈 배열은 "관측 0개" = 결측이다. 내용물의 개별 결측은 세지 않는다(분기 레코드는 통째로 사실).
    if (value.length === 0) out.push(path);
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (META_KEYS.has(key)) continue;
      walk(child, path ? `${path}.${key}` : key, out);
    }
  }
}

/** 팩트시트를 걸어 결측 필드 경로를 수집한다. 정렬 고정(결정론). */
export function collectMissingFields(factsheet: FactSheet): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(factsheet as unknown as Record<string, unknown>)) {
    if (META_KEYS.has(key)) continue;
    walk(value, key, out);
  }
  return [...new Set(out)].sort();
}

/**
 * 값이 있는 스칼라 필드에 출처가 붙어 있는지 검증한다(§4 규칙 2).
 * 반환값이 비어 있지 않으면 파이프라인 버그다 — 출처 없는 수치를 저장하려 한 것이다.
 */
export function fieldsMissingSource(factsheet: FactSheet): string[] {
  const present: string[] = [];
  const collect = (value: unknown, path: string): void => {
    if (value === null || value === undefined) return;
    if (typeof value === "number") {
      present.push(path);
      return;
    }
    if (Array.isArray(value) || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (META_KEYS.has(key)) continue;
      collect(child, path ? `${path}.${key}` : key);
    }
  };
  for (const section of ["growth", "margin", "valuation", "balance", "market_data", "consensus"] as const) {
    collect(factsheet[section], section);
  }
  // 밴드 내부 통계는 밴드 자체의 출처(가격 소스)로 대표한다 — 개별 분위수마다 출처를 요구하지 않는다.
  return present
    .filter((path) => !path.includes(".band_5y."))
    .filter((path) => !factsheet.field_sources[path])
    .sort();
}
