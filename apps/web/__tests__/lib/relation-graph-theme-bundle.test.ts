import { describe, expect, it } from "vitest";
import type { DiscoveryCandidate } from "@fomo/core";
import { buildThemeBundleCards } from "../../lib/discovery-supply";
import type { DiscoveryMarketRow } from "../../lib/market-source-types";
import { relatedTo } from "../../lib/relation-graph";

describe("relation graph", () => {
  it("returns only grounded curated relations with source and confidence", () => {
    const nodes = relatedTo({ kind: "ticker", ticker: "005930.KS" });

    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((node) => node.source && node.confidence)).toBe(true);
    expect(nodes.every((node) => node.relation !== undefined)).toBe(true);
  });

  it("maps app themes to curated relation seeds without using same-sector as standalone evidence", () => {
    const nodes = relatedTo({ kind: "theme", theme: "반도체" });

    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((node) => node.source === "FOMO curated relation map")).toBe(true);
  });
});

describe("theme bundle cards", () => {
  it("does not create a bundle without a real current event", () => {
    const candidate: DiscoveryCandidate = {
      ticker: "삼성전자",
      market: "KOSPI",
      country: "KR",
      sector: "반도체",
      asOf: "2026-06-27",
      events: [
        {
          kind: "market_context",
          firstSeen: true,
          strength: 0.5,
          source: "FOMO 섹터맵",
          asOf: "2026-06-27",
          confidence: "M",
          label: "반도체 흐름에서 확인하는 종목이에요.",
          direction: "up",
        },
      ],
    };

    const cards = buildThemeBundleCards([candidate], new Map());

    expect(cards).toEqual([]);
  });

  it("does not create a bundle from same-sector theme movement alone", () => {
    const candidate: DiscoveryCandidate = {
      ticker: "삼성전자",
      market: "KOSPI",
      country: "KR",
      sector: "반도체",
      asOf: "2026-06-27",
      events: [
        {
          kind: "theme_link",
          firstSeen: true,
          strength: 0.92,
          source: "FOMO 섹터맵·네이버 시세",
          asOf: "2026-06-27",
          confidence: "M",
          label: "오늘 반도체 흐름에서 먼저 확인된 종목이에요.",
          direction: "up",
        },
      ],
    };
    const rows = new Map<string, DiscoveryMarketRow>([
      ["SK하이닉스", row("SK하이닉스", "000660", 3.2)],
      ["엔비디아", { canonical: "엔비디아", symbol: "NVDA", market: "NASDAQ", country: "US", currency: "USD", changePct: 1.1 }],
    ]);

    const cards = buildThemeBundleCards([candidate], rows);

    expect(cards).toEqual([]);
  });

  it("creates an event-driven bundle only when related stocks have current market rows", () => {
    const candidate: DiscoveryCandidate = {
      ticker: "삼성전자",
      market: "KOSPI",
      country: "KR",
      sector: "반도체",
      asOf: "2026-06-27",
      events: [
        {
          kind: "disclosure",
          firstSeen: true,
          strength: 0.96,
          source: "DART",
          asOf: "2026-06-27",
          confidence: "H",
          label: "신규 공급계약 공시가 확인됐어요.",
          direction: "up",
        },
      ],
    };
    const rows = new Map<string, DiscoveryMarketRow>([
      ["SK하이닉스", row("SK하이닉스", "000660", 3.2)],
      ["엔비디아", { canonical: "엔비디아", symbol: "NVDA", market: "NASDAQ", country: "US", currency: "USD", changePct: 1.1 }],
    ]);

    const cards = buildThemeBundleCards([candidate], rows);

    expect(cards).toHaveLength(1);
    expect(cards[0]?.items).toHaveLength(2);
    expect(cards[0]?.items.every((item) => item.source && item.confidence)).toBe(true);
  });
});

function row(canonical: string, naverCode: string, changePct: number): DiscoveryMarketRow {
  return {
    canonical,
    symbol: naverCode,
    naverCode,
    market: "KOSPI",
    country: "KR",
    currency: "KRW",
    changePct,
  };
}
