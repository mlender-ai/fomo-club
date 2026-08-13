import { describe, expect, it } from "vitest";
import { businessInvalidationCatalog, judgeBusinessInvalidation } from "../src/risk/business-invalidation";
import { seriesForMetric } from "../src/risk/invalidation-series";
import type { FactSheet, QuarterRecord } from "../src/fundamentals/types";

/**
 * WO-SUB-07 §6-4 — 판정 입력 추출.
 *
 * 핵심은 **뽑을 수 없는 경로를 0 이나 추정치로 채우지 않는 것**이다. 채우면 채점이 거짓이 되고,
 * §6-4 가 요구한 "판정 불가를 미충족으로 처리하지 않는다" 가 깨진다.
 */

function quarter(period: string, revenue: number | null, operating: number | null): QuarterRecord {
  return {
    period,
    period_end: `${period.slice(0, 4)}-03-31`,
    filed_at: `${period.slice(0, 4)}-05-15`,
    revenue,
    operating_income: operating,
    net_income: null,
    eps_diluted: null,
    source: "test",
  };
}

function sheet(overrides: Record<string, unknown> = {}): FactSheet {
  return {
    fiscal: { quarters: [], annual: [], ttm: {}, band_quarters: 0, coverage_flag: "full" },
    margin: { operating_ttm: null, net_ttm: null, operating_stdev_8q: null, operating_stdev_annual: null, operating_stdev_annual_years: 0, trend_8q: "unknown" },
    balance: { cash_runway_quarters: null },
    cashflow: { dividend_paid_ttm: null, free_cash_flow_ttm: null },
    ...overrides,
  } as unknown as FactSheet;
}

describe("분기 파생 지표", () => {
  it("영업이익률을 분기에서 계산한다", () => {
    const result = seriesForMetric("fiscal.quarters[].operating_margin", sheet({
      fiscal: { quarters: [quarter("2025Q1", 1000, 100), quarter("2025Q2", 1000, 80)] },
    }));
    expect(result).toEqual({ ok: true, series: [10, 8] });
  });

  it("매출이 0 이하인 분기는 비율에서 뺀다 — 0 으로 채우지 않는다", () => {
    const result = seriesForMetric("fiscal.quarters[].operating_margin", sheet({
      fiscal: { quarters: [quarter("2025Q1", 0, 100), quarter("2025Q2", 1000, 80)] },
    }));
    expect(result).toEqual({ ok: true, series: [8] });
  });

  /**
   * 전년 동기는 **4분기 전**이다. 직전 분기 대비로 재면 계절성이 성장률로 둔갑한다 —
   * WO-SUB-02 에서 분기 표준편차가 계절성에 오염됐던 것과 같은 함정.
   */
  it("매출 YoY 는 4분기 전과 비교한다", () => {
    const quarters = [
      quarter("2024Q1", 100, 10),
      quarter("2024Q2", 200, 10),
      quarter("2024Q3", 300, 10),
      quarter("2024Q4", 400, 10),
      quarter("2025Q1", 110, 10),
    ];
    const result = seriesForMetric("fiscal.quarters[].revenue_yoy", sheet({ fiscal: { quarters } }));
    expect(result).toEqual({ ok: true, series: [10] });
  });

  it("4분기 미만이면 YoY 를 만들지 않는다", () => {
    const result = seriesForMetric("fiscal.quarters[].revenue_yoy", sheet({
      fiscal: { quarters: [quarter("2025Q1", 100, 10), quarter("2025Q2", 200, 10)] },
    }));
    expect(result.ok).toBe(false);
  });
});

describe("스칼라 지표", () => {
  it("현금 런웨이는 값 1개로 임계값 판정이 된다", () => {
    expect(seriesForMetric("balance.cash_runway_quarters", sheet({ balance: { cash_runway_quarters: 3.2 } }))).toEqual({
      ok: true,
      series: [3.2],
    });
  });

  it("런웨이가 null 이면 미확보다 — 영업현금흐름 흑자면 정상적으로 null 이다", () => {
    expect(seriesForMetric("balance.cash_runway_quarters", sheet()).ok).toBe(false);
  });

  it("배당/FCF 비율을 만든다", () => {
    const result = seriesForMetric("cashflow.dividend_paid_ttm/free_cash_flow_ttm", sheet({
      cashflow: { dividend_paid_ttm: 130, free_cash_flow_ttm: 100 },
    }));
    expect(result).toEqual({ ok: true, series: [1.3] });
  });

  it("FCF 가 0 이하면 비율을 만들지 않는다 — 의미를 갖지 않는다", () => {
    expect(
      seriesForMetric("cashflow.dividend_paid_ttm/free_cash_flow_ttm", sheet({
        cashflow: { dividend_paid_ttm: 130, free_cash_flow_ttm: -50 },
      })).ok
    ).toBe(false);
  });
});

/**
 * **가장 중요한 단정.** 뽑을 수 없는 경로는 사유를 남기고 비운다.
 * 여기서 0 을 돌려주면 "대손이 안 늘었다" 로 채점되어 성적이 조용히 좋아진다(§12 실패 모드).
 */
describe("뽑을 수 없는 경로", () => {
  it("대손충당금 전입액이 없으면 0 으로 채우지 않는다(비은행·KR 은행의 정상 상태)", () => {
    const result = seriesForMetric("fiscal.quarters[].credit_loss_provision", sheet());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("관측 0건");
  });

  it("추세 전환은 직전 스냅샷이 없으면 판정하지 않는다", () => {
    const result = seriesForMetric("margin.trend_8q", sheet({ margin: { trend_8q: "expanding" } }));
    expect(result.ok).toBe(false);
  });

  it("모르는 경로는 조용히 통과시키지 않는다", () => {
    const result = seriesForMetric("made.up.path", sheet());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("알 수 없는");
  });
});

/**
 * WO-SUB-CLOSE PART A — 대손충당금 전입액 수집이 배선된 뒤의 동작.
 *
 * BANK_FINANCIAL 조건은 `consecutive_rise`(2분기 연속 증가)다. 그래서 이 경로는 **원계열**을
 * 줘야 하고, "연속"은 인접 분기끼리여야 한다 — 빠진 분기를 건너뛰어 비교하면 6개월 간격을
 * 연속 2분기로 읽는다.
 */
describe("대손충당금 전입액 (PART A 배선)", () => {
  /** 기간말을 실제 분기 간격으로 놓는다. `quarter()` 헬퍼는 연중 기간말이 같아 연속성 검증에 못 쓴다. */
  function provisionQuarter(periodEnd: string, provision: number | null | undefined): QuarterRecord {
    return {
      period: periodEnd.slice(0, 7),
      period_end: periodEnd,
      filed_at: periodEnd,
      revenue: null,
      operating_income: null,
      net_income: null,
      eps_diluted: null,
      source: "test",
      ...(provision === undefined ? {} : { credit_loss_provision: provision }),
    };
  }

  const provisionSheet = (quarters: QuarterRecord[]): FactSheet => sheet({ fiscal: { quarters } });

  it("연속 분기의 원계열을 오래된 것부터 준다(비율이 아니다)", () => {
    const result = seriesForMetric(
      "fiscal.quarters[].credit_loss_provision",
      provisionSheet([
        provisionQuarter("2025-03-31", 100),
        provisionQuarter("2025-06-30", 120),
        provisionQuarter("2025-09-30", 150),
      ])
    );
    expect(result).toEqual({ ok: true, series: [100, 120, 150] });
  });

  it("배선이 실제로 BANK 조건을 무효 판정까지 끌고 간다", () => {
    const catalog = businessInvalidationCatalog().find((row) => row.code === "BANK_FINANCIAL")!;
    const series = seriesForMetric(catalog.invalidation!.metric, provisionSheet([
      provisionQuarter("2025-03-31", 100),
      provisionQuarter("2025-06-30", 120),
      provisionQuarter("2025-09-30", 150),
    ]));
    expect(series.ok).toBe(true);
    if (!series.ok) return;
    expect(judgeBusinessInvalidation(catalog.invalidation!, { series: series.series })).toBe("invalidated");
  });

  it("분기가 끊기면 건너뛰어 잇지 않는다 — 마지막 연속 구간만 본다", () => {
    // 2024Q1·Q2 는 연속이지만 2025Q3 는 1년 뒤다. 셋을 이어 붙이면 없는 연속 증가가 생긴다.
    const result = seriesForMetric(
      "fiscal.quarters[].credit_loss_provision",
      provisionSheet([
        provisionQuarter("2024-03-31", 100),
        provisionQuarter("2024-06-30", 120),
        provisionQuarter("2025-09-30", 150),
      ])
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("연속 분기 부족");
  });

  it("필드가 아예 없는 분기는 0 이 아니라 관측 없음으로 센다", () => {
    const result = seriesForMetric(
      "fiscal.quarters[].credit_loss_provision",
      provisionSheet([provisionQuarter("2025-03-31", undefined), provisionQuarter("2025-06-30", undefined)])
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("관측 0건");
  });

  it("수집했으나 값이 null 인 분기도 관측으로 세지 않는다", () => {
    // 필드 부재(비은행)와 null(수집했으나 그 분기 값 없음)은 뜻이 다르지만, 둘 다 판정 입력이 아니다.
    const result = seriesForMetric(
      "fiscal.quarters[].credit_loss_provision",
      provisionSheet([provisionQuarter("2025-03-31", null), provisionQuarter("2025-06-30", 120)])
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("관측 1건");
  });

  it("환입(음수) 분기도 원계열에 그대로 남긴다 — 비율로 만들지 않으므로 부호가 뒤집히지 않는다", () => {
    const result = seriesForMetric(
      "fiscal.quarters[].credit_loss_provision",
      provisionSheet([
        provisionQuarter("2025-03-31", -20),
        provisionQuarter("2025-06-30", 10),
        provisionQuarter("2025-09-30", 40),
      ])
    );
    expect(result).toEqual({ ok: true, series: [-20, 10, 40] });
  });
});

describe("카탈로그 전 경로가 해석기에 등록돼 있다", () => {
  it("알 수 없는 경로가 하나도 없다 — 조건을 추가하고 해석기를 안 고치는 사고를 막는다", () => {
    const unknown: string[] = [];
    for (const row of businessInvalidationCatalog()) {
      if (!row.invalidation) continue;
      const result = seriesForMetric(row.invalidation.metric, sheet());
      if (!result.ok && result.reason.includes("알 수 없는")) unknown.push(`${row.code}: ${row.invalidation.metric}`);
    }
    expect(unknown).toEqual([]);
  });
});

describe("추출 → 판정 연결", () => {
  it("2분기 연속 하락이 실제 팩트시트에서 무효로 판정된다", () => {
    const catalog = businessInvalidationCatalog().find((row) => row.code === "CYCLICAL_COMMODITY")!;
    const series = seriesForMetric(catalog.invalidation!.metric, sheet({
      fiscal: { quarters: [quarter("2025Q1", 1000, 120), quarter("2025Q2", 1000, 100), quarter("2025Q3", 1000, 80)] },
    }));
    expect(series.ok).toBe(true);
    if (series.ok) expect(judgeBusinessInvalidation(catalog.invalidation!, { series: series.series })).toBe("invalidated");
  });
});
