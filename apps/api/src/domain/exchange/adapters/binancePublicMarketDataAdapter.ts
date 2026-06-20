import type { CandleDto } from "@fomo/shared";

import type { ExchangeAdapter, GetCandlesInput } from "../types.js";
import { MockMarketDataAdapter } from "./mockMarketDataAdapter.js";

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string
];

interface BinanceTickerPrice {
  price: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "content-type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Binance market data request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export class BinancePublicMarketDataAdapter implements ExchangeAdapter {
  readonly name = "binance-public";
  readonly mode = "paper" as const;
  readonly supportsOrderExecution = false;

  private readonly fallback = new MockMarketDataAdapter();

  async getRecentCandles(input: GetCandlesInput): Promise<CandleDto[]> {
    try {
      const klines = await fetchJson<BinanceKline[]>(
        `https://api.binance.com/api/v3/klines?symbol=${input.symbol}&interval=${input.timeframe}&limit=${input.limit}`
      );

      return klines.map((item) => ({
        symbol: input.symbol,
        timeframe: input.timeframe,
        openTime: new Date(item[0]).toISOString(),
        closeTime: new Date(item[6]).toISOString(),
        open: Number(item[1]),
        high: Number(item[2]),
        low: Number(item[3]),
        close: Number(item[4]),
        volume: Number(item[5])
      }));
    } catch {
      return this.fallback.getRecentCandles(input);
    }
  }

  async getLatestPrice(symbol: string): Promise<number> {
    try {
      const ticker = await fetchJson<BinanceTickerPrice>(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      return Number(ticker.price);
    } catch {
      return this.fallback.getLatestPrice(symbol);
    }
  }
}
