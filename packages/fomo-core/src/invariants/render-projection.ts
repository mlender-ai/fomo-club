import type { FactSheet } from "../fundamentals/types";

/**
 * INV-08 · INV-12 — 렌더 투영.
 *
 * 렌더 경로가 팩트시트를 직접 읽으면 두 가지가 새어 나간다.
 *  · 출처·시각 없는 수치(INV-08 위반)
 *  · `missing_fields` 에 등재된 결측을 값처럼 보이게 하는 것(INV-12 위반)
 *
 * 그래서 **렌더는 팩트시트를 직접 보지 않고 이 투영만 본다.** 투영은 두 조건을 모두
 * 통과한 경로만 통과시키므로, 위반이 렌더에 도달할 경로가 없다. 가드가 아니라 구조다 —
 * "검사해서 막는다" 보다 "만들 수 없다" 가 강하다.
 */

export interface ProjectedValue {
  path: string;
  value: number | string;
  source: string;
  as_of: string;
}

export interface ProjectionResult {
  values: ProjectedValue[];
  /** 제외된 경로와 사유 — 조용한 누락 금지. */
  excluded: Array<{ path: string; reason: "missing_field" | "no_source" | "null_value" }>;
}

/** `"valuation.per_ttm"` 같은 점 경로로 값을 읽는다. */
export function valueAtPath(sheet: FactSheet, path: string): unknown {
  let cursor: unknown = sheet;
  for (const segment of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/**
 * 요청한 경로 중 **렌더해도 되는 것만** 돌려준다.
 *
 * 제외 규칙(둘 다 강제):
 *  1. `missing_fields` 에 있으면 제외 — 값이 우연히 남아 있어도 렌더하지 않는다(INV-12).
 *  2. `field_sources` 에 `source`·`as_of` 가 없으면 제외(INV-08).
 */
export function projectForRender(sheet: FactSheet, paths: readonly string[]): ProjectionResult {
  const missing = new Set(sheet.missing_fields ?? []);
  const values: ProjectedValue[] = [];
  const excluded: ProjectionResult["excluded"] = [];

  for (const path of paths) {
    if (missing.has(path)) {
      excluded.push({ path, reason: "missing_field" });
      continue;
    }
    const raw = valueAtPath(sheet, path);
    if (raw === null || raw === undefined || (typeof raw !== "number" && typeof raw !== "string")) {
      excluded.push({ path, reason: "null_value" });
      continue;
    }
    const provenance = sheet.field_sources?.[path];
    if (!provenance?.source || !provenance.as_of) {
      excluded.push({ path, reason: "no_source" });
      continue;
    }
    values.push({ path, value: raw, source: provenance.source, as_of: provenance.as_of });
  }
  return { values, excluded };
}
