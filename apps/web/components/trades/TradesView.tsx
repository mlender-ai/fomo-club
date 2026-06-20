"use client";

import { useState } from "react";

import type { DashboardSummaryResponse } from "@fomo/shared";

import { TradeDetail } from "./TradeDetail";
import { TradeList } from "./TradeList";

interface TradesViewProps {
  dashboard: DashboardSummaryResponse;
}

export function TradesView({ dashboard }: TradesViewProps) {
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(dashboard.recentTrades[0]?.id ?? null);
  const selectedTrade = dashboard.recentTrades.find((trade) => trade.id === selectedTradeId) ?? dashboard.recentTrades[0] ?? null;

  return (
    <div className="panel-scroll">
      <div className="detail-layout">
        <TradeList onSelect={setSelectedTradeId} selectedTradeId={selectedTradeId} trades={dashboard.recentTrades} />
        <TradeDetail trade={selectedTrade} />
      </div>
    </div>
  );
}
