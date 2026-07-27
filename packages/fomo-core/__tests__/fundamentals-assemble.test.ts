import { describe, expect, it } from "vitest";
import {
  assembleFactSheet,
  cagr3y,
  canonicalFactsheetJson,
  cashRunwayQuarters,
  collectMissingFields,
  emptyFactSheet,
  fieldsMissingSource,
  marginTrend,
  sampleStdev,
  type FactSheetInput,
  type QuarterRecord,
} from "@fomo/core";

/** WO-SUB-01 §6-4·§6-5 + 완료 조건 1·2·3. */

function quarter(period: string, periodEnd: string, filedAt: string, revenue: number, operating: number): QuarterRecord {
  return {
    period,
    period_end: periodEnd,
    filed_at: filedAt,
    revenue,
    operating_income: operating,
    net_income: operating,
    eps_diluted: operating / 100,
    source: "test",
  };
}

const QUARTERS: QuarterRecord[] = [
  quarter("2024Q2", "2024-06-30", "2024-08-14", 1_000, 100),
  quarter("2024Q3", "2024-09-30", "2024-11-14", 1_000, 120),
  quarter("2024Q4", "2024-12-31", "2025-02-14", 1_000, 90),
  quarter("2025Q1", "2025-03-31", "2025-05-15", 1_000, 110),
  quarter("2025Q2", "2025-06-30", "2025-08-14", 1_100, 150),
  quarter("2025Q3", "2025-09-30", "2025-11-14", 1_100, 160),
  quarter("2025Q4", "2025-12-31", "2026-02-14", 1_100, 140),
  quarter("2026Q1", "2026-03-31", "2026-05-15", 1_200, 170),
];

const ANNUAL: QuarterRecord[] = [
  quarter("2022FY", "2022-12-31", "2023-03-31", 3_000, 300),
  quarter("2023FY", "2023-12-31", "2024-03-31", 3_500, 350),
  quarter("2024FY", "2024-12-31", "2025-03-31", 4_000, 400),
  quarter("2025FY", "2025-12-31", "2026-03-31", 4_300, 450),
];

function baseInput(overrides: Partial<FactSheetInput> = {}): FactSheetInput {
  return {
    canonical: "테스트",
    displayName: "테스트",
    symbol: "000000",
    market: "KR",
    currency: "KRW",
    snapshotAt: "2026-07-28T00:00:00.000Z",
    quarters: QUARTERS,
    annual: ANNUAL,
    equity: [{ period_end: "2026-03-31", filed_at: "2026-05-15", value: 10_000 }],
    liabilities: [{ period_end: "2026-03-31", filed_at: "2026-05-15", value: 5_000 }],
    totalDebt: [{ period_end: "2026-03-31", filed_at: "2026-05-15", value: 2_000 }],
    cash: [{ period_end: "2026-03-31", filed_at: "2026-05-15", value: 3_000 }],
    operatingCashFlow: QUARTERS.map((q) => ({ period_end: q.period_end, filed_at: q.filed_at, value: 50 })),
    interestExpense: QUARTERS.map((q) => ({ period_end: q.period_end, filed_at: q.filed_at, value: 10 })),
    depreciation: QUARTERS.map((q) => ({ period_end: q.period_end, filed_at: q.filed_at, value: 20 })),
    closes: [],
    sharesSeries: [],
    marketData: { market_cap: 12_000, shares_outstanding: 100, price: 120, price_as_of: "2026-07-27", source: "test_source" },
    consensus: {
      available: false,
      revenue_fy1: null,
      revenue_fy2: null,
      revenue_fy3: null,
      eps_fy1: null,
      eps_fy2: null,
      source: null,
      as_of: null,
      analyst_count: null,
      periods: [],
    },
    classification: { sector: null, industry: null, scheme: null, source: null },
    reported: {},
    sourceManifest: {},
    sourceErrors: [],
    ...overrides,
  };
}

describe("파생 지표", () => {
  const sheet = assembleFactSheet(baseInput());

  it("TTM 은 최근 4분기 합", () => {
    expect(sheet.fiscal.ttm.revenue).toBe(1_100 + 1_100 + 1_100 + 1_200);
    expect(sheet.fiscal.ttm.operating_income).toBe(150 + 160 + 140 + 170);
  });

  it("전년동기 대비는 4분기 전과 비교한다", () => {
    expect(sheet.growth.revenue_yoy).toBe(20); // 1200 vs 1000
  });

  it("3년 CAGR 은 연간 관측 4개가 있어야 계산된다", () => {
    expect(sheet.growth.revenue_cagr_3y).not.toBeNull();
    expect(cagr3y(ANNUAL.slice(-3))).toBeNull();
  });

  it("PER/PBR/PSR 은 시가총액 ÷ TTM 총액 한 기준으로 계산된다", () => {
    expect(sheet.valuation.per_ttm).toBeCloseTo(12_000 / 620, 3);
    expect(sheet.valuation.pbr).toBeCloseTo(12_000 / 10_000, 3);
    expect(sheet.valuation.psr_ttm).toBeCloseTo(12_000 / 4_500, 3);
  });

  it("EV/EBITDA 는 감가상각비가 있을 때만 계산된다", () => {
    expect(sheet.valuation.ev_ebitda).not.toBeNull();
    const noDa = assembleFactSheet(baseInput({ depreciation: [] }));
    expect(noDa.valuation.ev_ebitda).toBeNull();
    expect(noDa.missing_fields).toContain("valuation.ev_ebitda");
  });

  it("마진 표준편차는 8분기가 모여야 계산된다 (§6-5)", () => {
    expect(sheet.margin.operating_stdev_8q).not.toBeNull();
    const short = assembleFactSheet(baseInput({ quarters: QUARTERS.slice(-5) }));
    expect(short.margin.operating_stdev_8q).toBeNull();
    expect(short.margin.trend_8q).toBe("unknown");
  });

  it("sampleStdev 는 표본표준편차(n-1)", () => {
    expect(sampleStdev([10, 12, 14])).toBe(2);
    expect(sampleStdev([5])).toBeNull();
  });

  it("marginTrend 는 8분기 미만이면 unknown", () => {
    expect(marginTrend([1, 2, 3])).toBe("unknown");
    expect(marginTrend([5, 5, 5, 5, 10, 10, 10, 10])).toBe("expanding");
    expect(marginTrend([10, 10, 10, 10, 5, 5, 5, 5])).toBe("contracting");
    expect(marginTrend([10, 10, 10, 10, 10, 10, 10, 10])).toBe("flat");
  });
});

describe("현금 런웨이 (§6-4)", () => {
  it("영업현금흐름 4분기 합이 음수일 때만 계산한다", () => {
    expect(cashRunwayQuarters(1_000, [-50, -50, -50, -50])).toBe(20);
  });

  it("양수 현금흐름이면 null — '무한'이라고 쓰지 않는다", () => {
    expect(cashRunwayQuarters(1_000, [50, 50, 50, 50])).toBeNull();
  });

  it("4분기가 모이지 않으면 null", () => {
    expect(cashRunwayQuarters(1_000, [-50, -50])).toBeNull();
  });

  it("흑자 종목의 팩트시트에는 런웨이가 없고 결측으로 등재된다", () => {
    const sheet = assembleFactSheet(baseInput());
    expect(sheet.balance.cash_runway_quarters).toBeNull();
    expect(sheet.missing_fields).toContain("balance.cash_runway_quarters");
  });
});

describe("결측 정직성 (완료 조건 2)", () => {
  it("missing_fields 가 실제 null 필드와 정확히 일치한다", () => {
    const sheet = assembleFactSheet(baseInput());
    // 재수집해도 같은 목록이 나와야 한다 — 손으로 나열하지 않았다는 증거.
    expect(sheet.missing_fields).toEqual(collectMissingFields(sheet));
  });

  it("값이 채워지면 목록에서 빠진다", () => {
    const sheet = assembleFactSheet(baseInput());
    expect(sheet.missing_fields).toContain("classification.sector");
    const withSector = assembleFactSheet(
      baseInput({ classification: { sector: "제약", industry: "261", scheme: "naver_industry_code", source: "test" } })
    );
    expect(withSector.missing_fields).not.toContain("classification.sector");
  });

  it("상태값(null=이상 없음)은 결측으로 세지 않는다", () => {
    const sheet = assembleFactSheet(baseInput());
    expect(sheet.fiscal.fiscal_anomaly).toBeNull();
    expect(sheet.missing_fields).not.toContain("fiscal.fiscal_anomaly");
    expect(sheet.missing_fields).not.toContain("valuation.band_5y.metric");
    expect(sheet.missing_fields.some((path) => path.endsWith("insufficient_reason"))).toBe(false);
  });

  it("값이 있는 모든 스칼라에 출처가 붙어 있다 (§4 규칙 2)", () => {
    expect(fieldsMissingSource(assembleFactSheet(baseInput()))).toEqual([]);
  });
});

describe("빈 팩트시트 (완료 조건 1: 레코드 부재 불허)", () => {
  const sheet = emptyFactSheet({
    canonical: "데이터없음",
    displayName: "데이터없음",
    symbol: "",
    market: "US",
    currency: "USD",
    snapshotAt: "2026-07-28T00:00:00.000Z",
    sourceErrors: ["sec: CIK 매핑 없음"],
  });

  it("coverage_flag=none 이지만 레코드는 존재한다", () => {
    expect(sheet.fiscal.coverage_flag).toBe("none");
    expect(sheet.fiscal.quarters).toEqual([]);
    expect(sheet.canonical).toBe("데이터없음");
  });

  it("실패 사유를 그대로 보존한다", () => {
    expect(sheet.source_errors).toEqual(["sec: CIK 매핑 없음"]);
  });

  it("결측 목록이 비어 있지 않다", () => {
    expect(sheet.missing_fields.length).toBeGreaterThan(20);
  });
});

describe("통화 환산 금지 (§4 규칙 3)", () => {
  it("KRW 입력이 그대로 KRW 로 저장된다", () => {
    const sheet = assembleFactSheet(baseInput());
    expect(sheet.currency).toBe("KRW");
    expect(sheet.market_data.market_cap).toBe(12_000);
    expect(sheet.fiscal.quarters[0]!.revenue).toBe(1_000);
  });

  it("USD 입력도 값이 변하지 않는다 — 어디에도 환율이 곱해지지 않는다", () => {
    const sheet = assembleFactSheet(baseInput({ market: "US", currency: "USD", symbol: "TEST" }));
    expect(sheet.currency).toBe("USD");
    expect(sheet.market_data.market_cap).toBe(12_000);
    expect(sheet.fiscal.ttm.revenue).toBe(4_500);
  });
});

describe("결정론 (완료 조건 3)", () => {
  it("같은 입력이면 정규화 JSON 이 동일하다", () => {
    expect(canonicalFactsheetJson(assembleFactSheet(baseInput()))).toBe(canonicalFactsheetJson(assembleFactSheet(baseInput())));
  });

  it("snapshot_at 이 달라도 정규화 JSON 은 동일하다(시각은 내용이 아니다)", () => {
    const a = assembleFactSheet(baseInput({ snapshotAt: "2026-07-28T00:00:00.000Z" }));
    const b = assembleFactSheet(baseInput({ snapshotAt: "2026-07-29T09:31:00.000Z" }));
    expect(canonicalFactsheetJson(a)).toBe(canonicalFactsheetJson(b));
  });

  it("source_manifest 의 fetched_at 이 달라도 정규화 JSON 은 동일하다", () => {
    const a = assembleFactSheet(baseInput({ sourceManifest: { s: { source: "x", fetched_at: "2026-07-28T00:00:00Z" } } }));
    const b = assembleFactSheet(baseInput({ sourceManifest: { s: { source: "x", fetched_at: "2026-07-29T00:00:00Z" } } }));
    expect(canonicalFactsheetJson(a)).toBe(canonicalFactsheetJson(b));
  });

  it("내용이 바뀌면 정규화 JSON 도 바뀐다", () => {
    const a = assembleFactSheet(baseInput());
    const b = assembleFactSheet(baseInput({ marketData: { ...baseInput().marketData, market_cap: 13_000 } }));
    expect(canonicalFactsheetJson(a)).not.toBe(canonicalFactsheetJson(b));
  });
});
