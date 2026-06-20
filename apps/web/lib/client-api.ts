import type { DashboardSummaryResponse, MarketOverviewResponse, PaperEventView, RuntimeStateResponse, StrategyControlResponse } from "@fomo/shared";

async function browserFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`Client request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getRuntimeStateClient() {
  return browserFetch<RuntimeStateResponse>("/api/runtime/state");
}

export function getDashboardSummaryClient() {
  return browserFetch<DashboardSummaryResponse>("/api/dashboard/summary");
}

export function getMarketOverviewClient() {
  return browserFetch<MarketOverviewResponse>("/api/market/overview");
}

export function getPaperLogsClient(limit = 60) {
  return browserFetch<PaperEventView[]>(`/api/paper/logs?limit=${limit}`);
}

export function getStrategyControlClient(params?: { period?: "today" | "7d" | "all"; sortBy?: "profit" | "winRate" }) {
  const search = new URLSearchParams();

  if (params?.period) {
    search.set("period", params.period);
  }

  if (params?.sortBy) {
    search.set("sortBy", params.sortBy);
  }

  const suffix = search.toString();
  return browserFetch<StrategyControlResponse>(`/api/strategies/control${suffix ? `?${suffix}` : ""}`);
}

export function toggleStrategyClient(strategyId: string) {
  return browserFetch<StrategyControlResponse>(`/api/strategies/${strategyId}/toggle`, {
    method: "PATCH"
  });
}

export function updateStrategyExecutionClient(payload: {
  allowMultiStrategy?: boolean;
  activeStrategyIds?: string[];
  primaryStrategyId?: string | null;
}) {
  return browserFetch<StrategyControlResponse>("/api/strategies/execution", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function updateExchangeSettingsClient(payload: {
  exchange?: "BINANCE" | "BYBIT";
  mode?: "paper" | "real";
  sandbox?: boolean;
  apiKey?: string;
  apiSecret?: string;
}) {
  return browserFetch<RuntimeStateResponse>("/api/exchange/settings", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function updateRiskSettingsClient(payload: Partial<RuntimeStateResponse["risk"]>) {
  return browserFetch<RuntimeStateResponse>("/api/risk/settings", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function updateKillSwitchClient(payload: {
  enabled: boolean;
  mode: "PAUSE_ONLY" | "CLOSE_POSITIONS";
  reason?: string | null;
}) {
  return browserFetch<RuntimeStateResponse>("/api/control/kill-switch", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}
