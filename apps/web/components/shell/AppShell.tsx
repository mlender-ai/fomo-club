"use client";

import { startTransition, useEffect, useMemo, useState } from "react";

import type {
  DailyReportResponse,
  DashboardSummaryResponse,
  MarketSymbol,
  MarketOverviewResponse,
  PaperEventView,
  RuntimeStateResponse,
  SessionCompareResponse,
  StrategyControlResponse,
  WeeklyReportResponse
} from "@fomo/shared";

import {
  getDashboardSummaryClient,
  getRuntimeStateClient,
  getStrategyControlClient,
  toggleStrategyClient,
  updateExchangeSettingsClient,
  updateKillSwitchClient,
  updateRiskSettingsClient,
  updateStrategyExecutionClient
} from "../../lib/client-api";
import { buildAgentTrustMetrics } from "../../lib/console-copy";
import { AgentOverview } from "../agent/AgentOverview";
import { ReportsView } from "../reports/ReportsView";
import { SettingsView } from "../settings/SettingsView";
import { StrategiesView } from "../strategies/StrategiesView";
import { TradesView } from "../trades/TradesView";
import { ContentPanel } from "./ContentPanel";
import { type NavView, SidebarNav } from "./SidebarNav";
import { TopStatusBar } from "./TopStatusBar";

interface AppShellProps {
  dashboard: DashboardSummaryResponse;
  dailyReport: DailyReportResponse;
  initialSymbol: MarketSymbol;
  initialView: NavView;
  weeklyReport: WeeklyReportResponse;
  sessionCompare: SessionCompareResponse;
  runtime: RuntimeStateResponse;
  market: MarketOverviewResponse;
  paperLogs: PaperEventView[];
  strategyControl: StrategyControlResponse;
}

const viewCopy: Record<NavView, { title: string; subtitle: string }> = {
  agent: {
    title: "에이전트",
    subtitle: "실행 / 로그 / 흐름"
  },
  trades: {
    title: "거래",
    subtitle: "체결 / 손익 / 비용"
  },
  strategies: {
    title: "전략",
    subtitle: "선택 / 성과 / 세션"
  },
  reports: {
    title: "리포트",
    subtitle: "일간 / 주간 / 인사이트"
  },
  settings: {
    title: "설정",
    subtitle: "거래소 / 리스크 / 운영"
  }
};

export function AppShell({
  dashboard,
  dailyReport,
  initialSymbol,
  initialView,
  weeklyReport,
  sessionCompare,
  runtime,
  market,
  paperLogs,
  strategyControl
}: AppShellProps) {
  const [activeView, setActiveView] = useState<NavView>(initialView);
  const [selectedSymbol, setSelectedSymbol] = useState<MarketSymbol>(initialSymbol);
  const [dashboardState, setDashboardState] = useState(dashboard);
  const [runtimeState, setRuntimeState] = useState(runtime);
  const [strategyControlState, setStrategyControlState] = useState(strategyControl);
  const [isMutating, setIsMutating] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const copy = viewCopy[activeView];
  const trustMetrics = useMemo(() => buildAgentTrustMetrics(dashboardState, dailyReport, weeklyReport), [dailyReport, dashboardState, weeklyReport]);
  const currentStrategy =
    strategyControlState.strategies.find((strategy) => strategy.id === strategyControlState.execution.primaryStrategyId) ??
    strategyControlState.strategies[0] ??
    null;

  function buildWorkspaceHref(view: NavView, symbol: MarketSymbol) {
    const search = new URLSearchParams({
      view,
      symbol
    });

    return `/?${search.toString()}`;
  }

  function updateWorkspaceUrl(view: NavView, symbol: MarketSymbol, mode: "push" | "replace" = "push") {
    if (typeof window === "undefined") {
      return;
    }

    const nextUrl = buildWorkspaceHref(view, symbol);
    const method = mode === "replace" ? "replaceState" : "pushState";
    window.history[method](null, "", nextUrl);
  }

  async function refreshOperationalState() {
    const [nextDashboard, nextRuntime, nextStrategyControl] = await Promise.all([
      getDashboardSummaryClient(),
      getRuntimeStateClient(),
      getStrategyControlClient()
    ]);

    startTransition(() => {
      setDashboardState(nextDashboard);
      setRuntimeState(nextRuntime);
      setStrategyControlState(nextStrategyControl);
    });
  }

  async function runMutation(action: () => Promise<void>) {
    try {
      setIsMutating(true);
      await action();
      await refreshOperationalState();
    } finally {
      setIsMutating(false);
    }
  }

  function handleChangeView(view: NavView) {
    setActiveView(view);
    setIsSidebarOpen(false);
    updateWorkspaceUrl(view, selectedSymbol);
  }

  function handleChangeSymbol(symbol: MarketSymbol) {
    setSelectedSymbol(symbol);

    if (activeView !== "agent") {
      setActiveView("agent");
    }

    updateWorkspaceUrl("agent", symbol);
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }

      void refreshOperationalState().catch(() => {});
    }, 20_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function handlePopState() {
      const search = new URLSearchParams(window.location.search);
      const nextView = search.get("view");
      const nextSymbol = search.get("symbol");

      if (nextView === "agent" || nextView === "trades" || nextView === "strategies" || nextView === "reports" || nextView === "settings") {
        setActiveView(nextView);
      }

      if (nextSymbol === "BTCUSDT" || nextSymbol === "ETHUSDT" || nextSymbol === "SOLUSDT") {
        setSelectedSymbol(nextSymbol);
      }
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return (
    <main className="app-shell">
      <button
        aria-hidden={!isSidebarOpen}
        className={`shell-backdrop ${isSidebarOpen ? "open" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
        tabIndex={isSidebarOpen ? 0 : -1}
        type="button"
      />
      <SidebarNav
        activeView={activeView}
        buildHref={buildWorkspaceHref}
        currentSymbol={selectedSymbol}
        isMutating={isMutating}
        isOpen={isSidebarOpen}
        onChange={handleChangeView}
        onClose={() => setIsSidebarOpen(false)}
        onKillSwitch={async (mode) =>
          runMutation(async () => {
            await updateKillSwitchClient({
              enabled: !runtimeState.killSwitch.enabled,
              mode,
              reason: runtimeState.killSwitch.enabled ? "사용자 해제" : "사용자 중단 요청"
            });
          })
        }
        onSetPrimary={async (strategyId) =>
          runMutation(async () => {
            const activeIds = strategyControlState.execution.allowMultiStrategy
              ? Array.from(new Set([...strategyControlState.execution.activeStrategyIds, strategyId]))
              : [strategyId];

            await updateStrategyExecutionClient({
              allowMultiStrategy: strategyControlState.execution.allowMultiStrategy,
              activeStrategyIds: activeIds,
              primaryStrategyId: strategyId
            });
          })
        }
        onToggleMulti={async () =>
          runMutation(async () => {
            const allowMultiStrategy = !strategyControlState.execution.allowMultiStrategy;
            const activeStrategyIds = allowMultiStrategy
              ? strategyControlState.execution.activeStrategyIds
              : strategyControlState.execution.primaryStrategyId
                ? [strategyControlState.execution.primaryStrategyId]
                : strategyControlState.execution.activeStrategyIds.slice(0, 1);

            await updateStrategyExecutionClient({
              allowMultiStrategy,
              activeStrategyIds,
              primaryStrategyId: strategyControlState.execution.primaryStrategyId
            });
          })
        }
        onToggleStrategy={async (strategyId) =>
          runMutation(async () => {
            await toggleStrategyClient(strategyId);
          })
        }
        runtime={runtimeState}
        strategyControl={strategyControlState}
        trustMetrics={trustMetrics}
      />

      <div className="app-main">
        <TopStatusBar
          currentStrategy={currentStrategy}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          runtime={runtimeState}
          subtitle={copy.subtitle}
          title={copy.title}
        />

        <ContentPanel>
          {activeView === "agent" ? (
            <AgentOverview
              dailyReport={dailyReport}
              dashboard={dashboardState}
              initialPaperLogs={paperLogs}
              market={market}
              onSelectSymbol={handleChangeSymbol}
              runtime={runtimeState}
              selectedSymbol={selectedSymbol}
            />
          ) : null}
          {activeView === "trades" ? <TradesView dashboard={dashboardState} /> : null}
          {activeView === "strategies" ? (
            <StrategiesView
              dashboard={dashboardState}
              isMutating={isMutating}
              onSetPrimary={async (strategyId) =>
                runMutation(async () => {
                  const activeIds = strategyControlState.execution.allowMultiStrategy
                    ? Array.from(new Set([...strategyControlState.execution.activeStrategyIds, strategyId]))
                    : [strategyId];

                  await updateStrategyExecutionClient({
                    allowMultiStrategy: strategyControlState.execution.allowMultiStrategy,
                    activeStrategyIds: activeIds,
                    primaryStrategyId: strategyId
                  });
                })
              }
              onToggleStrategy={async (strategyId) =>
                runMutation(async () => {
                  await toggleStrategyClient(strategyId);
                })
              }
              runtime={runtimeState}
              sessionCompare={sessionCompare}
              strategyControl={strategyControlState}
            />
          ) : null}
          {activeView === "reports" ? (
            <ReportsView dailyReport={dailyReport} sessionCompare={sessionCompare} weeklyReport={weeklyReport} />
          ) : null}
          {activeView === "settings" ? (
            <SettingsView
              isMutating={isMutating}
              onSaveExchange={async (payload) =>
                runMutation(async () => {
                  await updateExchangeSettingsClient(payload);
                })
              }
              onSaveRisk={async (payload) =>
                runMutation(async () => {
                  await updateRiskSettingsClient(payload);
                })
              }
              onToggleKillSwitch={async (payload) =>
                runMutation(async () => {
                  await updateKillSwitchClient(payload);
                })
              }
              runtime={runtimeState}
            />
          ) : null}
        </ContentPanel>
      </div>
    </main>
  );
}
