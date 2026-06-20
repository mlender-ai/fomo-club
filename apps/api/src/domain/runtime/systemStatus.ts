import type { BotStatus, ConnectionState, KillSwitchMode, SystemStatusView } from "@fomo/shared";

interface DeriveSystemStatusInput {
  botStatus: BotStatus | "UNKNOWN";
  now?: Date;
  lastHeartbeatAt: Date | string | null;
  lastErrorAt: Date | string | null;
  lastMarketUpdateAt: Date | string | null;
  workerIntervalMs: number;
  activeStrategyCount: number;
  openPositionCount: number;
  killSwitchEnabled: boolean;
  killSwitchMode: KillSwitchMode;
  riskTriggered: boolean;
  fallbackMarketStatus?: ConnectionState;
}

function toTimestamp(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).getTime();
}

function deriveWorkerStatus(botStatus: BotStatus | "UNKNOWN", heartbeatAgeMs: number | null, workerIntervalMs: number): ConnectionState {
  if (botStatus === "STOPPED") {
    return "OFFLINE";
  }

  if (heartbeatAgeMs === null) {
    return "OFFLINE";
  }

  if (heartbeatAgeMs <= workerIntervalMs * 2.5) {
    return "LIVE";
  }

  if (heartbeatAgeMs <= workerIntervalMs * 6) {
    return "DELAYED";
  }

  return "OFFLINE";
}

function deriveMarketStatus(
  marketAgeMs: number | null,
  workerIntervalMs: number,
  fallbackMarketStatus?: ConnectionState
): ConnectionState {
  if (fallbackMarketStatus === "DEMO") {
    return "DEMO";
  }

  if (marketAgeMs === null) {
    return fallbackMarketStatus ?? "OFFLINE";
  }

  if (marketAgeMs <= workerIntervalMs * 2.5) {
    return "LIVE";
  }

  if (marketAgeMs <= workerIntervalMs * 6) {
    return "DELAYED";
  }

  return fallbackMarketStatus ?? "OFFLINE";
}

export function deriveSystemStatus(input: DeriveSystemStatusInput): SystemStatusView {
  const now = input.now ?? new Date();
  const heartbeatAtMs = toTimestamp(input.lastHeartbeatAt);
  const marketUpdatedAtMs = toTimestamp(input.lastMarketUpdateAt);
  const heartbeatAgeMs = heartbeatAtMs === null ? null : now.getTime() - heartbeatAtMs;
  const marketAgeMs = marketUpdatedAtMs === null ? null : now.getTime() - marketUpdatedAtMs;
  const workerStatus = deriveWorkerStatus(input.botStatus, heartbeatAgeMs, input.workerIntervalMs);
  const marketDataStatus = deriveMarketStatus(marketAgeMs, input.workerIntervalMs, input.fallbackMarketStatus);
  const workerHealthy = workerStatus === "LIVE";

  let currentAction: SystemStatusView["currentAction"] = "BLOCKED";

  if (input.killSwitchEnabled && input.killSwitchMode === "CLOSE_POSITIONS" && input.openPositionCount > 0) {
    currentAction = "EXITING";
  } else if (input.killSwitchEnabled || input.riskTriggered || input.botStatus === "STOPPED") {
    currentAction = "BLOCKED";
  } else if (input.openPositionCount > 0) {
    currentAction = "HOLD";
  } else if (input.activeStrategyCount > 0 && workerStatus !== "OFFLINE") {
    currentAction = "WAIT_ENTRY";
  }

  return {
    botStatus: input.botStatus,
    workerHealthy,
    apiHealthy: true,
    workerStatus,
    apiStatus: "LIVE",
    marketDataStatus,
    lastHeartbeatAt: input.lastHeartbeatAt ? new Date(input.lastHeartbeatAt).toISOString() : null,
    lastErrorAt: input.lastErrorAt ? new Date(input.lastErrorAt).toISOString() : null,
    lastMarketUpdateAt: input.lastMarketUpdateAt ? new Date(input.lastMarketUpdateAt).toISOString() : null,
    lastApiUpdateAt: now.toISOString(),
    currentAction
  };
}
