import { describe, expect, it } from "vitest";
import type { StockBasics } from "@fomo/core";
import { parseUsdCompact, usValuationBand, usValuationBandWithDiagnostics } from "../../lib/us-valuation";

// WO-VAL — 미장 밸류축 복구. 실일봉+실매출+시총으로 PSR 밴드 역산(가짜 금지).
describe("parseUsdCompact", () => {
  it("$25.9B·$416.2M·$1.2T 를 USD 숫자로", () => {
    expect(parseUsdCompact("$25.9B")).toBe(25.9e9);
    expect(parseUsdCompact("$416.2M")).toBe(416.2e6);
    expect(parseUsdCompact("$1.2T")).toBe(1.2e12);
    expect(parseUsdCompact("N/A")).toBeNull();
    expect(parseUsdCompact(undefined)).toBeNull();
  });
});

function basics(marketCap: string, revenueThousands: number): StockBasics {
  return {
    name: "테스트",
    marketCap,
    metrics: [],
    financials: {
      periods: [{ title: "2024", estimate: false }, { title: "2025", estimate: false }],
      rows: [{ label: "벌어들인 돈(매출)", values: ["1억", "2억"], rawValues: [1000, revenueThousands] }],
    },
  };
}

describe("usValuationBand", () => {
  it("일봉·매출·시총으로 PSR 현재값+밴드를 실역산한다", () => {
    // 시총 $2.59B, 현재가 $100 → 발행주식수 2590만주. 매출 $1B(천달러 100만).
    const closes = Array.from({ length: 60 }, (_, i) => 80 + (i % 40)); // 80~119 범위
    const band = usValuationBand(basics("$2.59B", 1_000_000), closes, 100);
    expect(band).toBeDefined();
    expect(band!.currentPsr).toBeGreaterThan(0);
    expect(band!.psrHistory!.length).toBeGreaterThanOrEqual(3);
    // 현재 PSR = 시총/매출 = 2.59B / 1B = 2.59
    expect(band!.currentPsr).toBeCloseTo(2.59, 1);
    expect(band!.valuationHistoryLabel).toMatch(/최근/);
  });

  it("매출·시총·현재가·일봉 중 하나라도 없으면 undefined(억지 생성 금지)", () => {
    const closes = [90, 100, 110];
    expect(usValuationBand(basics("$2.59B", 1_000_000), closes, undefined)).toBeUndefined();
    expect(usValuationBand(basics("", 1_000_000), closes, 100)).toBeUndefined();
    expect(usValuationBand(null, closes, 100)).toBeUndefined();
    expect(usValuationBand(basics("$2.59B", 1_000_000), [], 100)).toBeUndefined();
  });

  it("밴드 계산 실패 원인을 입력별로 구조화해 남긴다", () => {
    const noRevenue: StockBasics = { name: "테스트", marketCap: "$2.59B", metrics: [] };
    expect(usValuationBandWithDiagnostics(null, [90, 100, 110], 100).diagnostic.reason).toBe("basics-missing");
    expect(usValuationBandWithDiagnostics(basics("", 1_000_000), [90, 100, 110], 100).diagnostic.reason).toBe("market-cap-missing");
    expect(usValuationBandWithDiagnostics(noRevenue, [90, 100, 110], 100).diagnostic.reason).toBe("revenue-missing");
    expect(usValuationBandWithDiagnostics(basics("$2.59B", 1_000_000), [90, 100, 110], undefined).diagnostic.reason).toBe("latest-price-missing");
    expect(usValuationBandWithDiagnostics(basics("$2.59B", 1_000_000), [100], 100).diagnostic.reason).toBe("closes-insufficient");
  });
});
