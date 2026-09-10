import { describe, expect, it } from "vitest";
import { isDiscoveryRowAllowedForScope } from "../../lib/discovery-supply";
import type { DiscoveryMarketRow } from "../../lib/market-source-types";

describe("discovery market country scope", () => {
  it("rejects KR rows from the US discovery scope", () => {
    const mgame: DiscoveryMarketRow = {
      canonical: "엠게임",
      symbol: "058630",
      naverCode: "058630",
      market: "KOSDAQ",
      country: "KR",
      currency: "KRW",
      priceText: "4,040원",
    };

    expect(isDiscoveryRowAllowedForScope(mgame, "US")).toBe(false);
    expect(isDiscoveryRowAllowedForScope(mgame, "KR")).toBe(true);
  });

  it("accepts only USD exchange symbols for the US discovery scope", () => {
    const lucid: DiscoveryMarketRow = {
      canonical: "루시드",
      symbol: "LCID",
      market: "NASDAQ",
      country: "US",
      currency: "USD",
      priceText: "$2.10",
    };

    expect(isDiscoveryRowAllowedForScope(lucid, "US")).toBe(true);
    expect(isDiscoveryRowAllowedForScope({ ...lucid, market: "KOSDAQ" }, "US")).toBe(false);
    expect(isDiscoveryRowAllowedForScope({ ...lucid, currency: "KRW" }, "US")).toBe(false);
    expect(isDiscoveryRowAllowedForScope({ ...lucid, naverCode: "058630" }, "US")).toBe(false);
  });
});
