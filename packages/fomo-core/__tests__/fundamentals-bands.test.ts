import { describe, expect, it } from "vitest";
import {
  computeBands,
  detectUnadjustedSplit,
  percentileRank,
  sharesDrift,
  MIN_WINDOW_YEARS,
  type DailyClose,
  type EquityPoint,
  type QuarterRecord,
} from "@fomo/core";

/** WO-SUB-01 §6-3 — 5년 밴드 백분위. 완료 조건 5: sufficient=false 면 percentile 은 반드시 null. */

/** 거래일 근사 시계열(주말 제외 없이 매일 — 밴드는 종가가 있는 날만 세므로 결과에 영향 없음). */
function closes(startIso: string, days: number, price: (i: number) => number): DailyClose[] {
  const start = Date.parse(`${startIso}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    close: price(i),
  }));
}

function quarter(period: string, periodEnd: string, filedAt: string, net: number | null, revenue = 1_000): QuarterRecord {
  return {
    period,
    period_end: periodEnd,
    filed_at: filedAt,
    revenue,
    operating_income: net,
    net_income: net,
    eps_diluted: net === null ? null : net / 100,
    source: "test",
  };
}

/** 2020Q1 부터 매 분기 흑자 100 을 내는 종목 — 6년치. */
function profitableQuarters(): QuarterRecord[] {
  const out: QuarterRecord[] = [];
  for (let year = 2019; year <= 2026; year += 1) {
    for (const [index, end] of ["03-31", "06-30", "09-30", "12-31"].entries()) {
      const periodEnd = `${year}-${end}`;
      // 공시는 기간말 + 45일.
      const filed = new Date(Date.parse(`${periodEnd}T00:00:00Z`) + 45 * 86_400_000).toISOString().slice(0, 10);
      out.push(quarter(`${year}Q${index + 1}`, periodEnd, filed, 100));
    }
  }
  return out;
}

function equityPoints(): EquityPoint[] {
  return profitableQuarters().map((q) => ({ period_end: q.period_end, filed_at: q.filed_at, equity: 5_000 }));
}

describe("computeBands — 충분한 이력", () => {
  const result = computeBands({
    closes: closes("2021-07-28", 1_800, (i) => 100 + (i % 100)),
    quarters: profitableQuarters(),
    equityPoints: equityPoints(),
    sharesRef: 10,
    sharesRefAsOf: "2026-07-27",
    sharesSeries: [{ as_of: "2026-07-27", shares: 10 }],
  });

  it("PER 밴드가 만들어지고 백분위가 채워진다", () => {
    expect(result.per.sufficient).toBe(true);
    expect(result.per.current_percentile).not.toBeNull();
    expect(result.per.p20).not.toBeNull();
    expect(result.per.p50).not.toBeNull();
    expect(result.per.p80).not.toBeNull();
    expect(result.per.insufficient_reason).toBeNull();
  });

  it("윈도우는 5년 상한으로 잘린다", () => {
    const spanYears = (Date.parse(result.per.window_end) - Date.parse(result.per.window_start)) / (365 * 86_400_000);
    expect(spanYears).toBeLessThanOrEqual(5.01);
  });

  it("기준주식수를 노출해 값이 재현 가능하다(§12 분할 미조정 방지)", () => {
    expect(result.per.shares_ref).toBe(10);
    expect(result.per.basis).toContain("shares_ref");
  });
});

describe("computeBands — 부족한 이력 (완료 조건 5)", () => {
  it("종가 이력이 3년 미만이면 sufficient=false, percentile=null", () => {
    const result = computeBands({
      closes: closes("2025-01-01", 400, () => 100),
      quarters: profitableQuarters(),
      equityPoints: equityPoints(),
      sharesRef: 10,
      sharesRefAsOf: "2026-01-01",
    });
    for (const band of [result.per, result.pbr, result.psr]) {
      expect(band.sufficient).toBe(false);
      expect(band.current_percentile).toBeNull();
      expect(band.p20).toBeNull();
      expect(band.insufficient_reason).toContain(`${MIN_WINDOW_YEARS}년 미만`);
    }
  });

  it("종가가 없으면 사유를 남기고 전부 null", () => {
    const result = computeBands({ closes: [], quarters: [], equityPoints: [], sharesRef: 10, sharesRefAsOf: null });
    expect(result.per.insufficient_reason).toBe("일별 종가 없음");
    expect(result.per.current_percentile).toBeNull();
  });

  it("기준주식수가 없으면 밴드를 만들지 않는다", () => {
    const result = computeBands({
      closes: closes("2021-01-01", 1_800, () => 100),
      quarters: profitableQuarters(),
      equityPoints: equityPoints(),
      sharesRef: null,
      sharesRefAsOf: null,
    });
    expect(result.per.insufficient_reason).toContain("기준주식수");
  });

  it("분기 관측이 짧으면 유효 관측 하한에 미달한다(KR 네이버 5분기 케이스)", () => {
    // 네이버 재무 표는 분기 5개만 준다 → 윈도우 앞쪽 대부분에서 TTM 을 만들 수 없다.
    const recent = profitableQuarters().filter((q) => q.period_end <= "2026-03-31").slice(-5);
    const result = computeBands({
      closes: closes("2021-07-28", 1_800, () => 100),
      quarters: recent,
      equityPoints: [],
      sharesRef: 10,
      sharesRefAsOf: "2026-07-27",
    });
    expect(result.per.sufficient).toBe(false);
    expect(result.per.current_percentile).toBeNull();
    expect(result.per.observations).toBeGreaterThan(0);
    expect(result.per.insufficient_reason).toMatch(/유효 관측/);
  });
});

describe("적자 구간은 null 로 빠진다 — 버그가 아니라 사실이다 (§6-3)", () => {
  it("전 구간 적자면 PER 관측이 0이고 sufficient=false", () => {
    const loss = profitableQuarters().map((q) => ({ ...q, net_income: -50, operating_income: -50 }));
    const result = computeBands({
      closes: closes("2021-07-28", 1_800, () => 100),
      quarters: loss,
      equityPoints: equityPoints(),
      sharesRef: 10,
      sharesRefAsOf: "2026-07-27",
    });
    expect(result.per.observations).toBe(0);
    expect(result.per.sufficient).toBe(false);
    expect(result.per.current).toBeNull();
    // 매출은 양수라 PSR 은 계산된다 — 적자 종목에서 PSR 만 남는 것이 의도된 동작이다.
    expect(result.psr.sufficient).toBe(true);
  });
});

describe("분할 미조정 가드 (§12)", () => {
  it("하루 사이 절반으로 떨어지면 탐지한다", () => {
    const series = [
      { date: "2024-04-12", close: 560_000 },
      { date: "2024-04-15", close: 112_000 },
    ];
    expect(detectUnadjustedSplit(series)?.date).toBe("2024-04-15");
  });

  it("조정된 시계열은 탐지되지 않는다", () => {
    expect(detectUnadjustedSplit(closes("2021-01-01", 200, (i) => 100 + i * 0.1))).toBeNull();
  });

  it("점프가 있으면 밴드를 만들지 않는다", () => {
    const spliced = closes("2021-07-28", 1_800, (i) => (i < 900 ? 1_000 : 100));
    const result = computeBands({
      closes: spliced,
      quarters: profitableQuarters(),
      equityPoints: equityPoints(),
      sharesRef: 10,
      sharesRefAsOf: "2026-07-27",
    });
    expect(result.per.insufficient_reason).toContain("분할 미조정 의심");
    expect(result.per.current_percentile).toBeNull();
  });
});

describe("주식수 변동 가드", () => {
  it("윈도우 내 주식수가 20% 넘게 변하면 밴드를 만들지 않는다", () => {
    const result = computeBands({
      closes: closes("2021-07-28", 1_800, () => 100),
      quarters: profitableQuarters(),
      equityPoints: equityPoints(),
      sharesRef: 10,
      sharesRefAsOf: "2026-07-27",
      sharesSeries: [
        { as_of: "2022-01-01", shares: 10 },
        { as_of: "2025-01-01", shares: 20 },
      ],
    });
    expect(result.per.insufficient_reason).toContain("주식수 변동");
  });

  it("sharesDrift 는 윈도우 밖 관측을 무시한다", () => {
    const series = [
      { as_of: "2019-01-01", shares: 1 },
      { as_of: "2024-01-01", shares: 10 },
      { as_of: "2025-01-01", shares: 11 },
    ];
    expect(sharesDrift(series, "2023-01-01")).toBeCloseTo(0.1, 5);
  });
});

describe("percentileRank", () => {
  it("이하 비율을 100 기준으로 준다", () => {
    expect(percentileRank(3, [1, 2, 3, 4, 5])).toBe(60);
    expect(percentileRank(0, [1, 2, 3])).toBe(0);
    expect(percentileRank(9, [1, 2, 3])).toBe(100);
  });

  it("표본이 없으면 null", () => {
    expect(percentileRank(1, [])).toBeNull();
  });
});

/**
 * 밴드 입력은 표시 상한이 아니라 **분기 전체 이력**이어야 한다.
 *
 * 실측 결함: `assembleFactSheet` 가 표시용으로 8개로 자른 `fiscal.quarters` 를 밴드에 넘겨서,
 * 5년 윈도우의 앞 3년이 전부 null 이 되고 어떤 종목도 `sufficient` 에 도달할 수 없었다.
 * 몇 년을 수집하든 무관하게 막히는 구조라 회귀하면 다시 조용히 전부 false 가 된다.
 */
describe("밴드 입력 = 분기 전체 이력 (회귀 방지)", () => {
  const YEARS = 6;

  function syntheticQuarters(): QuarterRecord[] {
    const out: QuarterRecord[] = [];
    for (let index = 0; index < YEARS * 4; index += 1) {
      const year = 2020 + Math.floor(index / 4);
      const quarter = (index % 4) + 1;
      const periodEnd = [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`][quarter - 1]!;
      out.push({
        period: `${year}Q${quarter}`,
        period_end: periodEnd,
        // 기간말 45일 뒤 공시로 둔다 — look-ahead 가드가 실제로 걸리는 조건.
        filed_at: new Date(Date.parse(periodEnd) + 45 * 86_400_000).toISOString().slice(0, 10),
        filed_at_source: "disclosed",
        revenue: 1_000_000,
        operating_income: 100_000,
        net_income: 80_000,
        eps_diluted: null,
        source: "test",
      });
    }
    return out;
  }

  function closes(): DailyClose[] {
    const out: DailyClose[] = [];
    const start = Date.UTC(2020, 0, 1);
    const end = Date.UTC(2026, 0, 1);
    for (let time = start; time <= end; time += 86_400_000) {
      const date = new Date(time);
      // 주말 제외 — 거래일 근사.
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
      out.push({ date: date.toISOString().slice(0, 10), close: 10_000 });
    }
    return out;
  }

  const shared = { closes: closes(), equityPoints: [], sharesRef: 1_000_000, sharesRefAsOf: "2026-01-01", sharesSeries: [] };

  it("전체 이력을 주면 PER 밴드가 충족된다", () => {
    const bands = computeBands({ ...shared, quarters: syntheticQuarters() });
    expect(bands.per.sufficient).toBe(true);
    expect(bands.per.current_percentile).not.toBeNull();
  });

  it("표시 상한(최근 8개)만 주면 충족되지 않는다 — 이것이 실측 결함이었다", () => {
    const bands = computeBands({ ...shared, quarters: syntheticQuarters().slice(-8) });
    expect(bands.per.sufficient).toBe(false);
    expect(bands.per.current_percentile).toBeNull();
  });
});
