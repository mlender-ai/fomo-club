import { describe, expect, it } from "vitest";
import { SOURCE_SCANNED_SECTIONS, fieldsMissingSource } from "../src/fundamentals/missing";
import { emptyFactSheet } from "../src/fundamentals/assemble";
import type { FactSheet } from "../src/fundamentals/types";

/**
 * INV-08 활성화 유지 장치 (WO-SUB-03.5 PART A).
 *
 * `fieldsMissingSource` 는 검사할 절을 **손으로 나열**한다. 새 절이 추가되고 그 목록에
 * 들어가지 않으면, 그 절의 수치는 출처 없이 통과한다 — 불변식은 켜져 있는데 검사 범위
 * 밖이라 **켜져 있다는 착각만** 남는다. 실제로 `cashflow` 절이 그럴 뻔했다(2026-08-01).
 *
 * 그래서 "숫자를 담은 절이 전부 검사 목록에 있는가"를 팩트시트 구조에서 직접 세운다.
 */

/** 검사 목록에 없어도 되는 절과 그 이유. 이유 없는 예외는 두지 않는다. */
const EXEMPT: Record<string, string> = {
  fiscal: "분기 레코드가 레코드 단위로 source 를 들고 있다(QuarterRecord.source) — 경로별 출처가 성립하지 않는다",
  classification: "값이 문자열이고 classification.source 가 절 전체를 대표한다",
};

/** 이 절 안에 스칼라 숫자가 하나라도 있는가. */
function holdsNumber(value: unknown): boolean {
  if (typeof value === "number") return true;
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(holdsNumber);
  return Object.values(value as Record<string, unknown>).some(holdsNumber);
}

function populated(): FactSheet {
  const sheet = emptyFactSheet({
    canonical: "005930",
    displayName: "테스트",
    symbol: "005930",
    market: "KR",
    currency: "KRW",
    snapshotAt: "2026-08-01T00:00:00.000Z",
    sourceErrors: [],
  });
  // 빈 팩트시트는 전부 null 이라 "숫자를 담은 절"이 드러나지 않는다. 절마다 숫자를 하나씩 심는다.
  sheet.cashflow.operating_ttm = 1_000;
  sheet.balance.total_equity = 1_000;
  sheet.growth.revenue_yoy = 1;
  sheet.margin.operating_ttm = 1;
  sheet.valuation.per_ttm = 1;
  sheet.market_data.price = 1;
  return sheet;
}

describe("INV-08 검사 범위", () => {
  it("숫자를 담은 절은 전부 검사 목록에 있거나, 사유가 적힌 면제여야 한다", () => {
    const sheet = populated();
    const scanned = new Set<string>(SOURCE_SCANNED_SECTIONS);
    const meta = new Set(["missing_fields", "field_sources", "source_manifest", "source_errors"]);

    const unguarded = Object.entries(sheet)
      .filter(([key, value]) => !meta.has(key) && holdsNumber(value))
      .map(([key]) => key)
      .filter((key) => !scanned.has(key) && !(key in EXEMPT));

    // 실패하면 새 절이 출처 검사 밖에 있다는 뜻이다. 목록에 넣거나, EXEMPT 에 사유를 적어라.
    expect(unguarded).toEqual([]);
  });

  it("cashflow 가 실제로 검사된다 — 출처 없는 현금흐름 수치는 버그로 잡힌다", () => {
    const sheet = populated();
    // 출처를 일부러 지운다. 검사 범위 안이면 이 경로가 반환돼야 한다.
    delete sheet.field_sources["cashflow.operating_ttm"];
    expect(fieldsMissingSource(sheet)).toContain("cashflow.operating_ttm");
  });

  it("출처가 붙어 있으면 통과한다", () => {
    const sheet = populated();
    sheet.field_sources["cashflow.operating_ttm"] = { source: "dart", as_of: "2026-03-31" };
    expect(fieldsMissingSource(sheet)).not.toContain("cashflow.operating_ttm");
  });
});
