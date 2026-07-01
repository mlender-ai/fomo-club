import { afterEach, describe, expect, it, vi } from "vitest";
import type { AxisSignal, HookAxis, KeywordCard, MultiAxisHookSelection, SectorStock, StockSector } from "@fomo/core";
import {
  applyAxisSnapshotToStocks,
  buildDiscoveryDeckCards,
  buildContentDeckCards,
  buildNarrativeDeckCards,
  buildSectorDeckCards,
  buildTodayDiscoveryStocks,
  interleaveSupplementalCards,
  interleaveSectorCards,
  MAX_DISCOVERY_STOCKS,
  normalizeDiscoveryDeckCards,
  type DeckCard,
  type DeckContent,
  type DeckNarrative,
  type DeckStock,
} from "../lib/discoveryDeck";

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

function deckStock(
  canonical: string,
  sector: string,
  country: "KR" | "US" = "KR",
): DeckStock {
  const code = String(100000 + canonical.length * 17).padStart(6, "0").slice(0, 6);
  return {
    canonical,
    market: country === "KR" ? "KOSPI" : "NASDAQ",
    country,
    marquee: false,
    sector,
    ...(country === "KR" ? { naverCode: code } : { symbol: canonical }),
    ...(country === "KR"
      ? {
        axisSignals: [
          {
            axis: "flow",
            fired: true,
            strength: 0.7,
            rarity: 0,
            hookText: "기관이 순매수 중이에요.",
            evidence: [{ text: "기관 순매수", sourceKind: "official", source: "KRX", asOf: "오늘" }],
          },
        ],
      }
      : {}),
  } as DeckStock;
}

function frontsFor(stocks: readonly DeckStock[], changes: readonly number[] = []): Record<string, { signals: { changePct: number; volumeRatio?: number } }> {
  return Object.fromEntries(
    stocks.map((item, index) => [
      item.canonical,
      { signals: { changePct: changes[index] ?? 1, ...(item.country === "US" ? { volumeRatio: 1.8 } : {}) } },
    ])
  );
}

function sectorCard(cards: readonly DeckCard[], sector: string) {
  return cards.find((card) => card.type === "sector" && card.data.sector === sector) as
    | Extract<DeckCard, { type: "sector" }>
    | undefined;
}

function contentCard(id: string, scope: DeckContent["scope"], contentType: DeckContent["contentType"] = "index"): DeckContent {
  return {
    kind: "content",
    id,
    contentType,
    scope,
    headline: id,
    facts: [{ label: "테스트", value: "+1.20%" }],
    source: "테스트",
    asOf: "2026-07-01",
  };
}

function narrativeCard(id: string, scope: "KR" | "US" = "KR"): DeckNarrative {
  const market = scope === "KR" ? "KOSPI" : "NASDAQ";
  return {
    kind: "narrative",
    id,
    scope,
    trigger: {
      headline: "반도체 공급망 사건",
      source: "테스트뉴스",
      asOf: "2026-07-01",
      anchorTicker: scope === "KR" ? "삼성전자" : "엔비디아",
    },
    headline: "반도체 공급망 사건에 연결 종목 동반 강세",
    stocks: [
      {
        ticker: scope === "KR" ? "삼성전자" : "엔비디아",
        name: scope === "KR" ? "삼성전자" : "엔비디아",
        market,
        country: scope,
        relation: "trigger",
        relationReason: "이 뉴스에서 직접 언급된 종목입니다.",
        changePct: 2.4,
      },
      {
        ticker: scope === "KR" ? "SK하이닉스" : "VRT",
        name: scope === "KR" ? "SK하이닉스" : "VRT",
        market,
        country: scope,
        relation: "beneficiary",
        relationReason: "관계맵에서 확인된 연결 종목입니다.",
        changePct: 3.1,
      },
    ],
    source: "테스트뉴스",
    asOf: "2026-07-01",
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

  it("builds country-scoped sector cards and skips thin US sectors", () => {
    const stocks: DeckStock[] = [
      deckStock("삼성전자", "반도체", "KR"),
      deckStock("SK하이닉스", "반도체", "KR"),
      deckStock("엔비디아", "반도체", "US"),
      deckStock("TSMC", "반도체", "US"),
      deckStock("로켓랩", "우주", "US"),
    ];

    const krCards = buildSectorDeckCards(stocks, { country: "KR", fronts: frontsFor(stocks, [2, 3, 4, 5, 9]) });
    const usCards = buildSectorDeckCards(stocks, { country: "US", fronts: frontsFor(stocks, [2, 3, 4, 5, 9]) });

    expect(sectorCard(krCards, "반도체")?.data.stocks.every((row) => row.country === "KR")).toBe(true);
    expect(sectorCard(usCards, "반도체")?.data.stocks.every((row) => row.country === "US")).toBe(true);
    expect(usCards.some((card) => card.type === "sector" && card.data.sector === "우주")).toBe(false);
    expect(usCards.flatMap((card) => (card.type === "sector" ? card.data.stocks : [])).some((row) => row.flowSignal)).toBe(false);
  });

  it("skips US sector cards when fewer than two rows have real price signals", () => {
    const stocks: DeckStock[] = [
      deckStock("마벨테크놀로지", "반도체", "US"),
      deckStock("엔비디아", "반도체", "US"),
      deckStock("마이크론", "반도체", "US"),
    ];
    const cards = buildSectorDeckCards(stocks, {
      country: "US",
      fronts: {
        마벨테크놀로지: { signals: { changePct: 7.3, volumeRatio: 1.8 } },
      },
    });

    expect(cards.some((card) => card.type === "sector" && card.data.sector === "반도체")).toBe(false);
  });

  it("interleaves one sector card after every five stock cards without consecutive same sectors", () => {
    const stocks: DeckCard[] = Array.from({ length: 11 }, (_, i) => ({ type: "stock", data: deckStock(`종목${i}`, "AI") }));
    const sectors: DeckCard[] = [
      {
        type: "sector",
        data: { id: "sector:KR:AI", sector: "AI", country: "KR", stance: "bull-dominant", stanceNote: "테스트", stocks: [] },
      },
      {
        type: "sector",
        data: { id: "sector:KR:반도체", sector: "반도체", country: "KR", stance: "balanced", stanceNote: "테스트", stocks: [] },
      },
    ];

    const result = interleaveSectorCards(stocks, sectors, 5);

    expect(result[5]?.type).toBe("sector");
    expect(result[11]?.type).toBe("sector");
    expect(result.filter((card) => card.type === "sector").map((card) => card.data.sector)).toEqual(["AI", "반도체"]);
  });

  it("still appends a sector card for short country decks when a sector is available", () => {
    const stocks: DeckCard[] = Array.from({ length: 2 }, (_, i) => ({ type: "stock", data: deckStock(`미국${i}`, "반도체", "US") }));
    const sectors: DeckCard[] = [
      {
        type: "sector",
        data: { id: "sector:US:반도체", sector: "반도체", country: "US", stance: "bull-dominant", stanceNote: "테스트", stocks: [] },
      },
    ];

    const result = interleaveSectorCards(stocks, sectors, 5);

    expect(result.map((card) => card.type)).toEqual(["stock", "stock", "sector"]);
  });

  it("filters content cards by country scope while allowing global cards", () => {
    const content = [
      contentCard("domestic-index", "domestic"),
      contentCard("world-index", "world"),
      contentCard("global-whale", "global", "whale"),
    ];

    expect(buildContentDeckCards(content, "KR").map((card) => (card.type === "content" ? card.data.id : ""))).toEqual([
      "domestic-index",
      "global-whale",
    ]);
    expect(buildContentDeckCards(content, "US").map((card) => (card.type === "content" ? card.data.id : ""))).toEqual([
      "world-index",
      "global-whale",
    ]);
  });

  it("filters narrative cards by country scope and requires real linked stocks", () => {
    const thin = { ...narrativeCard("thin", "KR"), stocks: [narrativeCard("thin", "KR").stocks[0]!] };
    expect(buildNarrativeDeckCards([narrativeCard("kr-story", "KR"), narrativeCard("us-story", "US"), thin], "KR").map((card) => card.type === "narrative" ? card.data.id : "")).toEqual(["kr-story"]);
    expect(buildNarrativeDeckCards([narrativeCard("kr-story", "KR"), narrativeCard("us-story", "US")], "US").map((card) => card.type === "narrative" ? card.data.id : "")).toEqual(["us-story"]);
  });

  it("interleaves sector and content cards after stock intervals", () => {
    const stocks: DeckCard[] = Array.from({ length: 11 }, (_, i) => ({ type: "stock", data: deckStock(`종목${i}`, "AI") }));
    const sector: DeckCard = {
      type: "sector",
      data: { id: "sector:KR:AI", sector: "AI", country: "KR", stance: "bull-dominant", stanceNote: "테스트", stocks: [] },
    };
    const narrative: DeckCard = { type: "narrative", data: narrativeCard("kr-story", "KR") };
    const content: DeckCard = { type: "content", data: contentCard("domestic-index", "domestic") };

    const result = interleaveSupplementalCards(stocks, [sector, narrative, content], 5);

    expect(result[5]?.type).toBe("sector");
    expect(result[11]?.type).toBe("narrative");
  });

  it("builds discovery deck cards with stock and sector card types", () => {
    const stocks = Array.from({ length: 11 }, (_, i) => deckStock(`국내${i}`, i < 6 ? "반도체" : "AI", "KR"));
    const result = buildDiscoveryDeckCards(stocks, {
      country: "KR",
      fronts: frontsFor(stocks),
      interval: 3,
      contentCards: [contentCard("domestic-index", "domestic"), contentCard("world-index", "world")],
    });

    expect(result.some((card) => card.type === "sector")).toBe(true);
    expect(buildDiscoveryDeckCards([...stocks, narrativeCard("kr-story", "KR")], { country: "KR", fronts: frontsFor(stocks), interval: 3 }).some((card) => card.type === "narrative")).toBe(true);
    expect(result.some((card) => card.type === "content" && card.data.id === "domestic-index")).toBe(true);
    expect(result.some((card) => card.type === "content" && card.data.id === "world-index")).toBe(false);
    expect(result.filter((card) => card.type === "stock")).toHaveLength(11);
  });
});
