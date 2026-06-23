import { describe, expect, it } from "vitest";
import {
  distribution,
  evaluateQuality,
  hookTier,
  percentile,
  summarizeLatencies,
  type HookSample,
  type LatencySample,
} from "../fomo-quality-report-core";

describe("fomo-quality-report-core", () => {
  it("hook kind를 리포트용 tier로 분류한다", () => {
    expect(hookTier("news_event")).toBe("material");
    expect(hookTier("relative")).toBe("material");
    expect(hookTier("axis_tension")).toBe("tension");
    expect(hookTier("ta_fact")).toBe("shape");
    expect(hookTier("fallback")).toBe("fallback");
  });

  it("latency p50/p95와 에러 수를 endpoint별로 요약한다", () => {
    const samples: LatencySample[] = [
      { endpoint: "a", ok: true, ms: 100 },
      { endpoint: "a", ok: true, ms: 300 },
      { endpoint: "a", ok: false, ms: 900 },
      { endpoint: "b", ok: true, ms: 40 },
    ];

    expect(percentile([100, 200, 300], 0.5)).toBe(200);
    expect(summarizeLatencies(samples)).toEqual([
      { endpoint: "a", count: 3, ok: 2, error: 1, p50Ms: 100, p95Ms: 300, maxMs: 300 },
      { endpoint: "b", count: 1, ok: 1, error: 0, p50Ms: 40, p95Ms: 40, maxMs: 40 },
    ]);
  });

  it("분포를 count 내림차순으로 계산한다", () => {
    expect(distribution(["fallback", "material", "fallback"])).toEqual([
      { key: "fallback", count: 2, rate: 2 / 3 },
      { key: "material", count: 1, rate: 1 / 3 },
    ]);
  });

  it("fallback/insufficient/latency 위험을 finding으로 올린다", () => {
    const liteHooks: HookSample[] = [
      { stock: "A", kind: "fallback", headline: "아직 조용한 자리예요." },
      { stock: "B", kind: "fallback", headline: "아직 조용한 자리예요." },
      { stock: "C", kind: "news_event", headline: "계약 공시가 나왔어요." },
    ];

    const findings = evaluateQuality(
      {
        cardCount: 3,
        confidence: "fallback",
        stale: true,
        snapshotDate: "2026-06-22",
        sourceCount: 2,
        relatedStockCount: 3,
        duplicateHeadlineCount: 1,
      },
      {
        liteHooks,
        fullHooks: [],
        insightCount: 2,
        insufficientInsightCount: 1,
      },
      [{ endpoint: "stock_front_lite", count: 3, ok: 2, error: 1, p50Ms: 2500, p95Ms: 5000, maxMs: 5000 }]
    );

    expect(findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        "keywords confidence가 fallback입니다.",
        "카드 중 원문 source가 없는 항목이 있습니다.",
        "중복 카드 코멘트 1건이 있습니다.",
        "카드 lite hook fallback 비율이 67%입니다.",
        "stock_front_lite 에러 1/3건이 있습니다.",
        "stock_front_lite p95가 5000ms입니다.",
      ])
    );
  });
});
