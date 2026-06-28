import { describe, expect, it } from "vitest";
import { discoveryMatchesCountry, type DiscoveryScopeResponse } from "../lib/discoveryCountryScope";

const baseDiscovery: DiscoveryScopeResponse = {
  asOf: "2026-06-28",
  country: "US",
  stocks: [
    {
      kind: "stock",
      canonical: "루시드",
      market: "NASDAQ",
      country: "US",
      symbol: "LCID",
      marquee: false,
      sector: "전기차",
    },
  ],
  cards: [
    {
      kind: "stock",
      canonical: "루시드",
      market: "NASDAQ",
      country: "US",
      symbol: "LCID",
      marquee: false,
      sector: "전기차",
    },
  ],
  fronts: {},
  confidence: "M",
  source: "Twelve Data/US 시세",
};

describe("discovery country scope", () => {
  it("accepts US decks only when stock cards are US exchange symbols", async () => {
    expect(discoveryMatchesCountry(baseDiscovery, "US")).toBe(true);
  });

  it("rejects KR cards accidentally stored or emitted into the US deck", async () => {
    const polluted: DiscoveryScopeResponse = {
      ...baseDiscovery,
      stocks: [
        {
          kind: "stock",
          canonical: "엠게임",
          market: "KOSDAQ",
          country: "KR",
          naverCode: "058630",
          marquee: false,
          sector: "게임",
        },
      ],
      cards: [
        {
          kind: "stock",
          canonical: "엠게임",
          market: "KOSDAQ",
          country: "KR",
          naverCode: "058630",
          marquee: false,
          sector: "게임",
        },
      ],
    };

    expect(discoveryMatchesCountry(polluted, "US")).toBe(false);
  });
});
