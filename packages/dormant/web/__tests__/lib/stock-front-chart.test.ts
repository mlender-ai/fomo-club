import { describe, expect, it } from "vitest";

import { buildChartSeries } from "../../lib/stock-front";

describe("buildChartSeries", () => {
  it("1년 차트와 와이코프 이벤트가 같은 260거래일 축을 사용한다", () => {
    const candles = Array.from({ length: 320 }, (_, index) => {
      const close = 100 + index * 0.2;
      return {
        date: new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10),
        open: close - 0.1,
        high: close + 0.5,
        low: close - 0.5,
        close,
        volume: 1_000 + index,
      };
    });

    const series = buildChartSeries(candles);

    expect(series?.closes).toHaveLength(260);
    expect(series?.closes[0]).toBe(candles[60]!.close);
    expect(series?.closes.at(-1)).toBe(candles.at(-1)!.close);
    expect(series?.ma120.slice(0, 59).every((value) => value === null)).toBe(true);
    expect(series?.ma120.slice(59).every((value) => typeof value === "number")).toBe(true);
  });

  it("명시한 창 크기는 그대로 존중한다", () => {
    const candles = Array.from({ length: 80 }, (_, index) => ({
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100 + index,
      volume: 1_000,
    }));

    expect(buildChartSeries(candles, 66)?.closes).toHaveLength(66);
  });
});
