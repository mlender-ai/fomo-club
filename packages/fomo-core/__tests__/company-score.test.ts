import { describe, expect, it } from "vitest";
import {
  companyFinancialsFromBasics,
  computeCompanyScore,
  mergeCompanyScoreResults,
  withCompanyQuietScore,
  type CompanyScoreInput,
  type StockBasics,
} from "../src";

const accumulation: CompanyScoreInput = {
  financials: {
    currentPer: 6.4,
    currentPbr: 0.8,
    perHistory: [14, 11, 9, 8, 7],
    pbrHistory: [1.4, 1.2, 1.1, 1.0, 0.9],
    valuationHistoryLabel: "최근 5개년",
    revenue: [100, 120, 156],
    operatingIncome: [5, 11, 24],
    periods: ["2023", "2024", "2025"],
  },
  signals: { foreignNetStreak: 5, institutionNetStreak: 3 },
  verdict: {
    stance: "enter",
    stanceText: "근거 확인",
    phase: "accumulation",
    evidence: [],
    invalidation: "90 아래",
    invalidationLevel: 90,
    confidence: "high",
  },
  wyckoff: {
    sourceLength: 260,
    zones: [],
    currentZone: {
      kind: "accumulation",
      startIndex: 200,
      endIndex: 259,
      weeks: 7,
      low: 88,
      high: 104,
      rangePct: 18,
      priceChangePct: 4,
      label: "매집 추정 구간",
      evidence: [],
    },
    events: [
      { kind: "pullback", index: 258, price: 100, label: "첫 눌림목", explanation: "MA20 지지", retracementPct: 38 },
    ],
  },
  currentPrice: 100,
  quiet: { quietScore: 62, signalScore: 74, hypePenalty: 12 },
  asOf: "2026-07-19",
};

describe("company score", () => {
  it("always exposes six explicit axis states and withholds scores below three axes", () => {
    const accumulating = computeCompanyScore({});
    expect(accumulating.status).toBe("accumulating");
    expect(accumulating.score).toBeNull();
    expect(accumulating.label).toBe("분석 축적 중");
    expect(accumulating.axisStates).toHaveLength(6);
    expect(accumulating.axisStates.filter((axis) => axis.status === "missing").every((axis) => axis.missingReason === "데이터 없음")).toBe(true);
    expect(accumulating.axes.map((axis) => axis.key)).toEqual(["flow", "chart"]);

    const ready = withCompanyQuietScore(accumulating, { quietScore: 40 });
    expect(ready.status).toBe("ready");
    expect(ready.availableAxisCount).toBe(3);
    expect(ready.score).not.toBeNull();
  });

  it("uses six evidence-backed axes and derives the combined label", () => {
    const result = computeCompanyScore(accumulation);
    expect(result.availableAxisCount).toBe(6);
    expect(result.axisStates.every((axis) => axis.status === "available")).toBe(true);
    expect(result.omittedAxes).toEqual([]);
    expect(result.label).toBe("역사 밴드 하단 + 매집 7주차");
    expect(result.axes.find((axis) => axis.key === "valuation")?.evidence[0]).toContain("PER 6.40배");
    expect(result.axes.find((axis) => axis.key === "quiet")?.evidence[0]).toBe("신호 74.0 - 화제성 12.0 = 62.0");
  });

  it("excludes missing financial axes and re-normalizes the remaining axes", () => {
    const result = computeCompanyScore({
      signals: { foreignNetStreak: 4 },
      verdict: accumulation.verdict,
      wyckoff: accumulation.wyckoff,
      currentPrice: 100,
      quiet: { quietScore: 48 },
    });
    expect(result.availableAxisCount).toBe(3);
    expect(result.omittedAxes).toEqual(expect.arrayContaining(["valuation", "growth", "profitability"]));
    const expected = Math.round(result.axes.reduce((sum, axis) => sum + axis.score, 0) / result.axes.length);
    expect(result.score).toBe(expected);
  });

  it("keeps a selected quiet score without dropping insider evidence", () => {
    const base = computeCompanyScore({ insiderPurchaseConfirmed: true, verdict: accumulation.verdict });
    const result = withCompanyQuietScore(base, { quietScore: 55, signalScore: 70, hypePenalty: 15 });
    expect(result.axes.find((axis) => axis.key === "flow")?.evidence).toContain("내부자 공개시장 매수 공시 확인");
    expect(result.axes.find((axis) => axis.key === "quiet")?.score).toBe(69);
  });

  it("feeds verified multi-actor strength into the flow axis", () => {
    const result = computeCompanyScore({
      quietMoney: {
        asOf: "2026-07-17",
        events: [],
        cluster: {
          type: "cluster_multi",
          windowTradingDays: 10,
          actors: ["insider", "institution"],
          actorCount: 2,
          startDate: "2026-07-10",
          endDate: "2026-07-17",
          strength: 4,
          headline: "내부자·기관 동시 유입 · 10거래일 내 2개 주체",
          evidence: [],
        },
      },
    });
    expect(result.axes.find((axis) => axis.key === "flow")).toMatchObject({ score: 66 });
    expect(result.axes.find((axis) => axis.key === "flow")?.evidence[0]).toContain("강도 4/5");
  });

  it("keeps the daily card score stable when a fresh detail score arrives", () => {
    const seed = computeCompanyScore({
      signals: { foreignNetStreak: 5 },
      quiet: { quietScore: 64, signalScore: 78, hypePenalty: 14 },
    });
    const fresh = computeCompanyScore({
      financials: accumulation.financials,
      verdict: accumulation.verdict,
      wyckoff: accumulation.wyckoff,
      currentPrice: accumulation.currentPrice,
    });
    const merged = mergeCompanyScoreResults(seed, fresh)!;

    expect(merged).toEqual(seed);
    expect(mergeCompanyScoreResults(undefined, fresh)).toEqual(fresh);
  });

  it("is deterministic and produces discriminating scores across five profiles", () => {
    const profiles: CompanyScoreInput[] = [
      accumulation,
      { ...accumulation, financials: { ...accumulation.financials!, currentPer: 18, currentPbr: 1.5 }, quiet: { quietScore: 20 } },
      {
        financials: { revenue: [100, 90, 72], operatingIncome: [12, 5, -4], periods: ["2023", "2024", "2025"] },
        verdict: { stance: "avoid", stanceText: "분산", phase: "distribution", evidence: [], confidence: "medium" },
        quiet: { quietScore: 12 },
      },
      {
        financials: { revenue: [100, 130, 180], operatingIncome: [8, 18, 40], periods: ["2023", "2024", "2025"] },
        verdict: { stance: "watch", stanceText: "상승", phase: "markup", evidence: [], confidence: "medium" },
        quiet: { quietScore: 35 },
      },
      { insiderPurchaseConfirmed: true, quiet: { quietScore: 72, signalScore: 80, hypePenalty: 8 } },
    ];
    const scores = profiles.map((profile) => computeCompanyScore(profile).score!);
    expect(computeCompanyScore(accumulation)).toEqual(computeCompanyScore(accumulation));
    expect(new Set(scores).size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThanOrEqual(20);
  });

  it("reads real raw financial series and does not infer valuation without history", () => {
    const basics: StockBasics = {
      name: "테스트",
      metrics: [{ label: "지금 주가는 이익의", value: "8.4배", term: "PER" }],
      financials: {
        periods: [
          { title: "2023", estimate: false },
          { title: "2024", estimate: false },
          { title: "2025", estimate: false },
        ],
        rows: [
          { label: "벌어들인 돈(매출)", values: ["100억", "120억", "150억"], rawValues: [100, 120, 150] },
          { label: "남긴 돈(영업이익)", values: ["5억", "12억", "24억"], rawValues: [5, 12, 24] },
        ],
      },
    };
    const input = companyFinancialsFromBasics(basics)!;
    const result = computeCompanyScore({ financials: input });
    expect(result.axes.map((axis) => axis.key)).toEqual(["growth", "profitability", "flow", "chart"]);
    expect(result.omittedAxes).toContain("valuation");
  });
});
