import type {
  ExchangeProvider,
  KillSwitchMode,
  MarketOverviewResponse,
  PeriodFilter,
  StrategySortKey,
  RuntimeStateResponse,
  StrategyControlResponse
} from "@fomo/shared";

import {
  demoDashboardSummary as demoDashboardSummaryTemplate,
  demoDailyReport,
  demoMarketOverview as demoMarketOverviewTemplate,
  demoRuntimeState as demoRuntimeStateTemplate,
  demoSessionCompareReport,
  demoStrategyControl as demoStrategyControlTemplate,
  demoWeeklyReport
} from "./dashboardSummary.js";
import { deriveSystemStatus } from "../domain/runtime/systemStatus.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

let dashboard = clone(demoDashboardSummaryTemplate);
let runtime = clone(demoRuntimeStateTemplate);
let strategyControl = clone(demoStrategyControlTemplate);
let marketOverview = clone(demoMarketOverviewTemplate);

function syncStrategyCollections() {
  dashboard.strategies = clone(strategyControl.strategies);
  dashboard.strategyPerformanceByPeriod = clone(strategyControl.performanceByPeriod);
  runtime.execution = clone(strategyControl.execution);
}

function sortRows(rows: StrategyControlResponse["performanceByPeriod"]["today"], sortBy: StrategySortKey) {
  return [...rows].sort((left, right) => {
    if (sortBy === "winRate") {
      return right.winRate - left.winRate || right.netPnl - left.netPnl;
    }

    return right.netPnl - left.netPnl || right.winRate - left.winRate;
  });
}

function deriveDemoSystem() {
  const activeStrategyCount = strategyControl.execution.activeStrategyIds.length;
  const openPositionCount = dashboard.openPositions.length;
  const system = deriveSystemStatus({
    botStatus: runtime.system.botStatus,
    lastHeartbeatAt: runtime.system.lastHeartbeatAt,
    lastErrorAt: runtime.system.lastErrorAt,
    lastMarketUpdateAt: marketOverview.updatedAt,
    workerIntervalMs: 30_000,
    activeStrategyCount,
    openPositionCount,
    killSwitchEnabled: runtime.killSwitch.enabled,
    killSwitchMode: runtime.killSwitch.mode,
    riskTriggered: runtime.risk.isTriggered,
    fallbackMarketStatus: "DEMO"
  });

  runtime.system = system;
  dashboard.system = system;
}

function touchRuntime() {
  const now = new Date().toISOString();
  runtime.system.lastApiUpdateAt = now;
  dashboard.system.lastApiUpdateAt = now;
}

export function getDemoDashboardSummary() {
  syncStrategyCollections();
  deriveDemoSystem();
  return clone(dashboard);
}

export function getDemoDailyReport() {
  return clone(demoDailyReport);
}

export function getDemoWeeklyReport() {
  return clone(demoWeeklyReport);
}

export function getDemoSessionCompareReport() {
  return clone(demoSessionCompareReport);
}

export function getDemoRuntimeState() {
  syncStrategyCollections();
  deriveDemoSystem();
  return clone(runtime);
}

export function getDemoStrategyControl(period?: PeriodFilter, sortBy?: StrategySortKey) {
  if (period) {
    strategyControl.period = period;
  }

  if (sortBy) {
    strategyControl.sortBy = sortBy;
  }

  strategyControl.performanceByPeriod = {
    today: sortRows(strategyControl.performanceByPeriod.today, strategyControl.sortBy),
    "7d": sortRows(strategyControl.performanceByPeriod["7d"], strategyControl.sortBy),
    all: sortRows(strategyControl.performanceByPeriod.all, strategyControl.sortBy)
  };

  syncStrategyCollections();
  return clone(strategyControl);
}

export function getDemoMarketOverview() {
  return clone(marketOverview);
}

export function updateDemoStrategyToggle(strategyId: string) {
  strategyControl.strategies = strategyControl.strategies.map((strategy) => {
    if (strategy.id !== strategyId) {
      return strategy;
    }

    const nextStatus = strategy.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    return {
      ...strategy,
      status: nextStatus,
      isEnabled: nextStatus === "ACTIVE",
      lastEvaluatedAt: new Date().toISOString()
    };
  });

  touchRuntime();
  syncStrategyCollections();
  return getDemoStrategyControl(strategyControl.period, strategyControl.sortBy);
}

export function updateDemoStrategyExecution(input: {
  allowMultiStrategy?: boolean;
  activeStrategyIds?: string[];
  primaryStrategyId?: string | null;
}) {
  strategyControl.execution = {
    allowMultiStrategy: input.allowMultiStrategy ?? strategyControl.execution.allowMultiStrategy,
    activeStrategyIds: input.activeStrategyIds ?? strategyControl.execution.activeStrategyIds,
    primaryStrategyId: input.primaryStrategyId ?? strategyControl.execution.primaryStrategyId,
    runningStrategyIds: input.activeStrategyIds ?? strategyControl.execution.runningStrategyIds
  };

  strategyControl.strategies = strategyControl.strategies.map((strategy) => ({
    ...strategy,
    isPrimary: strategy.id === strategyControl.execution.primaryStrategyId,
    isEnabled: strategyControl.execution.activeStrategyIds.includes(strategy.id)
  }));

  touchRuntime();
  syncStrategyCollections();
  return getDemoStrategyControl(strategyControl.period, strategyControl.sortBy);
}

export function updateDemoExchangeSettings(input: {
  exchange?: ExchangeProvider;
  mode?: "paper" | "real";
  sandbox?: boolean;
  apiKey?: string;
  apiSecret?: string;
}) {
  runtime.exchange = {
    ...runtime.exchange,
    exchange: input.exchange ?? runtime.exchange.exchange,
    mode: input.mode ?? runtime.exchange.mode,
    sandbox: input.sandbox ?? runtime.exchange.sandbox,
    hasApiKey: input.apiKey ? true : runtime.exchange.hasApiKey,
    hasApiSecret: input.apiSecret ? true : runtime.exchange.hasApiSecret,
    apiKeyPreview: input.apiKey ? `${input.apiKey.slice(0, 4)}_********_${input.apiKey.slice(-4)}` : runtime.exchange.apiKeyPreview,
    updatedAt: new Date().toISOString()
  };

  touchRuntime();
  return getDemoRuntimeState();
}

export function updateDemoRiskSettings(input: Partial<RuntimeStateResponse["risk"]>) {
  runtime.risk = {
    ...runtime.risk,
    ...input
  };

  touchRuntime();
  return getDemoRuntimeState();
}

export function updateDemoKillSwitch(input: { enabled: boolean; mode: KillSwitchMode; reason?: string | null }) {
  runtime.killSwitch = {
    enabled: input.enabled,
    mode: input.mode,
    reason: input.reason ?? null,
    activatedAt: input.enabled ? new Date().toISOString() : null
  };

  touchRuntime();
  syncStrategyCollections();
  return getDemoRuntimeState();
}

export function updateDemoMarketOverview(next: MarketOverviewResponse) {
  marketOverview = clone(next);
  runtime.system.lastMarketUpdateAt = next.updatedAt;
  dashboard.system.lastMarketUpdateAt = next.updatedAt;
}
