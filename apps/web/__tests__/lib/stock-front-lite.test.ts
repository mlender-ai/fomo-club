import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/supply-demand-store", () => ({
  readSupplyDemandHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../lib/us-market-cache", () => ({
  readUsMarketQuoteRows: vi.fn().mockResolvedValue([]),
}));

import { assembleStockFront } from "../../lib/stock-front";
import { readUsMarketQuoteRows } from "../../lib/us-market-cache";

const dailyText = `
[
["날짜","시가","고가","저가","종가","거래량"],
["20260616", 990, 1060, 980, 1000, 9000],
["20260617", 1000, 1100, 990, 1010, 10000],
["20260618", 1010, 1120, 1000, 1040, 12000],
["20260619", 1040, 1150, 1030, 1090, 18000],
["20260622", 1090, 1160, 1080, 1110, 22000],
["20260623", 1110, 1200, 1100, 1180, 26000]
]
`;

describe("assembleStockFront lite", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("siseJson.naver")) {
          return new Response(dailyText, { status: 200 });
        }
        if (url.includes("/basic")) {
          return Response.json({
            stockName: "삼성전자",
            stockExchangeName: "코스피",
            closePrice: "70,000",
            compareToPreviousClosePrice: "-1,000",
            fluctuationsRatio: "-1.41",
          });
        }
        return new Response("{}", { status: 500 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("카드 경량 경로에서도 라인차트용 sparkline을 반환한다", async () => {
    const front = await assembleStockFront("삼성전자", undefined, {}, { lite: true });

    expect(front.sparkline).toEqual([1000, 1010, 1040, 1090, 1110, 1180]);
    expect(front.taFact).toBeUndefined();
    expect(front.fomo.inputs.volume).toBeDefined();
    expect(front.fomo.inputs.price).toBeDefined();
    expect(front.axisSignals?.some((signal) => signal.fired)).toBe(true);
    expect(front.axisHook?.hookText).toBeTruthy();
  });

  it("카드 경량 경로에서도 캐시된 coverage와 강세·약세 1줄을 반환한다", async () => {
    const front = await assembleStockFront(
      "삼성전자",
      undefined,
      {
        attention: {
          mentionCount: 5,
          mentionScore: 85,
          newsEventLabel: "HBM 공급 확대",
          newsEventSource: "테스트뉴스",
        },
        themeRelative: {
          themeLabel: "반도체",
          themeRelativeRank: 6,
          themePeerCount: 6,
          themeAverageChangePct: 3.2,
          themeRelativeChangePct: -4.6,
        },
      },
      { lite: true }
    );

    expect(front.signals.mentionScore).toBe(85);
    expect(front.signals.newsEventLabel).toBe("HBM 공급 확대");
    expect(front.signals.themeRelativeRank).toBe(6);
    expect(front.feedBull).toEqual({ text: "오늘 이 종목을 직접 언급한 뉴스가 있어요.", source: "뉴스" });
    expect(front.feedBear).toEqual({ text: "반도체 평균보다 덜 움직였어요.", source: "테마" });
    expect(front.axisSignals?.some((signal) => signal.axis === "time" && signal.fired)).toBe(true);
    expect(front.axisHook?.axis).toBe("time");
  });

  it("미국 종목은 symbol 기반 quote cache에서 가격과 차트를 반환한다", async () => {
    vi.mocked(readUsMarketQuoteRows).mockResolvedValueOnce([
      {
        canonical: "메타",
        symbol: "META",
        market: "NASDAQ",
        country: "US",
        currency: "USD",
        priceText: "$705.80",
        changeText: "+12.20 (+1.76%)",
        changeDir: "up",
        changePct: 1.76,
        sparkline: [690, 696, 705.8],
        sectorHint: "AI",
      },
    ]);

    const front = await assembleStockFront("메타", undefined, {}, { lite: true, symbol: "META" });

    expect(front.priceText).toBe("$705.80");
    expect(front.changeText).toBe("+12.20 (+1.76%)");
    expect(front.signals.changePct).toBe(1.76);
    expect(front.sparkline).toEqual([690, 696, 705.8]);
    expect(front.fomo.inputs.price).toBeDefined();
    expect(front.axisSignals?.some((signal) => signal.axis === "price")).toBe(true);
  });
});
