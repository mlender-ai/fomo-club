import { describe, expect, it, vi } from "vitest";
import { computeCompanyScore, withCompanyQuietScore } from "@fomo/core";

vi.mock("next/cache", () => ({ unstable_cache: (factory: () => unknown) => factory }));

import { buildUnifiedCardSnapshot, normalizeDaily30Response, type Daily30AssetClass, type Daily30Response } from "../../lib/daily-30";
import type { DiscoveryFrontSeed, DiscoveryStockPayload } from "../../lib/discovery-supply";

function stock(assetClass: Daily30AssetClass): DiscoveryStockPayload {
  return {
    canonical: assetClass,
    market: assetClass === "coin" ? "COIN" : assetClass === "us-stock" ? "NASDAQ" : "KOSPI",
    country: assetClass === "us-stock" ? "US" : assetClass === "coin" ? "GLOBAL" : "KR",
    sector: assetClass === "coin" ? "코인" : "AI",
    marquee: false,
    headline: `${assetClass} 실데이터 헤드라인`,
  };
}

function front(): DiscoveryFrontSeed {
  return {
    signals: { changePct: 1.5 },
    sparkline: [100, 101.5],
    priceText: "101.5",
    changeText: "+1.5%",
    changeDir: "up",
    verdict: { stance: "watch", stanceText: "신호 혼조", evidence: [], confidence: "medium" },
  };
}

describe("daily-30 unified card schema", () => {
  it("KR/US/coin cards expose the exact same required field set", () => {
    const score = withCompanyQuietScore(
      computeCompanyScore({ signals: { volumeRatio: 2, changePct: 2.5 } }),
      { quietScore: 40 }
    );
    const cards = (["kr-stock", "us-stock", "coin"] as const).map((asset) =>
      buildUnifiedCardSnapshot(stock(asset), asset, front(), score)
    );
    const keys = Object.keys(cards[0]!).sort();
    expect(cards.every((card) => JSON.stringify(Object.keys(card).sort()) === JSON.stringify(keys))).toBe(true);
    expect(keys).toEqual([
      "assetClass", "canonical", "changeDir", "changeText", "country", "headline", "market", "priceText", "score", "sparkline", "tag", "verdict",
    ]);
    expect(cards.every((card) => card.score.status === "ready" && card.sparkline.length > 0)).toBe(true);
  });

  it("keeps legacy flow missing when the snapshot has no measured flow evidence", () => {
    const legacy = {
      asOf: "2026-07-20",
      country: "all",
      stocks: [stock("us-stock")],
      cards: [],
      fronts: {
        "us-stock": {
          signals: {},
          sparkline: [100, 101],
          companyScore: {
            score: 70,
            label: "legacy",
            interpretation: "legacy",
            axes: [
              { key: "growth", label: "성장", score: 70, evidence: ["실적"] },
              { key: "chart", label: "차트", score: 60, evidence: ["구간"] },
              { key: "quiet", label: "조용함", score: 80, evidence: ["조용함"] },
            ],
            availableAxisCount: 3,
            omittedAxes: ["valuation", "profitability", "flow"],
          },
        },
      },
      confidence: "M",
      source: "legacy",
      meta: {
        targetCount: 1,
        cards: [{ id: "legacy", assetClass: "us-stock", quietScore: 64, signalScore: 70, hypePenalty: 6 }],
        assetCounts: { "kr-stock": 0, "us-stock": 1, coin: 0, macro: 0 },
      },
    } as unknown as Daily30Response;
    const normalized = normalizeDaily30Response(legacy).fronts["us-stock"]!;
    expect(normalized.score?.axisStates.filter((axis) => ["flow", "chart", "quiet"].includes(axis.key)).map((axis) => axis.status)).toEqual([
      "missing", "available", "available",
    ]);
    expect(normalized).not.toHaveProperty("fomo");
    expect(normalized).not.toHaveProperty("companyScore");
  });
});
