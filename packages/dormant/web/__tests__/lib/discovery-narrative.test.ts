import { describe, expect, it } from "vitest";
import type { DiscoveryCandidate } from "@fomo/core";
import { buildNarrativeCards } from "../../lib/discovery-supply";
import type { DiscoveryMarketRow } from "../../lib/market-source-types";

function row(canonical: string, symbol: string, changePct?: number): DiscoveryMarketRow {
  return {
    canonical,
    symbol,
    market: "NASDAQ",
    country: "US",
    currency: "USD",
    sectorHint: "AI",
    ...(typeof changePct === "number" ? { changePct } : {}),
  };
}

function candidate(ticker: string): DiscoveryCandidate {
  return {
    ticker,
    market: "NASDAQ",
    country: "US",
    sector: "AI",
    asOf: "2026-07-01",
    events: [
      {
        kind: "news_mention",
        firstSeen: true,
        strength: 0.9,
        source: "Yahoo Finance",
        sourceName: "Yahoo Finance",
        sourceUrl: "https://finance.yahoo.com/test",
        asOf: "2026-07-01",
        confidence: "H",
        label: "엔비디아 데이터센터 실적 서프라이즈",
        headlineHook: "엔비디아 데이터센터 실적 서프라이즈",
        changePct: 3.2,
      },
    ],
  };
}

describe("discovery narrative cards", () => {
  it("builds a factual narrative from a material trigger and relation-map stocks with real moves", () => {
    const rows = new Map<string, DiscoveryMarketRow>([
      ["엔비디아", row("엔비디아", "NVDA", 3.2)],
      ["VRT", row("VRT", "VRT", 2.4)],
    ]);

    const cards = buildNarrativeCards([candidate("엔비디아")], rows);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      kind: "narrative",
      scope: "US",
      trigger: { headline: "엔비디아 데이터센터 실적 서프라이즈", anchorTicker: "엔비디아" },
    });
    expect(cards[0]!.stocks.map((stock) => [stock.ticker, stock.relation, stock.changePct])).toEqual([
      ["엔비디아", "trigger", 3.2],
      ["VRT", "beneficiary", 2.4],
    ]);
  });

  it("skips narratives when linked stocks do not have measured changePct", () => {
    const rows = new Map<string, DiscoveryMarketRow>([
      ["엔비디아", row("엔비디아", "NVDA", 3.2)],
      ["VRT", row("VRT", "VRT")],
    ]);

    expect(buildNarrativeCards([candidate("엔비디아")], rows)).toHaveLength(0);
  });
});
