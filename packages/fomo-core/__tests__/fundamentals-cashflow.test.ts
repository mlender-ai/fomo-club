import { describe, expect, it } from "vitest";
import { deriveCashflow } from "../src/fundamentals/derive";
import type { PointObservation } from "../src/fundamentals/derive";

/**
 * 현금흐름 절 (WO-SUB-03.5 → 02R 선행).
 *
 * 02R 의 세 유형이 이 값들을 관측 지점으로 지목한다. 그래서 여기서 지키는 것은
 * "값이 그럴듯한가"가 아니라 **없는 것을 있는 것처럼 만들지 않는가**다.
 */

const Q = ["2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31"] as const;
const points = (values: readonly (number | null)[]): PointObservation[] =>
  values.flatMap((value, index) =>
    value === null ? [] : [{ period_end: Q[index]!, filed_at: `${Q[index]!.slice(0, 4)}-12-31`, value }]
  );

describe("deriveCashflow", () => {
  it("4분기가 다 있어야 TTM 을 만든다 — 3분기 합을 1년치로 읽지 않는다", () => {
    const three = deriveCashflow({
      operatingCashFlow: points([100, 100, 100, null]),
      capex: [],
      dividendPaid: [],
    });
    expect(three.operating_ttm).toBeNull();
    expect(three.coverage_flag).toBe("partial");
    // 왜 null 인지가 보여야 한다 — 관측은 3개다.
    expect(three.observed_quarters).toBe(3);
  });

  it("CapEx·배당은 부호 관행이 섞여도 크기로 읽는다", () => {
    const negative = deriveCashflow({
      operatingCashFlow: points([100, 100, 100, 100]),
      capex: points([-30, -30, -30, -30]),
      dividendPaid: points([-10, -10, -10, -10]),
    });
    const positive = deriveCashflow({
      operatingCashFlow: points([100, 100, 100, 100]),
      capex: points([30, 30, 30, 30]),
      dividendPaid: points([10, 10, 10, 10]),
    });
    expect(negative.capex_ttm).toBe(120);
    expect(negative.free_cash_flow_ttm).toBe(280);
    expect(negative).toEqual(positive);
  });

  it("CapEx 결측을 0 으로 대체하지 않는다 — FCF 가 부풀려지면 안 된다", () => {
    const result = deriveCashflow({
      operatingCashFlow: points([100, 100, 100, 100]),
      capex: [],
      dividendPaid: [],
    });
    expect(result.operating_ttm).toBe(400);
    expect(result.capex_ttm).toBeNull();
    expect(result.free_cash_flow_ttm).toBeNull();
  });

  it("적자 기업의 배당 비율은 내지 않는다(곳간에서 준 배당을 안전해 보이게 만들지 않는다)", () => {
    const result = deriveCashflow({
      operatingCashFlow: points([-50, -50, -50, -50]),
      capex: [],
      dividendPaid: points([10, 10, 10, 10]),
    });
    expect(result.dividend_coverage).toBeNull();
    // 대신 소진 속도가 나온다 — HYPERGROWTH·BIOTECH 의 관측 지점.
    expect(result.burn_per_quarter).toBe(50);
  });

  it("흑자면 소진 속도는 null 이다 — '무한'이라 쓰지 않는다", () => {
    const result = deriveCashflow({
      operatingCashFlow: points([100, 100, 100, 100]),
      capex: [],
      dividendPaid: points([25, 25, 25, 25]),
    });
    expect(result.burn_per_quarter).toBeNull();
    expect(result.dividend_coverage).toBe(0.25);
  });

  it("관측이 하나도 없으면 none — partial 과 구분한다", () => {
    const result = deriveCashflow({ operatingCashFlow: [], capex: [], dividendPaid: [] });
    expect(result.coverage_flag).toBe("none");
    expect(result.composed_of).toEqual([]);
  });
});
