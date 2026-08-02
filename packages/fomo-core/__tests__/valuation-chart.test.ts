import { describe, expect, it } from "vitest";
import { emptyFactSheet } from "../src/fundamentals/assemble";
import type { FactSheet, QuarterRecord } from "../src/fundamentals/types";
import { DOCTRINE, frameOf } from "../src/archetype/classify";
import type { ArchetypeCode } from "../src/archetype/types";
import { buildValuationChart } from "../src/valuation-chart/build";
import { findForbiddenWords } from "../src/valuation-chart/caption";

/**
 * WO-SUB-04 값의 상태 차트.
 *
 * 완료 조건 중 **데이터 층에서 판정 가능한 것**을 여기서 고정한다. 렌더 스냅샷(조건 1)은
 * 프론트 테스트가 맡는다 — 데이터가 틀리면 스냅샷도 틀리므로 순서는 여기가 먼저다.
 */

const RULESET = "archetype-v1.0.0";

function base(overrides: Partial<FactSheet> = {}): FactSheet {
  const sheet = emptyFactSheet({
    canonical: "테스트종목",
    displayName: "테스트종목",
    symbol: "TEST",
    market: "US",
    currency: "USD",
    snapshotAt: "2026-08-02T00:00:00Z",
    sourceErrors: [],
  });
  return { ...sheet, ...overrides };
}

function annual(year: number, revenue: number | null, operatingIncome: number | null = 100): QuarterRecord {
  return {
    period: `${year}`,
    period_end: `${year}-12-31`,
    filed_at: `${year + 1}-02-15`,
    revenue,
    operating_income: operatingIncome,
    net_income: 50,
    eps_diluted: 1,
    source: "sec_xbrl",
  };
}

/** 매출 막대가 성립하는 최소 팩트시트. */
function withRevenue(codeCurrency: "USD" | "KRW" = "USD"): FactSheet {
  const sheet = base({ currency: codeCurrency });
  return {
    ...sheet,
    fiscal: { ...sheet.fiscal, annual: [annual(2023, 1_000), annual(2024, 1_200), annual(2025, 1_500)] },
    valuation: { ...sheet.valuation, per_ttm: 20, per_forward: 18, pbr: 2, psr_ttm: 3 },
  };
}

describe("UNCLASSIFIED 폴백 — 02R 전환기에 화면이 깨지지 않는다", () => {
  it("UNCLASSIFIED 는 차트를 그리지 않고 사유를 남긴다", () => {
    const chart = buildValuationChart(withRevenue(), "UNCLASSIFIED", RULESET);
    expect(chart.renderable).toBe(false);
    expect(chart.unavailable_reason).toBe("unclassified");
    // 완료 조건 2 — 빈 박스로 남지 않게 하려면 축·막대가 전부 비어 있어야 한다.
    expect(chart.bars).toEqual([]);
    expect(chart.bar_metric).toBeNull();
    expect(chart.line).toBeNull();
  });

  it("데이터가 아무리 좋아도 UNCLASSIFIED 면 그리지 않는다", () => {
    const rich = withRevenue();
    const chart = buildValuationChart(rich, "UNCLASSIFIED", RULESET);
    expect(chart.renderable).toBe(false);
  });

  it("막대 시계열이 없으면 숨긴다 — 다른 지표로 바꿔 그리지 않는다", () => {
    // ASSET_DEEP_VALUE 의 축은 자기자본인데 팩트시트에 그 시계열이 없다.
    const chart = buildValuationChart(withRevenue(), "ASSET_DEEP_VALUE", RULESET);
    expect(chart.renderable).toBe(false);
    expect(chart.unavailable_reason).toBe("bar_series_unavailable");
    expect(chart.bar_metric).toBeNull();
  });

  it("축은 있는데 데이터가 비면 숨긴다", () => {
    const chart = buildValuationChart(base(), "QUALITY_COMPOUNDER", RULESET);
    expect(chart.renderable).toBe(false);
    expect(chart.unavailable_reason).toBe("no_bar_data");
  });
});

describe("축 매핑은 독트린에서 온다", () => {
  it("10개 유형 전부가 축 매핑 항목을 갖는다(값이 null 이어도 명시적으로)", () => {
    expect(DOCTRINE.archetypes).toHaveLength(10);
    for (const frame of DOCTRINE.archetypes) {
      expect(frame).toHaveProperty("chart_axes");
    }
  });

  it("UNCLASSIFIED 만 축이 null 이다", () => {
    for (const frame of DOCTRINE.archetypes) {
      if (frame.code === "UNCLASSIFIED") expect(frame.chart_axes).toBeNull();
      else expect(frame.chart_axes).not.toBeNull();
    }
  });

  it("금지 지표를 축으로 쓰지 않는다 (§4 규칙 3)", () => {
    for (const frame of DOCTRINE.archetypes) {
      const axes = frame.chart_axes;
      if (!axes) continue;
      const forbidden = frame.forbidden_metrics.map((entry) => entry.path);
      for (const metric of [axes.line_metric, axes.line_fallback_metric]) {
        if (!metric) continue;
        expect(forbidden).not.toContain(`valuation.${metric}`);
      }
    }
  });

  it("CYCLICAL_COMMODITY 의 선은 PER 이 아니다 — PER 역설을 차트가 재생산하지 않는다", () => {
    const axes = frameOf("CYCLICAL_COMMODITY").chart_axes;
    expect(axes?.line_metric).toBe("pbr");
  });

  it("BANK_FINANCIAL 은 매출 막대를 쓰지 않는다", () => {
    const axes = frameOf("BANK_FINANCIAL").chart_axes;
    expect(axes?.bar_series).not.toBe("annual_revenue");
  });

  it("BIOTECH_PIPELINE 은 배수 선이 없다", () => {
    const axes = frameOf("BIOTECH_PIPELINE").chart_axes;
    expect(axes?.line_metric).toBeNull();
  });
});

describe("경고문은 독트린에서 로드된다 (INV-11)", () => {
  it("경고문 있는 유형은 차트에 문안이 실린다", () => {
    const chart = buildValuationChart(withRevenue(), "CYCLICAL_COMMODITY", RULESET);
    expect(chart.renderable).toBe(true);
    expect(chart.warning).toBe(frameOf("CYCLICAL_COMMODITY").warning_full);
    expect(chart.warning).toBeTruthy();
  });

  it("경고문 부착이 필수인 지표를 축으로 쓰는 유형은 반드시 경고문을 갖는다", () => {
    for (const frame of DOCTRINE.archetypes) {
      const axes = frame.chart_axes;
      if (!axes?.line_metric) continue;
      const requiresWarning = frame.requires_warning_metrics.some(
        (entry) => entry.path === `valuation.${axes.line_metric}`
      );
      if (requiresWarning) expect(frame.warning_full).toBeTruthy();
    }
  });
});

describe("없는 구간을 그리지 않는다 (§4 규칙 2)", () => {
  it("컨센서스가 없으면 예상 막대가 없다", () => {
    const chart = buildValuationChart(withRevenue(), "QUALITY_COMPOUNDER", RULESET);
    expect(chart.bars.every((bar) => bar.kind === "actual")).toBe(true);
    expect(chart.estimate_meta.present).toBe(false);
    expect(chart.captions.some((c) => c.includes("예상치"))).toBe(false);
  });

  it("컨센서스가 있으면 예상 막대가 실적과 구분돼 붙는다", () => {
    const sheet = withRevenue();
    const chart = buildValuationChart(
      {
        ...sheet,
        consensus: {
          available: true,
          revenue_fy1: 1_800,
          revenue_fy2: 2_100,
          revenue_fy3: null,
          eps_fy1: 2,
          eps_fy2: 2.4,
          source: "nasdaq",
          as_of: "2026-08-01",
          analyst_count: 12,
          periods: ["26", "27"],
        },
      },
      "QUALITY_COMPOUNDER",
      RULESET
    );
    const estimates = chart.bars.filter((bar) => bar.kind === "estimate");
    expect(estimates.map((bar) => bar.label)).toEqual(["26", "27"]);
    // fy3 가 null 이면 그 막대는 만들지 않는다 — 추세 연장 금지.
    expect(estimates).toHaveLength(2);
    expect(chart.estimate_meta.analyst_count).toBe(12);
    expect(chart.captions.some((c) => c.includes("예상치"))).toBe(true);
  });

  it("배수 시계열이 없으므로 line 은 null 이다 — 현재값으로 수평선을 만들지 않는다", () => {
    const chart = buildValuationChart(withRevenue(), "QUALITY_COMPOUNDER", RULESET);
    expect(chart.line).toBeNull();
  });

  it("1순위 지표가 없으면 대체 지표로 내려가고 그 사실을 캡션에 남긴다", () => {
    const sheet = withRevenue();
    const chart = buildValuationChart(
      { ...sheet, valuation: { ...sheet.valuation, per_forward: null } },
      "QUALITY_COMPOUNDER",
      RULESET
    );
    expect(chart.line_metric).toBe("per_ttm");
    expect(chart.captions.some((c) => c.includes("확보되지 않아"))).toBe(true);
  });
});

describe("캡션 — 템플릿만, 금지어 없음 (§4 규칙 1)", () => {
  const codes: ArchetypeCode[] = DOCTRINE.archetypes.map((frame) => frame.code);

  it("모든 유형의 캡션·경고문에 금지어가 없다", () => {
    for (const code of codes) {
      const chart = buildValuationChart(withRevenue(), code, RULESET);
      for (const caption of chart.captions) {
        expect(findForbiddenWords(caption)).toEqual([]);
      }
      if (chart.warning) expect(findForbiddenWords(chart.warning)).toEqual([]);
    }
  });

  it("금지어 사전이 실제로 잡는다", () => {
    expect(findForbiddenWords("하위 20%로 저렴한 편입니다")).toContain("저렴");
    expect(findForbiddenWords("하위 20% 구간입니다")).toEqual([]);
  });

  it("밴드가 불충분하면 백분위를 말하지 않는다", () => {
    const sheet = withRevenue();
    const chart = buildValuationChart(
      {
        ...sheet,
        valuation: {
          ...sheet.valuation,
          band_5y: {
            metric: "per",
            per: {
              p20: null,
              p50: null,
              p80: null,
              current: 18,
              current_percentile: null,
              observations: 10,
              window_trading_days: 1_250,
              window_start: "2021-08-02",
              window_end: "2026-08-02",
              sufficient: false,
              insufficient_reason: "관측 10일",
            },
            pbr: null,
            psr: null,
          },
        },
      },
      "QUALITY_COMPOUNDER",
      RULESET
    );
    expect(chart.captions.some((c) => c.includes("확보되지 않았습니다"))).toBe(true);
    expect(chart.captions.some((c) => c.includes("% 구간"))).toBe(false);
  });
});

describe("모든 결과가 룰셋 버전을 동반한다", () => {
  it("숨김 결과에도 버전이 붙는다", () => {
    const chart = buildValuationChart(base(), "UNCLASSIFIED", RULESET);
    expect(chart.ruleset_version).toBe(RULESET);
  });
});
