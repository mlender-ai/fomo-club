import type { CandleDto } from "@fomo/shared";

import type { ExchangeAdapter, GetCandlesInput } from "../types.js";

const timeframeToMs: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000
};

export class MockMarketDataAdapter implements ExchangeAdapter {
  readonly name = "mock-binance-futures";
  readonly mode = "paper" as const;
  readonly supportsOrderExecution = false;

  private readonly basePrices: Record<string, number> = {
    BTCUSDT: 68_500,
    ETHUSDT: 3_450,
    SOLUSDT: 180
  };

  async getRecentCandles(input: GetCandlesInput): Promise<CandleDto[]> {
    const intervalMs = timeframeToMs[input.timeframe] ?? 900_000;
    const end = Date.now() - (Date.now() % intervalMs);
    const seed = [...input.symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const basePrice = this.basePrices[input.symbol] ?? 100;

    let previousClose = basePrice;

    return Array.from({ length: input.limit }, (_, index) => {
      const ratio = index / Math.max(input.limit - 1, 1);
      const trend = basePrice * 0.04 * ratio;
      const wave = Math.sin((seed + index) / 6) * basePrice * 0.008;
      const noise = Math.cos((seed + index) / 4) * basePrice * 0.003;
      const close = Number((basePrice + trend + wave + noise).toFixed(2));
      const open = Number(previousClose.toFixed(2));
      const high = Number((Math.max(open, close) * 1.0025).toFixed(2));
      const low = Number((Math.min(open, close) * 0.9975).toFixed(2));
      const openTime = new Date(end - (input.limit - index) * intervalMs);
      const closeTime = new Date(openTime.getTime() + intervalMs);
      previousClose = close;

      return {
        symbol: input.symbol,
        timeframe: input.timeframe,
        openTime: openTime.toISOString(),
        closeTime: closeTime.toISOString(),
        open,
        high,
        low,
        close,
        volume: Number((40 + Math.abs(Math.cos(index / 3)) * 28).toFixed(2))
      };
    });
  }

  async getLatestPrice(symbol: string): Promise<number> {
    const candles = await this.getRecentCandles({
      symbol,
      timeframe: "15m",
      limit: 1
    });

    return candles[0]?.close ?? this.basePrices[symbol] ?? 0;
  }
}
