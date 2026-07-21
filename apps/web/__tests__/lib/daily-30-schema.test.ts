import { describe, expect, it, vi } from "vitest";
import { computeCompanyScore, withCompanyQuietScore } from "@fomo/core";

vi.mock("next/cache", () => ({ unstable_cache: (factory: () => unknown) => factory }));

import { buildUnifiedCardSnapshot, type Daily30AssetClass } from "../../lib/daily-30";
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
    const score = withCompanyQuietScore(computeCompanyScore({}), { quietScore: 40 });
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
});
