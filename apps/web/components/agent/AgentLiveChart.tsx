"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";

import type { MarketOverviewResponse, MarketSymbol, MarketTickerView } from "@fomo/shared";

import { getMarketOverviewClient } from "../../lib/client-api";
import { getTickerLabel } from "../../lib/console-copy";
import { formatCompactNumber, formatTimeOnly } from "../../lib/format";

interface AgentLiveChartProps {
  initialMarket: MarketOverviewResponse;
  onSelectSymbol: (symbol: MarketSymbol) => void;
  selectedSymbol: MarketSymbol;
}

interface BinanceTickerStreamMessage {
  data?: {
    s?: string;
    c?: string;
    P?: string;
  };
}

const tickerOrder: MarketSymbol[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

function buildLinePath(series: MarketTickerView["series"], width: number, height: number) {
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

export function AgentLiveChart({ initialMarket, onSelectSymbol, selectedSymbol }: AgentLiveChartProps) {
  const [market, setMarket] = useState(initialMarket);
  const [streamStatus, setStreamStatus] = useState<"LIVE" | "DELAYED">(
    initialMarket.tickers.some((ticker) => ticker.status === "LIVE") ? "LIVE" : "DELAYED"
  );
  const [lastStreamAt, setLastStreamAt] = useState<number>(Date.now());
  const width = 960;
  const height = 220;

  useEffect(() => {
    let isMounted = true;

    async function refreshSnapshot() {
      try {
        const next = await getMarketOverviewClient();

        if (isMounted) {
          setMarket(next);
          setStreamStatus((current) => (current === "LIVE" ? current : "DELAYED"));
        }
      } catch {}
    }

    refreshSnapshot();

    const interval = window.setInterval(refreshSnapshot, 12_000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let websocket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let active = true;

    function connect() {
      if (!active) {
        return;
      }

      websocket = new WebSocket("wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker");

      websocket.onopen = () => {
        setStreamStatus("LIVE");
        setLastStreamAt(Date.now());
      };

      websocket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as BinanceTickerStreamMessage;
          const symbol = payload.data?.s as MarketSymbol | undefined;
          const lastPrice = payload.data?.c ? Number(payload.data.c) : null;
          const changePct = payload.data?.P ? Number(payload.data.P) : null;

          if (!symbol || lastPrice === null) {
            return;
          }

          const now = new Date().toISOString();
          setLastStreamAt(Date.now());
          setStreamStatus("LIVE");

          setMarket((current) => ({
            ...current,
            provider: "binance-websocket",
            updatedAt: now,
            tickers: current.tickers.map((ticker) => {
              if (ticker.symbol !== symbol) {
                return ticker;
              }

              const nextPoint = {
                time: now,
                value: lastPrice
              };

              return {
                ...ticker,
                status: "LIVE",
                updatedAt: nextPoint.time,
                lastPrice,
                changePct24h: changePct ?? ticker.changePct24h,
                series: [...ticker.series.slice(-79), nextPoint]
              };
            })
          }));
        } catch {}
      };

      websocket.onerror = () => {
        websocket?.close();
      };

      websocket.onclose = () => {
        if (!active) {
          return;
        }

        setStreamStatus("DELAYED");
        reconnectTimer = window.setTimeout(connect, 4_000);
      };
    }

    connect();

    return () => {
      active = false;

      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }

      websocket?.close();
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (Date.now() - lastStreamAt > 15_000) {
        setStreamStatus("DELAYED");
      }
    }, 5_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [lastStreamAt]);

  const activeTicker =
    market.tickers.find((ticker) => ticker.symbol === selectedSymbol) ??
    market.tickers.find((ticker) => ticker.symbol === "BTCUSDT") ??
    market.tickers[0];

  const linePath = useMemo(() => buildLinePath(activeTicker?.series ?? [], width, height - 16), [activeTicker?.series]);

  if (!activeTicker) {
    return null;
  }

  function buildTickerHref(symbol: MarketSymbol) {
    const search = new URLSearchParams({
      view: "agent",
      symbol
    });

    return `/?${search.toString()}`;
  }

  function handleTickerClick(event: MouseEvent<HTMLAnchorElement>, symbol: MarketSymbol) {
    event.preventDefault();
    onSelectSymbol(symbol);
  }

  return (
    <section className="agent-chart-panel">
      <div className="agent-chart-head">
        <div className="agent-chart-tabs" role="tablist" aria-label="라이브 티커 전환">
          {tickerOrder.map((symbol) => (
            <a
              aria-selected={selectedSymbol === symbol}
              className={`chart-tab-button ${selectedSymbol === symbol ? "active" : ""}`}
              href={buildTickerHref(symbol)}
              key={symbol}
              onClick={(event) => handleTickerClick(event, symbol)}
              role="tab"
            >
              {getTickerLabel(symbol)}
            </a>
          ))}
        </div>

        <div className="agent-chart-status">
          <span className="agent-chart-status-pill">{streamStatus}</span>
          <span className="agent-chart-status-text">업데이트 {formatTimeOnly(activeTicker.updatedAt)}</span>
        </div>
      </div>

      <div className="agent-chart-stage">
        <div aria-hidden="true" className="agent-chart-grid" />
        <svg aria-hidden="true" className="agent-chart-svg" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
          <line className="agent-chart-baseline" x1="0" x2={width} y1={height - 14} y2={height - 14} />
          <path className="agent-chart-line" d={linePath} />
        </svg>
      </div>

      <div className="agent-chart-footer">
        <div className="agent-chart-readout">
          <strong>{getTickerLabel(activeTicker.symbol)}</strong>
          <span>{formatCompactNumber(activeTicker.lastPrice)}</span>
        </div>
        <div className="agent-chart-meta">
          <span className={activeTicker.changePct24h >= 0 ? "value-positive" : "value-negative"}>
            {activeTicker.changePct24h >= 0 ? "+" : ""}
            {activeTicker.changePct24h.toFixed(2)}%
          </span>
          <span>{activeTicker.symbol}</span>
        </div>
      </div>
    </section>
  );
}
