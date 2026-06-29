import { afterEach, describe, expect, it, vi } from "vitest";
import type { AxisSignal, HookAxis, KeywordCard, MultiAxisHookSelection, SectorStock, StockSector } from "@fomo/core";
import { applyAxisSnapshotToStocks, buildTodayDiscoveryStocks, MAX_DISCOVERY_STOCKS, normalizeDiscoveryDeckCards } from "../lib/discoveryDeck";

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
  it("restores KR naverCode from a six-digit discovery symbol", () => {
    const result = normalizeDiscoveryDeckCards([
      {
        kind: "stock",
        canonical: "엠게임",
        market: "KOSDAQ",
        country: "KR",
        sector: "게임",
        symbol: "058630",
        marquee: false,
      },
    ]);

    expect(result[0]).toMatchObject({ canonical: "엠게임", naverCode: "058630" });
  });

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

  it("downranks sectors that the user recently dismissed", () => {
    installLocalStorage();
    const now = Date.now();
    storage.set("fomo_stock_interest", JSON.stringify([{ stock: "삼성전자", signal: "less", ts: now }]));

    const cards = [
      {
        keyword: "반도체",
        surpriseStock: {
          canonical: "한미반도체",
          market: "KOSDAQ",
          country: "KR",
          mentions: 2,
          surprise: 0.8,
          reason: "반도체 사건 근거",
        },
      } as KeywordCard,
      {
        keyword: "AI",
        surpriseStock: {
          canonical: "SK바이오팜",
          market: "KOSPI",
          country: "KR",
          mentions: 2,
          surprise: 0.8,
          reason: "AI 사건 근거",
        },
      } as KeywordCard,
    ];

    const result = buildTodayDiscoveryStocks([], cards, ["반도체", "AI"]);

    expect(result.map((s) => s.canonical)).toEqual(["SK바이오팜", "한미반도체"]);
  });

  it("applies axis snapshot order while avoiding three identical hook axes in a row", () => {
    installLocalStorage();
    const stocks = Array.from({ length: 7 }, (_, i) => stock(i, i < 3 ? "AI" : i < 5 ? "반도체" : "방산"));
    const axisOf = (i: number): HookAxis => (i < 3 ? "flow" : i < 5 ? "price" : i === 5 ? "herd" : "time");
    const snapshot = Object.fromEntries(
      stocks.map((s, i) => [
        s.canonical,
        {
          axisHook: {
            axis: axisOf(i),
            hookText: `${s.canonical} 축 사실이에요.`,
            strength: 0.8 - i * 0.01,
            rarity: 0,
            evidence: [],
            axisSignals: [],
          } satisfies MultiAxisHookSelection,
          axisSignals: [
            {
              axis: axisOf(i),
              fired: true,
              strength: 0.8 - i * 0.01,
              rarity: 0,
              hookText: `${s.canonical} 축 사실이에요.`,
              evidence: [{ text: "실측", sourceKind: "market", source: "테스트", asOf: "오늘 기준" }],
            },
          ] satisfies AxisSignal[],
        },
      ])
    );

    const result = applyAxisSnapshotToStocks(stocks, snapshot);
    const axes = result.map((s) => s.axisHook?.axis);

    for (let i = 2; i < axes.length; i += 1) {
      expect([axes[i - 2], axes[i - 1], axes[i]]).not.toEqual([axes[i], axes[i], axes[i]]);
    }
  });
});
