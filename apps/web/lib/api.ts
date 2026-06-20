import {
  emptyDailyReport,
  emptyDashboardSummary,
  emptyMarketOverview,
  emptyRuntimeState,
  emptySessionCompareReport,
  emptyStrategyControl,
  emptyWeeklyReport,
  type DailyReportResponse,
  type DashboardSummaryResponse,
  type MarketOverviewResponse,
  type PaperEventView,
  type RuntimeStateResponse,
  type SessionCompareResponse,
  type StrategyControlResponse,
  type WeeklyReportResponse
} from "@fomo/shared";

import { backendApiFetch } from "./backend-api";

export async function getDashboardSummary(): Promise<DashboardSummaryResponse> {
  try {
    return await backendApiFetch<DashboardSummaryResponse>("/dashboard/summary");
  } catch {
    return emptyDashboardSummary;
  }
}

export async function getDailyReport(): Promise<DailyReportResponse> {
  try {
    return await backendApiFetch<DailyReportResponse>("/reports/daily");
  } catch {
    return emptyDailyReport;
  }
}

export async function getWeeklyReport(): Promise<WeeklyReportResponse> {
  try {
    return await backendApiFetch<WeeklyReportResponse>("/reports/weekly");
  } catch {
    return emptyWeeklyReport;
  }
}

export async function getSessionCompareReport(): Promise<SessionCompareResponse> {
  try {
    return await backendApiFetch<SessionCompareResponse>("/reports/session-compare");
  } catch {
    return emptySessionCompareReport;
  }
}

export async function getRuntimeState(): Promise<RuntimeStateResponse> {
  try {
    return await backendApiFetch<RuntimeStateResponse>("/runtime/state");
  } catch {
    return emptyRuntimeState;
  }
}

export async function getMarketOverview(): Promise<MarketOverviewResponse> {
  try {
    return await backendApiFetch<MarketOverviewResponse>("/market/overview");
  } catch {
    return emptyMarketOverview;
  }
}

export async function getStrategyControl(): Promise<StrategyControlResponse> {
  try {
    return await backendApiFetch<StrategyControlResponse>("/strategies/control");
  } catch {
    return emptyStrategyControl;
  }
}

export async function getPaperLogs(limit = 60): Promise<PaperEventView[]> {
  try {
    return await backendApiFetch<PaperEventView[]>(`/paper/logs?limit=${limit}`);
  } catch {
    return [];
  }
}
