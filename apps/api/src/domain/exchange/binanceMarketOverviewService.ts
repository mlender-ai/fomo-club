import type { MarketOverviewResponse, MarketSymbol, MarketTickerView } from "@fomo/shared";

import { env } from "../../config/env.js";
import { demoMarketOverview } from "../../demo/dashboardSummary.js";

const symbols: MarketSymbol[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

interface BinanceTicker24h {
  lastPrice: string;
  priceChangePercent: string;
}

type BinanceUiKline = [
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

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: {
      "content-type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Market request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export class BinanceMarketOverviewService {
  async getOverview(): Promise<MarketOverviewResponse> {
    if (env.MARKET_DATA_PROVIDER === "demo") {
      return structuredClone(demoMarketOverview);
    }

    const startedAt = Date.now();

    try {
      const tickers = await Promise.all(
        symbols.map(async (symbol) => {
          const [ticker, klines] = await Promise.all([
            fetchJson<BinanceTicker24h>(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`),
            fetchJson<BinanceUiKline[]>(`https://api.binance.com/api/v3/uiKlines?symbol=${symbol}&interval=1m&limit=24`)
          ]);

          return {
            symbol,
            lastPrice: Number(ticker.lastPrice),
            changePct24h: Number(ticker.priceChangePercent),
            status: "LIVE",
            updatedAt: new Date().toISOString(),
            series: klines.map((item) => ({
              time: new Date(item[0]).toISOString(),
              value: Number(item[4])
            }))
          } satisfies MarketTickerView;
        })
      );

      return {
        provider: "binance-public",
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        tickers
      };
    } catch {
      return {
        ...structuredClone(demoMarketOverview),
        updatedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt
      };
    }
  }
}
