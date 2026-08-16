import { describe, expect, it } from "vitest";
import { emptyFactSheet } from "../src/fundamentals/assemble";
import type { FactSheet, QuarterRecord } from "../src/fundamentals/types";
import { DOCTRINE, frameOf } from "../src/archetype/classify";
import type { ArchetypeCode } from "../src/archetype/types";
import { buildValuationChart, buildValuationFrameNotes } from "../src/valuation-chart/build";
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

  it("주당배당금이 없는 종목은 숨긴다 — 매출·배당수익률로 바꿔 그리지 않는다", () => {
    /**
     * MATURE_INCOME 의 축은 주당배당금이다. 2026-08-06 부터 축 자체는 지원하므로(네이버 연간표
     * `주당배당금`) 사유가 `bar_series_unavailable` → `no_bar_data` 로 바뀐다 —
     * "축을 못 만든다"와 "이 종목에 값이 없다"는 다른 문제이고 해소 경로도 다르다.
     */
    const chart = buildValuationChart(withRevenue(), "MATURE_INCOME", RULESET);
    expect(chart.renderable).toBe(false);
    expect(chart.unavailable_reason).toBe("no_bar_data");
    expect(chart.bar_metric).toBeNull();
  });

  it("MATURE_INCOME — 주당배당금이 있으면 그 막대를 그린다(총액 역산 아님)", () => {
    const sheet = withRevenue();
    const chart = buildValuationChart(
      {
        ...sheet,
        valuation: {
          ...sheet.valuation,
          dividend_yield: 4,
          dps_annual: [
            { period: "2023", period_end: "2023-12-31", filed_at: "2024-03-31", value: 2_158, source: "naver_finance_annual.주당배당금" },
            { period: "2024", period_end: "2024-12-31", filed_at: "2025-03-31", value: 2_469, source: "naver_finance_annual.주당배당금" },
            { period: "2025", period_end: "2025-12-31", filed_at: "2026-03-31", value: 1_651, source: "naver_finance_annual.주당배당금" },
          ],
        },
      },
      "MATURE_INCOME",
      RULESET
    );
    expect(chart.renderable).toBe(true);
    expect(chart.bar_metric).toBe("annual_dps");
    expect(chart.bar_label).toBe("주당배당금");
    // 배당이 줄어든 연도를 그대로 보여준다 — 평탄화하지 않는다.
    expect(chart.bars.map((bar) => bar.value)).toEqual([2_158, 2_469, 1_651]);
    expect(chart.line_metric).toBe("dividend_yield");
    // 점 단위 출처가 주당 기준 소스여야 한다(총액 역산이면 여기가 달라진다).
    expect(chart.bars.every((bar) => bar.source.includes("주당배당금"))).toBe(true);
  });

  it("BANK_FINANCIAL 은 자기자본 막대를 쓴다 — 매출로 바꿔 그리는 것이 아니다", () => {
    /**
     * WO-SUB-FINISH A-3(선택지 A). WO-SUB-04 축 표가 처음부터 "순이자이익 **또는 자기자본**"을
     * 허용했고 순이자이익만 소스에 매핑이 없다. 즉 없는 지표를 다른 것으로 대체한 것이 아니라
     * 명세의 두 번째 선택지를 쓰는 것이다. 매출 막대는 여전히 금지다.
     */
    const sheet = withRevenue();
    const chart = buildValuationChart(
      {
        ...sheet,
        balance: {
          ...sheet.balance,
          equity_quarters: [
            { period: "2023Q4", period_end: "2023-12-31", filed_at: "2024-03-31", value: 3_800, source: "dart" },
            { period: "2024Q4", period_end: "2024-12-31", filed_at: "2025-03-31", value: 4_000, source: "dart" },
            { period: "2025Q2", period_end: "2025-06-30", filed_at: "2025-08-14", value: 4_200, source: "dart" },
            { period: "2025Q4", period_end: "2025-12-31", filed_at: "2026-03-31", value: 4_500, source: "dart" },
          ],
        },
      },
      "BANK_FINANCIAL",
      RULESET
    );
    expect(chart.renderable).toBe(true);
    expect(chart.bar_metric).toBe("annual_equity");
    expect(chart.bar_label).toBe("자기자본");
    // 연간 막대라 회계연도말만 — 분기를 섞으면 "연간"이 아니게 된다.
    expect(chart.bars.map((bar) => bar.value)).toEqual([3_800, 4_000, 4_500]);
    // 막대(분모)와 선(배수)이 같은 것을 두 각도에서 본다.
    expect(chart.line_metric).toBe("pbr");
    // 매출은 들어 있어도 쓰지 않는다.
    expect(chart.bars.some((bar) => bar.value === sheet.fiscal.annual[0]?.revenue)).toBe(false);
  });

  it("자기자본 시계열이 없는 은행은 여전히 숨긴다 — 없는 것을 그리지 않는다", () => {
    const chart = buildValuationChart(withRevenue(), "BANK_FINANCIAL", RULESET);
    expect(chart.renderable).toBe(false);
    expect(chart.unavailable_reason).toBe("no_bar_data");
  });

  it("시계열 종류는 지원하는데 데이터가 없으면 no_bar_data 로 구분된다", () => {
    // 사유를 구분하는 이유: "축을 못 만든다"와 "이 종목에 값이 없다"는 다른 문제다.
    // 전자는 WO-SUB-01 확장 대상이고 후자는 그 종목의 결손이다.
    const chart = buildValuationChart(withRevenue(), "ASSET_DEEP_VALUE", RULESET);
    expect(chart.renderable).toBe(false);
    expect(chart.unavailable_reason).toBe("no_bar_data");
  });

  it("축은 있는데 데이터가 비면 숨긴다", () => {
    const chart = buildValuationChart(base(), "QUALITY_COMPOUNDER", RULESET);
    expect(chart.renderable).toBe(false);
    expect(chart.unavailable_reason).toBe("no_bar_data");
  });
});

describe("이미 수집하던 시계열을 노출한 뒤 (2026-08-03)", () => {
  /**
   * `equity`·`cash` 는 파이프라인이 6년치 분기로 수집하고 있었는데 `assemble` 이 최신값만
   * 스칼라로 남기고 버렸다. 그래서 두 유형의 차트가 "데이터 없음"으로 숨겨져 있었다.
   * 새 소스를 붙인 것이 아니라 버리던 것을 남긴 것이므로, 여기서 그 결과를 고정한다.
   */
  const point = (periodEnd: string, value: number) => ({
    period: `${periodEnd.slice(0, 4)}Q${Math.ceil(Number(periodEnd.slice(5, 7)) / 3)}`,
    period_end: periodEnd,
    filed_at: `${periodEnd.slice(0, 4)}-12-31`,
    value,
    source: "dart:2025:사업보고서:CFS",
  });

  it("BIOTECH_PIPELINE — 현금잔고 막대가 살아나고 배수 선은 여전히 없다", () => {
    const sheet = withRevenue();
    const chart = buildValuationChart(
      {
        ...sheet,
        balance: {
          ...sheet.balance,
          cash_quarters: [point("2025-03-31", 500), point("2025-06-30", 420), point("2025-09-30", 350)],
        },
      },
      "BIOTECH_PIPELINE",
      RULESET
    );
    expect(chart.renderable).toBe(true);
    expect(chart.bars.map((bar) => bar.value)).toEqual([500, 420, 350]);
    // 매출·이익이 없어 어떤 배수도 의미를 갖지 않는다 — 선을 만들어 붙이지 않는다.
    expect(chart.line).toBeNull();
    expect(chart.line_metric).toBeNull();
  });

  it("ASSET_DEEP_VALUE — 연간 막대라 회계연도말만 남는다(분기를 섞지 않는다)", () => {
    const sheet = withRevenue();
    const chart = buildValuationChart(
      {
        ...sheet,
        balance: {
          ...sheet.balance,
          equity_quarters: [
            point("2022-12-31", 900),
            point("2023-12-31", 1_000),
            point("2024-06-30", 1_100), // 연간 막대에 섞이면 안 된다
            point("2024-12-31", 1_200),
          ],
        },
      },
      "ASSET_DEEP_VALUE",
      RULESET
    );
    expect(chart.renderable).toBe(true);
    expect(chart.bars.map((bar) => bar.value)).toEqual([900, 1_000, 1_200]);
    expect(chart.line_metric).toBe("pbr");
  });

  it("막대 점마다 출처가 붙어 있다 — 시계열이 화면으로 나가므로 점 단위 감사가 가능해야 한다", () => {
    const sheet = withRevenue();
    const chart = buildValuationChart(
      { ...sheet, balance: { ...sheet.balance, cash_quarters: [point("2025-09-30", 350)] } },
      "BIOTECH_PIPELINE",
      RULESET
    );
    expect(chart.bars.every((bar) => bar.source.length > 0 && bar.as_of.length > 0)).toBe(true);
  });
});

describe("완료 조건 1 — 전 유형이 데이터 층에서 판정된다", () => {
  /**
   * 남은 4유형(HYPERGROWTH·PHARMA_STABLE·MATURE_INCOME·TURNAROUND_LOSS)을 채운다.
   * **"테스트가 있다"가 아니라 "그 유형의 축이 실제로 그 축인지"를 본다** — 독트린에서 축을
   * 로드하므로, 독트린이 바뀌면 여기가 먼저 깨져야 한다(축이 조용히 바뀌는 것을 막는다).
   */
  function quarter(period: string, periodEnd: string, operatingIncome: number | null): QuarterRecord {
    return {
      period,
      period_end: periodEnd,
      filed_at: `${periodEnd.slice(0, 4)}-12-31`,
      revenue: 1_000,
      operating_income: operatingIncome,
      net_income: 10,
      eps_diluted: 1,
      source: "sec_xbrl",
    };
  }

  it("HYPERGROWTH_UNPROFITABLE — 매출 막대 + P/S 선(PER 을 쓰지 않는다)", () => {
    const chart = buildValuationChart(withRevenue(), "HYPERGROWTH_UNPROFITABLE", RULESET);
    expect(chart.renderable).toBe(true);
    expect(chart.bar_metric).toBe("annual_revenue");
    // 적자 유형이라 PER 은 의미가 없다 — 선이 PER 로 떨어지면 안 된다.
    expect(chart.line_metric).toBe("psr_ttm");
  });

  it("PHARMA_STABLE — 매출 막대 + PER 선", () => {
    const chart = buildValuationChart(withRevenue(), "PHARMA_STABLE", RULESET);
    expect(chart.renderable).toBe(true);
    expect(chart.bar_metric).toBe("annual_revenue");
    expect(chart.line_metric).toBe("per_ttm");
  });

  it("TURNAROUND_LOSS — 분기 영업이익 막대(부호 유지) + PBR 선", () => {
    const sheet = withRevenue();
    const chart = buildValuationChart(
      {
        ...sheet,
        fiscal: {
          ...sheet.fiscal,
          quarters: [
            quarter("2025Q1", "2025-03-31", -50),
            quarter("2025Q2", "2025-06-30", -20),
            quarter("2025Q3", "2025-09-30", 10),
          ],
        },
      },
      "TURNAROUND_LOSS",
      RULESET
    );
    expect(chart.renderable).toBe(true);
    expect(chart.bar_metric).toBe("quarterly_operating_income");
    // **부호를 절대값으로 바꾸지 않는다** — 적자에서 흑자로 넘어가는 것이 이 유형의 관측 지점이다.
    expect(chart.bars.map((bar) => bar.value)).toEqual([-50, -20, 10]);
    expect(chart.line_metric).toBe("pbr");
  });

  it("MATURE_INCOME — 주당배당금 값이 없으면 숨긴다(배당수익률로 바꿔 그리지 않는다)", () => {
    const chart = buildValuationChart(withRevenue(), "MATURE_INCOME", RULESET);
    expect(chart.renderable).toBe(false);
    expect(chart.unavailable_reason).toBe("no_bar_data");
    expect(chart.bars).toEqual([]);
  });

  it("전 유형이 이 파일에서 한 번은 빌드된다 — 빠뜨린 유형이 없다", () => {
    const covered = DOCTRINE.archetypes.map((frame) => frame.code as ArchetypeCode);
    // 유형 수를 상수로 박지 않는다 — 02R 이 유형을 늘리면 이 테스트가 그 유형까지 자동으로 돈다.
    expect(covered.length).toBeGreaterThanOrEqual(11);
    for (const code of covered) {
      // 던지지 않는 것 자체가 조건이다. 축이 없거나 데이터가 없으면 renderable: false 로 끝나야 한다.
      const chart = buildValuationChart(withRevenue(), code, RULESET);
      expect(typeof chart.renderable).toBe("boolean");
      if (!chart.renderable) expect(chart.unavailable_reason).not.toBeNull();
    }
  });
});

describe("축 매핑은 독트린에서 온다", () => {
  it("전 유형이 축 매핑 항목을 갖는다(값이 null 이어도 명시적으로)", () => {
    expect(DOCTRINE.archetypes.length).toBeGreaterThanOrEqual(11);
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

  it("막대가 무엇인지 캡션이 밝힌다 — 유형마다 축이 달라 매출로 오해된다", () => {
    // 2026-08-06 A-3 단서: "캡션에 막대가 무엇인지 명시할 것."
    const chart = buildValuationChart(withRevenue(), "QUALITY_COMPOUNDER", RULESET);
    expect(chart.captions.some((c) => c === `막대는 ${chart.bar_label}입니다.`)).toBe(true);
    // 카드는 첫 캡션만 보여주므로 막대 캡션이 밴드 위치 문장을 밀어내면 안 된다.
    expect(chart.captions.at(-1)).toBe(`막대는 ${chart.bar_label}입니다.`);
    expect(chart.captions[0]).not.toContain("막대는");
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
    expect(chart.captions.some((c) => c.includes("위치를 말할 수 없어요"))).toBe(true);
    expect(chart.captions.some((c) => c.includes("% 구간"))).toBe(false);
  });
});

describe("모든 결과가 룰셋 버전을 동반한다", () => {
  it("숨김 결과에도 버전이 붙는다", () => {
    const chart = buildValuationChart(base(), "UNCLASSIFIED", RULESET);
    expect(chart.ruleset_version).toBe(RULESET);
  });
});

describe("예상 막대 축 라벨 (2026-08-05 화면 실측)", () => {
  /**
   * 컨센서스가 `"202612"` 같은 원본 기간 코드를 준다. 그대로 축에 쓰면 실적 막대
   * (`21 22 23 24 25`)와 자릿수가 달라 차트가 잘못 읽힌다 — 카드 화면에서 실제로 그렇게 나왔다.
   */
  function withConsensus(periods: string[]): FactSheet {
    const sheet = withRevenue();
    return {
      ...sheet,
      consensus: {
        ...sheet.consensus,
        available: true,
        source: "naver_consensus",
        as_of: "2026-08-01",
        revenue_fy1: 2_000,
        periods,
      },
    };
  }

  it("`202612` 는 `26` 으로 줄어든다", () => {
    const chart = buildValuationChart(withConsensus(["202612"]), "QUALITY_COMPOUNDER", RULESET);
    const estimate = chart.bars.filter((bar) => bar.kind === "estimate");
    expect(estimate.map((bar) => bar.label)).toEqual(["26"]);
  });

  it("`2026-12` 도 `26` 이다", () => {
    const chart = buildValuationChart(withConsensus(["2026-12"]), "QUALITY_COMPOUNDER", RULESET);
    expect(chart.bars.filter((b) => b.kind === "estimate").map((b) => b.label)).toEqual(["26"]);
  });

  it("연도를 못 찾으면 마지막 실적 연도에서 이어 붙인다 — 원본 코드를 축에 흘리지 않는다", () => {
    const chart = buildValuationChart(withConsensus(["FY+1"]), "QUALITY_COMPOUNDER", RULESET);
    const labels = chart.bars.filter((b) => b.kind === "estimate").map((b) => b.label);
    expect(labels).toEqual(["26"]);
    expect(labels[0]).not.toContain("FY");
  });

  it("실적 라벨과 자릿수가 같다 — 축이 섞이지 않는다", () => {
    const chart = buildValuationChart(withConsensus(["202612"]), "QUALITY_COMPOUNDER", RULESET);
    expect(chart.bars.every((bar) => bar.label.length === 2)).toBe(true);
  });
});

/**
 * WO-SUB-HOOK D6 · 4-1 — **라벨만 남은 차트 금지.**
 *
 * 실측(2026-08-14): 빅텍 카드에 `매출` 라벨과 짧은 선 하나만 있었다. 데이터가 1점이면
 * 추세가 없고, 그린 것도 안 그린 것도 아닌 상태가 화면에 남는다. 3칸 미만은 감춘다.
 */
describe("막대 최소 칸수 — 그리거나 완전히 숨기거나", () => {
  function withYears(years: number): FactSheet {
    const sheet = base();
    return {
      ...sheet,
      fiscal: {
        ...sheet.fiscal,
        annual: Array.from({ length: years }, (_, i) => annual(2023 + i, 1_000 + i * 100)),
      },
      valuation: { ...sheet.valuation, per_ttm: 20 },
    };
  }

  it("실적 막대가 1칸이면 숨긴다 — 라벨만 남기지 않는다", () => {
    const chart = buildValuationChart(withYears(1), "QUALITY_COMPOUNDER", RULESET);
    expect(chart.renderable).toBe(false);
    expect(chart.unavailable_reason).toBe("too_few_bars");
    expect(chart.bars).toEqual([]);
    expect(chart.bar_label).toBeNull();
  });

  it("2칸도 숨긴다 — 두 점은 추이가 아니다", () => {
    expect(buildValuationChart(withYears(2), "QUALITY_COMPOUNDER", RULESET).renderable).toBe(false);
  });

  it("3칸부터 그린다", () => {
    const chart = buildValuationChart(withYears(3), "QUALITY_COMPOUNDER", RULESET);
    expect(chart.renderable).toBe(true);
    expect(chart.bars.length).toBe(3);
  });
});

/**
 * WO-SUB-HOOK D8 · 4-2 — 밴드 위치 캡션과 유형 경고문은 **차트와 독립**으로 나온다.
 * 차트가 숨겨졌다고 경고문까지 사라지면 INV-11 이 화면에서 무효가 된다.
 */
describe("buildValuationFrameNotes — 차트를 못 그려도 프레임은 남는다", () => {
  it("차트가 숨겨진 유형에서도 경고문을 돌려준다", () => {
    const sheet = withRevenue();
    const chart = buildValuationChart(sheet, "BANK_FINANCIAL", RULESET);
    expect(chart.renderable).toBe(false); // 자기자본 시계열 없음
    const notes = buildValuationFrameNotes(sheet, "BANK_FINANCIAL");
    expect(notes.warning).toBe(frameOf("BANK_FINANCIAL").warning_full);
  });

  it("밴드가 없으면 없다고만 하고 백분위를 지어내지 않는다", () => {
    const notes = buildValuationFrameNotes(withRevenue(), "QUALITY_COMPOUNDER");
    for (const caption of notes.captions) expect(findForbiddenWords(caption)).toEqual([]);
    expect(notes.captions.some((c) => /\d+% 구간/.test(c))).toBe(false);
  });

  it("UNCLASSIFIED 는 프레임 자체가 없다 — 유형을 모르면 경고문도 만들 수 없다", () => {
    const notes = buildValuationFrameNotes(withRevenue(), "UNCLASSIFIED");
    expect(notes).toEqual({ captions: [], warning: null, band_label: null });
  });
});
