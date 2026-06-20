"use client";

import { useEffect, useMemo, useState } from "react";

import type { MarketOverviewResponse, MarketTickerView } from "@fomo/shared";

import { getMarketOverviewClient } from "../../lib/client-api";
import { formatCompactNumber } from "../../lib/format";

interface MarketMiniChartsProps {
  initialMarket: MarketOverviewResponse;
}

interface BinanceTickerStreamMessage {
  data?: {
    s?: string;
    c?: string;
    P?: string;
  };
}

function buildSparklinePath(series: MarketTickerView["series"], width: number, height: number) {
  if (series.length === 0) {
    return "";
  }

  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return series
    .map((point, index) => {
      const x = series.length === 1 ? 0 : (index / (series.length - 1)) * width;
      const y = height - ((point.value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function LiveMiniChartCard({ ticker }: { ticker: MarketTickerView }) {
  const width = 240;
  const height = 48;
  const linePath = useMemo(() => buildSparklinePath(ticker.series, width, height - 4), [ticker.series]);

  return (
    <article className="market-card">
      <div className="market-card-top">
        <div className="market-symbol">
          <strong>{ticker.symbol.replace("USDT", "")}</strong>
          <span>{ticker.status}</span>
        </div>
        <div className="market-price-block">
          <strong>{formatCompactNumber(ticker.lastPrice)}</strong>
          <span className={ticker.changePct24h >= 0 ? "value-positive" : "value-negative"}>{ticker.changePct24h.toFixed(2)}%</span>
        </div>
      </div>
      <svg aria-hidden="true" className="market-chart-svg" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
        <line className="market-chart-baseline" x1="0" x2={width} y1={height - 6} y2={height - 6} />
        <path className="market-chart-path" d={linePath} />
      </svg>
    </article>
  );
}

export function MarketMiniCharts({ initialMarket }: MarketMiniChartsProps) {
  const [market, setMarket] = useState(initialMarket);

  useEffect(() => {
    let isMounted = true;

    async function refreshSnapshot() {
      try {
        const next = await getMarketOverviewClient();

        if (isMounted) {
          setMarket(next);
        }
      } catch {}
    }

    refreshSnapshot();

    const interval = window.setInterval(refreshSnapshot, 45_000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const websocket = new WebSocket(
      "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker"
    );

    websocket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as BinanceTickerStreamMessage;
        const symbol = payload.data?.s as MarketTickerView["symbol"] | undefined;
        const lastPrice = payload.data?.c ? Number(payload.data.c) : null;
        const changePct = payload.data?.P ? Number(payload.data.P) : null;

        if (!symbol || lastPrice === null) {
          return;
        }

        setMarket((current) => ({
          ...current,
          provider: "binance-websocket",
          updatedAt: new Date().toISOString(),
          tickers: current.tickers.map((ticker) => {
            if (ticker.symbol !== symbol) {
              return ticker;
            }

            const nextPoint = {
              time: new Date().toISOString(),
              value: lastPrice
            };

            return {
              ...ticker,
              status: "LIVE",
              updatedAt: nextPoint.time,
              lastPrice,
              changePct24h: changePct ?? ticker.changePct24h,
              series: [...ticker.series.slice(-39), nextPoint]
            };
          })
        }));
      } catch {}
    };

    websocket.onerror = () => {
      websocket.close();
    };

    return () => {
      websocket.close();
    };
  }, []);

  return (
    <div className="market-strip">
      {market.tickers.map((ticker) => (
        <LiveMiniChartCard key={ticker.symbol} ticker={ticker} />
      ))}
    </div>
  );
}
