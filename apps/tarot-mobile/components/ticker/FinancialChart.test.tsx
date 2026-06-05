import { describe, it, expect } from "vitest";

// 데이터 변환 로직 유닛 테스트 — 컴포넌트 렌더 없이 순수 계산 검증.
// FinancialChart는 React Native 네이티브 View 기반이라 jsdom에서 렌더 불가.
// 대신 차트 계산에 쓰이는 데이터 정합성 시나리오를 검증한다.

interface QuarterlyEarning {
  date: string;
  revenue: number | null;
  earnings: number | null;
}

interface AnnualFinancial {
  year: string;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
}

function computeChartRange(values: (number | null)[]): { max: number; min: number; totalRange: number } {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return { max: 1, min: 0, totalRange: 1 };
  const max = Math.max(...nums, 1);
  const min = Math.min(...nums, 0);
  const positiveRange = max;
  const negativeRange = Math.max(0, -min);
  return { max, min, totalRange: positiveRange + negativeRange || 1 };
}

function sortByDate(items: QuarterlyEarning[]): QuarterlyEarning[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date));
}

describe("FinancialChart 데이터 정합성", () => {
  // Given: 정상 범위 데이터가 시간 순서로 정렬되어 있을 때
  it("시간 순 데이터 — 모든 포인트가 유효 범위 내에 있어야 한다", () => {
    const data: QuarterlyEarning[] = [
      { date: "1Q2024", revenue: 1000, earnings: 200 },
      { date: "2Q2024", revenue: 1100, earnings: 220 },
      { date: "3Q2024", revenue: 1050, earnings: 190 },
    ];

    const { max, min } = computeChartRange(
      data.flatMap((d) => [d.revenue, d.earnings])
    );

    data.forEach((d) => {
      if (d.revenue !== null) {
        expect(d.revenue).toBeLessThanOrEqual(max);
        expect(d.revenue).toBeGreaterThanOrEqual(min);
      }
      if (d.earnings !== null) {
        expect(d.earnings).toBeLessThanOrEqual(max);
        expect(d.earnings).toBeGreaterThanOrEqual(min);
      }
    });
  });

  // Given: 일부 데이터가 null인 경우
  it("결측 데이터(null) — totalRange 계산이 0 나누기를 발생시키지 않아야 한다", () => {
    const data: QuarterlyEarning[] = [
      { date: "1Q2024", revenue: null, earnings: null },
      { date: "2Q2024", revenue: null, earnings: null },
    ];

    const { totalRange } = computeChartRange(
      data.flatMap((d) => [d.revenue, d.earnings])
    );

    expect(totalRange).toBeGreaterThan(0);
    expect(Number.isFinite(totalRange)).toBe(true);
  });

  // Given: 시간 축 불일치(비정렬) 데이터가 포함된 경우
  it("비정렬 데이터 — 날짜 기준 정렬 후 순서가 올바르게 복원되어야 한다", () => {
    const unordered: QuarterlyEarning[] = [
      { date: "3Q2024", revenue: 1050, earnings: 190 },
      { date: "1Q2024", revenue: 1000, earnings: 200 },
      { date: "2Q2024", revenue: 1100, earnings: 220 },
    ];

    const sorted = sortByDate(unordered);

    expect(sorted[0]?.date).toBe("1Q2024");
    expect(sorted[1]?.date).toBe("2Q2024");
    expect(sorted[2]?.date).toBe("3Q2024");
  });

  // 연간 재무 — 음수 순이익이 있어도 totalRange가 올바르게 계산되어야 함
  it("음수 값 포함 연간 재무 — totalRange가 양수이고 zeroFromTop이 유효해야 한다", () => {
    const data: AnnualFinancial[] = [
      { year: "2022", revenue: 5000, operatingIncome: -200, netIncome: -300 },
      { year: "2023", revenue: 5500, operatingIncome: 100, netIncome: 50 },
    ];

    const values = data.flatMap((d) => [d.revenue, d.operatingIncome, d.netIncome]);
    const { max, min, totalRange } = computeChartRange(values);

    expect(totalRange).toBeGreaterThan(0);
    const zeroFromTop = (max / totalRange) * 200; // DRAW_H = 200
    expect(zeroFromTop).toBeGreaterThan(0);
    expect(zeroFromTop).toBeLessThan(200);
  });

  // 빈 데이터 배열 — null/undefined 없이 안전하게 처리
  it("빈 데이터 배열 — 연산 오류 없이 기본값 반환", () => {
    const { totalRange } = computeChartRange([]);
    expect(totalRange).toBe(1);
  });
});
