import { describe, it, expect } from "vitest";
import { buildKeyMetricCards, formatLargeNumber } from "../src/keyMetricsFormat";
import type { KeyMetrics } from "../src/stockTypes";

const ALL_NULL: KeyMetrics = {
  eps: null,
  bookValue: null,
  freeCashflow: null,
  totalDebt: null,
  totalCash: null,
  currentRatio: null,
  quickRatio: null,
  returnOnAssets: null,
  returnOnEquity: null,
  debtToEquity: null,
  revenueGrowth: null,
  profitMargins: null,
  grossMargins: null,
  priceToSalesTrailing12Months: null,
  pegRatio: null,
};

describe("formatLargeNumber", () => {
  it("USD 단위 축약 (T/B/M)", () => {
    expect(formatLargeNumber(2.5e12, "USD")).toBe("$2.50T");
    expect(formatLargeNumber(3.2e9, "USD")).toBe("$3.20B");
    expect(formatLargeNumber(4.5e6, "USD")).toBe("$4.5M");
  });

  it("KRW 단위 축약 (조/억)", () => {
    expect(formatLargeNumber(1.5e12, "KRW")).toBe("1.5조");
    expect(formatLargeNumber(3e8, "KRW")).toBe("3억");
  });

  it("음수도 부호를 유지", () => {
    expect(formatLargeNumber(-2e9, "USD")).toBe("-$2.00B");
    expect(formatLargeNumber(-1.5e12, "KRW")).toBe("-1.5조");
  });

  it("작은 수는 로캘 포맷", () => {
    expect(formatLargeNumber(1234, "USD")).toBe("$1,234");
    expect(formatLargeNumber(0, "USD")).toBe("$0");
  });
});

describe("buildKeyMetricCards 데이터 정합성", () => {
  it("모든 지표 결측이면 빈 배열", () => {
    expect(buildKeyMetricCards(ALL_NULL)).toEqual([]);
  });

  it("유효한 지표만 카드로 생성하고 결측은 제외", () => {
    const cards = buildKeyMetricCards({ ...ALL_NULL, eps: 3.14, pegRatio: 1.2 });
    expect(cards.map((c) => c.label)).toEqual(["EPS", "PEG"]);
  });

  it("0은 결측이 아니므로 카드로 표시", () => {
    const cards = buildKeyMetricCards({ ...ALL_NULL, eps: 0 });
    expect(cards).toEqual([{ label: "EPS", value: "0.00", tier: "primary" }]);
  });

  it("NaN/Infinity 등 이상값은 결측으로 처리", () => {
    const cards = buildKeyMetricCards({
      ...ALL_NULL,
      eps: NaN,
      pegRatio: Infinity,
      bookValue: -Infinity,
    });
    expect(cards).toEqual([]);
  });

  it("비율 지표는 % 로, 배수 지표는 '배'로 포맷", () => {
    const cards = buildKeyMetricCards({
      ...ALL_NULL,
      profitMargins: 0.1234,
      pegRatio: 1.5,
    });
    expect(cards).toContainEqual({ label: "순이익률", value: "12.34%", tier: "primary" });
    expect(cards).toContainEqual({ label: "PEG", value: "1.50배", tier: "secondary" });
  });

  it("통화 단위가 큰 금액 지표 포맷에 반영", () => {
    const cards = buildKeyMetricCards({ ...ALL_NULL, totalCash: 5e8 }, "KRW");
    expect(cards).toContainEqual({ label: "총현금", value: "5억", tier: "secondary" });
  });

  it("primary 지표가 secondary 보다 먼저 정렬", () => {
    const cards = buildKeyMetricCards({
      ...ALL_NULL,
      pegRatio: 1.0, // secondary
      eps: 2.0, // primary
    });
    expect(cards.map((c) => c.tier)).toEqual(["primary", "secondary"]);
  });
});
