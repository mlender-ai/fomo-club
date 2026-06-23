import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeywordCard, SectorStock, StockSector } from "@fomo/core";
import { buildTodayDiscoveryStocks, MAX_DISCOVERY_STOCKS } from "../lib/discoveryDeck";

const storage = new Map<string, string>();

function installLocalStorage() {
  storage.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  storage.clear();
});

function stock(i: number, sector: StockSector = "AI", marquee = false): SectorStock {
  return {
    canonical: `테스트${i}`,
    market: "KOSDAQ",
    country: "KR",
    naverCode: `${100000 + i}`,
    marquee,
    sector,
  };
}

function pools(count: number) {
  return [{ sector: "AI" as StockSector, stocks: Array.from({ length: count }, (_, i) => stock(i, "AI", i < 8)) }];
}

describe("buildTodayDiscoveryStocks", () => {
  it("dedupes canonical stocks and caps the discovery deck", () => {
    const cards = [
      {
        keyword: "AI",
        surpriseStock: {
          canonical: "SK바이오팜",
          market: "KOSPI",
          country: "KR",
          mentions: 2,
          surprise: 0.8,
          reason: "원문 근거",
        },
      } as KeywordCard,
    ];

    const result = buildTodayDiscoveryStocks(pools(70), cards, ["AI"]);

    expect(result).toHaveLength(MAX_DISCOVERY_STOCKS);
    expect(new Set(result.map((s) => s.canonical)).size).toBe(result.length);
    const discovered = result.find((s) => s.canonical === "SK바이오팜");
    expect(discovered?.reason).toBe("원문 근거");
    expect(discovered?.naverCode).toBe("326030");
  });

  it("keeps discovered stocks in the keyword sector while enriching market metadata", () => {
    const result = buildTodayDiscoveryStocks(
      [],
      [
        {
          keyword: "AI",
          surpriseStock: {
            canonical: "SK바이오팜",
            market: "KOSPI",
            country: "KR",
            mentions: 3,
            surprise: 0.9,
            reason: "AI 원문 근거",
          },
        } as KeywordCard,
      ],
      ["AI"]
    );

    expect(result[0]).toMatchObject({
      canonical: "SK바이오팜",
      sector: "AI",
      naverCode: "326030",
      reason: "AI 원문 근거",
    });
  });

  it("pushes recently seen and lessed stocks out of the first 20 when there is enough pool", () => {
    installLocalStorage();
    const now = Date.now();
    storage.set(
      "fomo_stock_interest",
      JSON.stringify([
        { stock: "테스트0", signal: "seen", ts: now },
        { stock: "테스트1", signal: "less", ts: now },
      ])
    );

    const result = buildTodayDiscoveryStocks(pools(45), [], ["AI"]);
    const first20 = result.slice(0, 20).map((s) => s.canonical);

    expect(first20).not.toContain("테스트0");
    expect(first20).not.toContain("테스트1");
  });
});
