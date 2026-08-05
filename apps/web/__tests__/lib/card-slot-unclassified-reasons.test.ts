import { describe, expect, it } from "vitest";
import { summarizeCardSlots, type CardSlotRow, type UnclassifiedDiagnostic } from "../../lib/card-slots/coverage";

/**
 * WO-SUB-FINISH [A-0] — 미분류 사유 분해 집계.
 *
 * A-0 이 묻는 것은 "미분류가 몇 장이냐"가 아니라 **"그중 02R 카탈로그가 푸는 것이 몇 장이냐"** 다.
 * `no_rule_matched` 만 카탈로그가 풀고 `no_sector`·`no_fiscal` 은 규칙을 늘려도 그대로다.
 * 이 집계가 두 종류를 섞으면 549종목 수집 여부를 잘못된 숫자로 결정한다.
 */

function diagnostic(reason: string): UnclassifiedDiagnostic {
  return {
    reason,
    scheme: "GICS",
    industry: "Software",
    coverage_flag: "partial",
    net_income_ttm: 100,
    revenue_yoy: 3,
    revenue_cagr_3y: 4,
    dividend_yield: null,
    pbr: 2.1,
    net_cash_ratio: 0.1,
    operating_stdev_annual_years: 5,
  };
}

function row(overrides: Partial<CardSlotRow>): CardSlotRow {
  return {
    canonical: "TEST",
    market: "US",
    slot1: true,
    slot2: false,
    slot3: false,
    slot2_reason: "no_record",
    slot3_reason: null,
    archetype: null,
    unclassified: null,
    ...overrides,
  };
}

describe("미분류 사유 분해 (A-0)", () => {
  it("`unclassified` 사유를 종류별로 나눠 센다", () => {
    const summary = summarizeCardSlots([
      row({ canonical: "A", slot3_reason: "unclassified", archetype: "UNCLASSIFIED", unclassified: diagnostic("no_rule_matched") }),
      row({ canonical: "B", slot3_reason: "unclassified", archetype: "UNCLASSIFIED", unclassified: diagnostic("no_rule_matched") }),
      row({ canonical: "C", slot3_reason: "unclassified", archetype: "UNCLASSIFIED", unclassified: diagnostic("no_sector") }),
    ]);

    expect(summary.slot3_reasons.unclassified).toBe(3);
    expect(summary.unclassified_reasons).toEqual({ no_rule_matched: 2, no_sector: 1 });
  });

  it("분류는 됐지만 다른 사유로 못 그리는 카드를 미분류로 세지 않는다", () => {
    // `bar_series_unavailable` 은 02R 이 못 푼다(계정 매핑 부재). 여기 섞이면 카탈로그 효과가 과대평가된다.
    const summary = summarizeCardSlots([
      row({ canonical: "BANK", slot3_reason: "bar_series_unavailable", archetype: "BANK_FINANCIAL" }),
      row({ canonical: "NOFS", slot3_reason: "no_factsheet" }),
    ]);

    expect(summary.unclassified_reasons).toEqual({});
    expect(summary.slot3_reasons).toEqual({ bar_series_unavailable: 1, no_factsheet: 1 });
  });

  it("슬롯 ③ 이 그려진 카드는 사유를 남기지 않는다", () => {
    const summary = summarizeCardSlots([row({ canonical: "OK", slot2: true, slot2_reason: null, slot3: true, archetype: "QUALITY_COMPOUNDER" })]);

    expect(summary.combinations["①②③"]).toBe(1);
    expect(summary.unclassified_reasons).toEqual({});
    expect(summary.slot3_reasons).toEqual({});
  });
});
