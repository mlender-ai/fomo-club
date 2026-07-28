import { describe, expect, it } from "vitest";
import {
  applyHysteresis,
  classifyArchetype,
  DOCTRINE,
  forbiddenPaths,
  frameOf,
  RULESET_VERSION,
  THRESHOLDS,
  warningRequiredPaths,
  type ArchetypeCode,
  type ArchetypeHistory,
  type FactSheet,
  type QuarterRecord,
} from "@fomo/core";

/** WO-SUB-02 §6 — 분류 규칙. 완료 조건 3·4·5·6·7. */

function quarter(period: string, end: string, filed: string, revenue: number, operating: number): QuarterRecord {
  return { period, period_end: end, filed_at: filed, revenue, operating_income: operating, net_income: operating, eps_diluted: null, source: "test" };
}

/** 8분기 + 5회계연도를 가진 정상 팩트시트. 필요한 축만 오버라이드해서 쓴다. */
function sheet(overrides: {
  market?: "KR" | "US";
  currency?: "KRW" | "USD";
  scheme?: string | null;
  industry?: string | null;
  coverage?: "full" | "partial" | "none";
  netIncomeTtm?: number | null;
  revenueTtm?: number | null;
  revenueYoy?: number | null;
  cagr3y?: number | null;
  stdevAnnual?: number | null;
  stdevYears?: number;
  dividendYield?: number | null;
  pbr?: number | null;
  netCash?: number | null;
  marketCap?: number | null;
} = {}): FactSheet {
  const industry = overrides.industry === undefined ? "Computer Software: Prepackaged Software" : overrides.industry;
  const scheme = overrides.scheme === undefined ? "nasdaq_industry" : overrides.scheme;
  const quarters: QuarterRecord[] = Array.from({ length: 8 }, (_, i) =>
    quarter(`2025Q${(i % 4) + 1}`, `2025-0${(i % 9) + 1}-28`, `2025-1${i % 2}-01`, 1_000, 100)
  );
  return {
    symbol: "TEST",
    market: overrides.market ?? "US",
    currency: overrides.currency ?? "USD",
    snapshot_at: "2026-07-28T00:00:00.000Z",
    display_name: "테스트",
    canonical: "테스트",
    fiscal: {
      quarters: overrides.coverage === "none" ? [] : quarters,
      annual: [],
      ttm: {
        revenue: overrides.revenueTtm === undefined ? 4_000 : overrides.revenueTtm,
        operating_income: 400,
        net_income: overrides.netIncomeTtm === undefined ? 400 : overrides.netIncomeTtm,
        eps_diluted: null,
        composed_of: [],
      },
      coverage_flag: overrides.coverage ?? "full",
      fiscal_anomaly: null,
    },
    growth: {
      revenue_yoy: overrides.revenueYoy === undefined ? 5 : overrides.revenueYoy,
      revenue_cagr_3y: overrides.cagr3y === undefined ? 8 : overrides.cagr3y,
      operating_income_yoy: null,
    },
    margin: {
      operating_ttm: 10,
      net_ttm: 10,
      operating_stdev_8q: null,
      operating_stdev_annual: overrides.stdevAnnual === undefined ? 1.5 : overrides.stdevAnnual,
      operating_stdev_annual_years: overrides.stdevYears ?? 5,
      trend_8q: "flat",
    },
    valuation: {
      per_ttm: 20,
      pbr: overrides.pbr === undefined ? 3 : overrides.pbr,
      psr_ttm: 2,
      ev_ebitda: null,
      dividend_yield: overrides.dividendYield === undefined ? null : overrides.dividendYield,
      per_forward: null,
      band_5y: { metric: null, per: null, pbr: null, psr: null },
    },
    balance: {
      total_equity: 1_000,
      debt_to_equity: null,
      net_cash: overrides.netCash === undefined ? null : overrides.netCash,
      cash_and_equivalents: null,
      cash_runway_quarters: null,
      interest_coverage: null,
    },
    market_data: {
      market_cap: overrides.marketCap === undefined ? 10_000 : overrides.marketCap,
      shares_outstanding: 100,
      price: 100,
      price_as_of: "2026-07-27",
    },
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
    classification: { sector: industry, industry, scheme, source: "test" },
    missing_fields: [],
    field_sources: {},
    source_manifest: {},
    source_errors: [],
  };
}

describe("데이터 부족 선차단 (완료 조건 6)", () => {
  it("재무가 없으면 UNCLASSIFIED(no_fiscal)", () => {
    const result = classifyArchetype(sheet({ coverage: "none" }));
    expect(result.code).toBe("UNCLASSIFIED");
    expect(result.reason).toBe("no_fiscal");
  });

  it("업종이 없으면 UNCLASSIFIED(no_sector)", () => {
    const result = classifyArchetype(sheet({ industry: null }));
    expect(result.code).toBe("UNCLASSIFIED");
    expect(result.reason).toBe("no_sector");
  });

  it("모르는 스킴이면 UNCLASSIFIED(unknown_scheme) — 추측 매칭하지 않는다", () => {
    const result = classifyArchetype(sheet({ scheme: "gics" }));
    expect(result.code).toBe("UNCLASSIFIED");
    expect(result.reason).toBe("unknown_scheme");
  });

  it("어느 규칙에도 안 걸리면 UNCLASSIFIED(no_rule_matched)", () => {
    const result = classifyArchetype(sheet({ cagr3y: 8, netIncomeTtm: 400, pbr: 3 }));
    expect(result.code).toBe("UNCLASSIFIED");
    expect(result.reason).toBe("no_rule_matched");
  });

  it("모든 UNCLASSIFIED 에 사유가 붙는다", () => {
    for (const s of [sheet({ coverage: "none" }), sheet({ industry: null }), sheet({ scheme: "gics" }), sheet({})]) {
      const result = classifyArchetype(s);
      if (result.code === "UNCLASSIFIED") expect(result.reason).not.toBeNull();
    }
  });
});

describe("섹터 우선 판정", () => {
  it("은행은 적자여도 은행이다", () => {
    const result = classifyArchetype(sheet({ industry: "Savings Institutions", netIncomeTtm: -100 }));
    expect(result.code).toBe("BANK_FINANCIAL");
  });

  it("KR 업종명도 같은 규칙으로 매칭된다", () => {
    const result = classifyArchetype(sheet({ market: "KR", currency: "KRW", scheme: "naver_industry", industry: "은행" }));
    expect(result.code).toBe("BANK_FINANCIAL");
  });

  it("매출이 하한 미만인 생물공학은 BIOTECH_PIPELINE", () => {
    const result = classifyArchetype(
      sheet({ industry: "Biotechnology: Biological Products (No Diagnostic Substances)", revenueTtm: 1_000_000 })
    );
    expect(result.code).toBe("BIOTECH_PIPELINE");
  });

  it("매출 하한은 통화별로 다르다 — KRW 300억 미만만 파이프라인", () => {
    const kr = { market: "KR" as const, currency: "KRW" as const, scheme: "naver_industry", industry: "생물공학" };
    expect(classifyArchetype(sheet({ ...kr, revenueTtm: 20_000_000_000 })).code).toBe("BIOTECH_PIPELINE");
    // 400억이면 하한을 넘으므로 파이프라인이 아니다(USD 기준을 쓰면 여기서 오분류된다).
    expect(classifyArchetype(sheet({ ...kr, revenueTtm: 40_000_000_000 })).code).not.toBe("BIOTECH_PIPELINE");
  });
});

describe("손익 상태", () => {
  it("적자 + 고성장 → HYPERGROWTH_UNPROFITABLE", () => {
    const result = classifyArchetype(sheet({ netIncomeTtm: -500, revenueYoy: THRESHOLDS.hypergrowth_revenue_yoy_pct + 1 }));
    expect(result.code).toBe("HYPERGROWTH_UNPROFITABLE");
  });

  it("적자 + 저성장 → TURNAROUND_LOSS", () => {
    const result = classifyArchetype(sheet({ netIncomeTtm: -500, revenueYoy: 5 }));
    expect(result.code).toBe("TURNAROUND_LOSS");
  });

  it("성장률을 모르는 적자는 TURNAROUND_LOSS(안전한 쪽)", () => {
    expect(classifyArchetype(sheet({ netIncomeTtm: -500, revenueYoy: null })).code).toBe("TURNAROUND_LOSS");
  });
});

describe("시클리컬 판정 (독트린 §4-3)", () => {
  const steel = { industry: "Steel/Iron Ore" };

  it("연간 변동성이 임계값을 넘으면 CYCLICAL_COMMODITY + 통계 확인됨", () => {
    const result = classifyArchetype(sheet({ ...steel, stdevAnnual: 7 }));
    expect(result.code).toBe("CYCLICAL_COMMODITY");
    expect(result.stdev_confirmed).toBe(true);
  });

  it("임계값 이하면 시클리컬이 아니다(마진이 계약으로 고정된 예외)", () => {
    const result = classifyArchetype(sheet({ ...steel, stdevAnnual: 1.5 }));
    expect(result.code).not.toBe("CYCLICAL_COMMODITY");
  });

  it("통계가 없으면 업종 단독 판정하고 stdev_confirmed=false 로 남긴다 (KR 경로)", () => {
    const result = classifyArchetype(
      sheet({ market: "KR", currency: "KRW", scheme: "naver_industry", industry: "철강", stdevAnnual: null })
    );
    expect(result.code).toBe("CYCLICAL_COMMODITY");
    expect(result.stdev_confirmed).toBe(false);
  });

  it("은행이 시클리컬 판정보다 먼저 걸린다(순서가 정책이다)", () => {
    const result = classifyArchetype(sheet({ scheme: "naver_industry", industry: "은행", stdevAnnual: 30 }));
    expect(result.code).toBe("BANK_FINANCIAL");
  });
});

describe("나머지 규칙", () => {
  it("매출 있는 제약 → PHARMA_STABLE", () => {
    const result = classifyArchetype(sheet({ industry: "Major Pharmaceuticals", revenueTtm: 5_000_000_000 }));
    expect(result.code).toBe("PHARMA_STABLE");
  });

  it("배당 높고 성장 낮으면 MATURE_INCOME", () => {
    const result = classifyArchetype(sheet({ industry: "Water Supply", dividendYield: 4, cagr3y: 2 }));
    expect(result.code).toBe("MATURE_INCOME");
  });

  it("성장 높고 흑자면 QUALITY_COMPOUNDER", () => {
    const result = classifyArchetype(sheet({ cagr3y: THRESHOLDS.growth_cagr_pct + 5, netIncomeTtm: 400 }));
    expect(result.code).toBe("QUALITY_COMPOUNDER");
  });

  it("PBR 1배 미만 + 순현금 비중 높으면 ASSET_DEEP_VALUE", () => {
    const result = classifyArchetype(sheet({ pbr: 0.6, netCash: 4_000, marketCap: 10_000, cagr3y: 8 }));
    expect(result.code).toBe("ASSET_DEEP_VALUE");
  });

  it("순현금 비중이 임계값 이하면 자산형이 아니다", () => {
    expect(classifyArchetype(sheet({ pbr: 0.6, netCash: 1_000, marketCap: 10_000, cagr3y: 8 })).code).not.toBe("ASSET_DEEP_VALUE");
  });
});

describe("결정론 (완료 조건 3·4)", () => {
  it("같은 팩트시트면 항상 같은 결과", () => {
    const s = sheet({ industry: "Steel/Iron Ore", stdevAnnual: 7 });
    expect(classifyArchetype(s)).toEqual(classifyArchetype(s));
  });

  it("모든 결과가 ruleset_version 을 동반한다 (완료 조건 5)", () => {
    for (const s of [sheet({}), sheet({ coverage: "none" }), sheet({ industry: "Steel/Iron Ore", stdevAnnual: 7 })]) {
      expect(classifyArchetype(s).ruleset_version).toBe(RULESET_VERSION);
    }
  });

  it("판정 입력을 그대로 남긴다(감사 가능성)", () => {
    const result = classifyArchetype(sheet({ industry: "Steel/Iron Ore", stdevAnnual: 7 }));
    expect(result.inputs.industry).toBe("Steel/Iron Ore");
    expect(result.inputs.operating_stdev_annual).toBe(7);
    expect(result.matched_rule).toBeTruthy();
  });
});

describe("히스테리시스 (§6-3)", () => {
  const result = (code: ArchetypeCode) => ({ ...classifyArchetype(sheet({})), code });
  const history = (confirmed: ArchetypeCode, pending: ArchetypeCode | null, streak: number): ArchetypeHistory => ({
    confirmed,
    pending,
    pending_streak: streak,
    ruleset_version: RULESET_VERSION,
  });

  it("이력이 없으면 즉시 확정한다", () => {
    const decision = applyHysteresis(result("QUALITY_COMPOUNDER"), null);
    expect(decision.code).toBe("QUALITY_COMPOUNDER");
    expect(decision.pending_change).toBeNull();
  });

  it("새 분류는 1회차에 반영되지 않고 pending 으로 남는다", () => {
    const decision = applyHysteresis(result("CYCLICAL_COMMODITY"), history("QUALITY_COMPOUNDER", null, 0));
    expect(decision.code).toBe("QUALITY_COMPOUNDER");
    expect(decision.raw).toBe("CYCLICAL_COMMODITY");
    expect(decision.pending_change).toBe("CYCLICAL_COMMODITY");
    expect(decision.history.pending_streak).toBe(1);
  });

  it("2회 연속이면 확정된다", () => {
    const decision = applyHysteresis(result("CYCLICAL_COMMODITY"), history("QUALITY_COMPOUNDER", "CYCLICAL_COMMODITY", 1));
    expect(decision.code).toBe("CYCLICAL_COMMODITY");
    expect(decision.pending_change).toBeNull();
    expect(decision.history.confirmed).toBe("CYCLICAL_COMMODITY");
  });

  it("다른 분류가 끼면 streak 이 초기화된다(진동 방지)", () => {
    const decision = applyHysteresis(result("MATURE_INCOME"), history("QUALITY_COMPOUNDER", "CYCLICAL_COMMODITY", 1));
    expect(decision.code).toBe("QUALITY_COMPOUNDER");
    expect(decision.history.pending).toBe("MATURE_INCOME");
    expect(decision.history.pending_streak).toBe(1);
  });

  it("UNCLASSIFIED 로의 강등은 즉시 반영한다(데이터가 사라진 것)", () => {
    const decision = applyHysteresis(result("UNCLASSIFIED"), history("CYCLICAL_COMMODITY", null, 0));
    expect(decision.code).toBe("UNCLASSIFIED");
    expect(decision.pending_change).toBeNull();
  });

  it("UNCLASSIFIED 에서의 승격도 즉시 반영한다(데이터가 생긴 것)", () => {
    const decision = applyHysteresis(result("BANK_FINANCIAL"), history("UNCLASSIFIED", null, 0));
    expect(decision.code).toBe("BANK_FINANCIAL");
    expect(decision.pending_change).toBeNull();
  });

  it("룰셋 버전이 바뀌면 이력을 무효화하고 즉시 확정한다", () => {
    const stale: ArchetypeHistory = { confirmed: "QUALITY_COMPOUNDER", pending: null, pending_streak: 0, ruleset_version: "archetype-v0.9.0" };
    const decision = applyHysteresis(result("CYCLICAL_COMMODITY"), stale);
    expect(decision.code).toBe("CYCLICAL_COMMODITY");
    expect(decision.history.ruleset_version).toBe(RULESET_VERSION);
  });
});

describe("독트린 노출 (완료 조건 7·8)", () => {
  it("금지 지표 목록이 코드에서 조회 가능하다 (INV-06 입력)", () => {
    expect(forbiddenPaths("BANK_FINANCIAL")).toContain("valuation.psr_ttm");
    expect(forbiddenPaths("BANK_FINANCIAL")).toContain("valuation.ev_ebitda");
    expect(forbiddenPaths("HYPERGROWTH_UNPROFITABLE")).toContain("valuation.per_ttm");
    expect(forbiddenPaths("UNCLASSIFIED")).toContain("valuation.band_5y.per");
  });

  it("경고문 부착 필수 지표 목록이 조회 가능하다 (INV-11 입력)", () => {
    expect(warningRequiredPaths("CYCLICAL_COMMODITY")).toContain("valuation.per_ttm");
  });

  it("경고문은 독트린에서만 온다 — 유형마다 카드용·디테일용 짝이 맞는다", () => {
    for (const frame of DOCTRINE.archetypes) {
      const hasShort = frame.warning_short !== null;
      const hasFull = frame.warning_full !== null;
      expect(hasShort).toBe(hasFull);
    }
  });

  it("경고문 부착이 필수인 유형에는 경고문이 실제로 있다", () => {
    for (const frame of DOCTRINE.archetypes) {
      if (frame.requires_warning_metrics.length > 0) expect(frame.warning_full).toBeTruthy();
    }
  });

  it("모든 아키타입 코드에 프레임이 있다", () => {
    const codes: ArchetypeCode[] = [
      "CYCLICAL_COMMODITY",
      "HYPERGROWTH_UNPROFITABLE",
      "QUALITY_COMPOUNDER",
      "BANK_FINANCIAL",
      "PHARMA_STABLE",
      "BIOTECH_PIPELINE",
      "MATURE_INCOME",
      "TURNAROUND_LOSS",
      "ASSET_DEEP_VALUE",
      "UNCLASSIFIED",
    ];
    for (const code of codes) expect(frameOf(code).label_ko).toBeTruthy();
  });

  it("밴드 지표가 없는 유형은 값의 상태 층 전체가 금지된다", () => {
    for (const frame of DOCTRINE.archetypes) {
      if (frame.band_metric !== null) continue;
      if (frame.code === "PHARMA_STABLE" || frame.code === "ASSET_DEEP_VALUE") continue;
      expect(frame.band_note).toBeTruthy();
    }
  });
});
