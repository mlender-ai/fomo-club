import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Daily30Response } from "../../lib/daily-30";
import type { CommitteeRunReport } from "../../lib/expert-review-store";
import {
  QUALITY_SLO_TARGETS,
  calculateQualitySloSnapshot,
} from "../../lib/quality-slo-ledger";

function healthyResponse(): Daily30Response {
  const stocks = Array.from({ length: 30 }, (_, index) => {
    const asset = index < 15 ? "kr" : index < 25 ? "us" : "coin";
    return {
      canonical: `종목-${index}`,
      marquee: false,
      sector: asset === "coin" ? "코인" : `테마-${index % 6}`,
      country: asset === "us" ? "US" as const : "KR" as const,
      market: asset === "coin" ? "COIN" as const : asset === "us" ? "NASDAQ" as const : "KOSPI" as const,
      ...(asset === "us" ? { symbol: `US${index}` } : { naverCode: String(index).padStart(6, "0") }),
      headline: `확인된 계약 재료 ${index}`,
      sourceLabel: "공식 공시",
      sourceUrl: `https://example.com/${index}`,
    };
  });
  const fronts = Object.fromEntries(stocks.map((stock, index) => [stock.canonical, {
    signals: { changePct: index % 2 === 0 ? 4 : -4 },
    fomo: { score: 50, label: "관찰", breakdown: [] },
    sparkline: [100 + index, 101 + index, 102 + index],
    priceText: stock.market === "COIN" ? `${1000 + index}원` : stock.country === "US" ? `$${100 + index}` : `${10000 + index}원`,
    verdict: {
      stance: index % 3 === 0 ? "enter" : index % 3 === 1 ? "watch" : "avoid",
      stanceText: `결정론 판정 문장 ${index}`,
      evidence: [`근거 ${index}`],
      confidence: "medium",
    },
    companyScore: {
      score: 70,
      label: `점수 라벨 ${index}`,
      interpretation: `기업 해석 문장 ${index}`,
      axes: [{ key: "valuation", label: "밸류에이션", score: 70, evidence: [`실수치 ${index}`] }],
      availableAxisCount: 1,
      omittedAxes: ["growth", "profitability", "flow", "chart", "quiet"],
    },
    committeeReview: {
      runId: "run-healthy",
      reviewedAt: "2026-07-20T00:00:00.000Z",
      tradingView: `트레이딩 검수 ${index}`,
      fundamentalView: `재무 검수 ${index}`,
      timingGrade: "B",
      valuationGrade: "B",
      factChecked: true,
    },
  }]));
  return {
    asOf: "2026-07-20T00:00:00.000Z",
    country: "all",
    stocks,
    cards: stocks.map((stock) => ({ kind: "stock" as const, ...stock })),
    fronts: fronts as unknown as Daily30Response["fronts"],
    confidence: "H",
    source: "test",
    meta: {
      targetCount: 30,
      cards: stocks.map((stock) => ({
        id: `stock:${stock.country}:${"symbol" in stock ? stock.symbol : stock.naverCode}:${stock.canonical}`,
        assetClass: stock.market === "COIN" ? "coin" : stock.country === "US" ? "us-stock" : "kr-stock",
        quietScore: 50,
        signalScore: 60,
        hypePenalty: 10,
        signalTypes: ["material_contract"],
      })),
      assetCounts: { "kr-stock": 15, "us-stock": 10, coin: 5, macro: 0 },
      repeatRatio: 0.4,
      committee: {
        runId: "run-healthy",
        version: "s3.v1",
        reviewedAt: "2026-07-20T00:00:00.000Z",
        candidateCount: 40,
        selectedCount: 30,
        callCount: 80,
      },
    },
  };
}

function report(): CommitteeRunReport {
  return {
    runId: "run-healthy",
    version: "s3.v1",
    date: "2026-07-20",
    status: "published",
    startedAt: "2026-07-20T00:00:00.000Z",
    completedAt: "2026-07-20T00:10:00.000Z",
    model: "test",
    callCount: 80,
    candidateCount: 40,
    selectedCount: 30,
    selectedIds: [],
    reviews: [{
      candidateId: "candidate-1",
      canonical: "종목-1",
      approved: true,
      timingGrade: "B",
      valuationGrade: "B",
      tradingView: "검수",
      fundamentalView: "검수",
      rejectionReasons: [],
      factGate: { tradingFallback: false, financialFallback: false, invalidNumbers: [] },
    }],
    compositionSummary: "test",
    assetCounts: { "kr-stock": 15, "us-stock": 10, coin: 5 },
  };
}

describe("quality SLO ledger", () => {
  it("고정된 8개 목표를 만족하는 30장 스냅샷을 통과시킨다", () => {
    const result = calculateQualitySloSnapshot({
      date: "2026-07-20",
      response: healthyResponse(),
      committeeReport: report(),
      computedAt: "2026-07-20T00:20:00.000Z",
    });
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.metrics.causeExplanation).toMatchObject({ ratio: 1, passed: true });
    expect(result.metrics.marketData).toMatchObject({ ratio: 1, passed: true });
    expect(result.metrics.verdict.uniqueTextCount).toBe(30);
    expect(result.metrics.assets).toMatchObject({ kr: 15, us: 10, coin: 5, passed: true });
    expect(result.metrics.depthCoverage).toMatchObject({ complete: 30, ratio: 1, passed: true });
    expect(result.metrics.committee).toMatchObject({ published: true, rejectedCount: 10, factGateDiscardCount: 0 });
  });

  it("의도적 회귀는 전 SLO를 실패시키고 목표를 완화하지 않는다", () => {
    const response = healthyResponse();
    response.stocks = response.stocks.slice(0, 10).map(({ sourceLabel: _sourceLabel, sourceUrl: _sourceUrl, ...stock }) => {
      void _sourceLabel;
      void _sourceUrl;
      return {
        ...stock,
        sector: "기타 업종",
        headline: "원인을 알 수 없는 변동",
        country: "KR",
        market: "KOSPI",
      };
    });
    response.fronts = Object.fromEntries(response.stocks.map((stock, index) => [stock.canonical, {
      signals: { changePct: 5 },
      fomo: { score: 0, label: "관찰", breakdown: [] },
      sparkline: index === 0 ? [0] : [],
      verdict: { stance: "watch", stanceText: "모두 같은 판정", evidence: [], confidence: "low" },
    }])) as unknown as Daily30Response["fronts"];
    response.meta.cards = [];
    response.meta.assetCounts = { "kr-stock": 10, "us-stock": 0, coin: 0, macro: 0 };
    response.meta.repeatRatio = 0.8;
    delete response.meta.committee;
    const result = calculateQualitySloSnapshot({ date: "2026-07-20", response });
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      "cause-explanation",
      "market-data",
      "verdict-discrimination",
      "template-diversity",
      "freshness",
      "asset-mix",
      "committee",
      "depth-coverage",
    ]);
    expect(QUALITY_SLO_TARGETS).toEqual({
      causeExplanationRate: 0.9,
      marketDataRate: 1,
      verdictUniqueTextMin: 10,
      maxSentenceRepeat: 3,
      repeatRatioMax: 0.5,
      usStockMin: 8,
      coinMin: 3,
      coinMax: 5,
      depthCoverageRate: 0.9,
      committeePublished: true,
    });
  });

  it("운영 SQL과 Action이 append-only·미달 경고를 강제한다", () => {
    const sql = readFileSync(resolve(process.cwd(), "prisma/sql/2026-07-20_quality_slo_ledger.sql"), "utf8");
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/quality-slo-monitor.yml"), "utf8");
    expect(sql).toContain("BEFORE UPDATE OR DELETE");
    expect(sql).toContain("QualityLedger is append-only");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("quality:' || \"date\"");
    expect(workflow).toContain("::warning title=Quality SLO missed::");
    expect(workflow).toContain("process.exit(1)");
  });
});
