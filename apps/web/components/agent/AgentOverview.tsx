"use client";

import { useEffect, useMemo, useState } from "react";

import type { DailyReportResponse, DashboardSummaryResponse, MarketOverviewResponse, MarketSymbol, PaperEventView, RuntimeStateResponse } from "@fomo/shared";

import { buildAgentLogRows, buildAgentLogRowsFromPaperEvents, buildAgentRiskSnapshot, buildAgentSuggestionItems, getActionStatusLabel } from "../../lib/console-copy";
import { getPaperLogsClient } from "../../lib/client-api";
import { formatCurrency, formatPercent, formatSignedCurrency } from "../../lib/format";
import { AgentLiveChart } from "./AgentLiveChart";
import { AgentLogPanel } from "./AgentLogPanel";
import { AgentRiskStrip } from "./AgentRiskStrip";
import { AgentSuggestionBubble } from "./AgentSuggestionBubble";

interface AgentOverviewProps {
  dashboard: DashboardSummaryResponse;
  dailyReport: DailyReportResponse;
  initialPaperLogs: PaperEventView[];
  market: MarketOverviewResponse;
  onSelectSymbol: (symbol: MarketSymbol) => void;
  runtime: RuntimeStateResponse;
  selectedSymbol: MarketSymbol;
}

export function AgentOverview({ dashboard, dailyReport, initialPaperLogs, market, onSelectSymbol, runtime, selectedSymbol }: AgentOverviewProps) {
  const position = dashboard.openPositions[0] ?? null;
  const [paperLogs, setPaperLogs] = useState<PaperEventView[]>(initialPaperLogs);
  const fallbackRows = useMemo(() => buildAgentLogRows(position, dashboard.recentTrades, dashboard.recentLogs), [dashboard.recentLogs, dashboard.recentTrades, position]);
  const logRows = useMemo(
    () => (paperLogs.length > 0 ? buildAgentLogRowsFromPaperEvents(paperLogs) : fallbackRows),
    [fallbackRows, paperLogs]
  );
  const riskSnapshot = useMemo(() => buildAgentRiskSnapshot(position, dashboard.recentTrades), [dashboard.recentTrades, position]);
  const suggestions = useMemo(() => buildAgentSuggestionItems(dailyReport), [dailyReport]);

  useEffect(() => {
    setPaperLogs(initialPaperLogs);
  }, [initialPaperLogs]);

  useEffect(() => {
    let cancelled = false;

    async function refreshLogs() {
      try {
        const nextLogs = await getPaperLogsClient(60);

        if (!cancelled) {
          setPaperLogs(nextLogs);
        }
      } catch {
        if (!cancelled) {
          setPaperLogs((current) => current);
        }
      }
    }

    void refreshLogs();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }

      void refreshLogs();
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="panel-scroll">
      <div className="agent-console-screen">
        <div className="agent-console-inner">
          <AgentLiveChart initialMarket={market} onSelectSymbol={onSelectSymbol} selectedSymbol={selectedSymbol} />

          <div className="agent-command-line" role="status">
            <span>오늘 {dashboard.summary.todayTradeCount}회 체결</span>
            <span className="agent-command-separator">·</span>
            <span>승률 {formatPercent(dashboard.summary.winRate)}</span>
            <span className="agent-command-separator">·</span>
            <span>수수료 {formatCurrency(dashboard.summary.todayFees)}</span>
            <span className="agent-command-separator">·</span>
            <span className={dashboard.summary.todayNetPnl >= 0 ? "value-positive" : "value-negative"}>
              순손익 {formatSignedCurrency(dashboard.summary.todayNetPnl)}
            </span>
            <span className="agent-command-separator">·</span>
            <span>행동 {getActionStatusLabel(runtime.system.currentAction)}</span>
          </div>

          <AgentRiskStrip risk={riskSnapshot} />

          <div className="agent-console-main">
            <AgentLogPanel rows={logRows} />
            <AgentSuggestionBubble suggestions={suggestions} />
          </div>
        </div>
      </div>
    </div>
  );
}
