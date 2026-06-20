import type {
  AgentAction,
  BotMode,
  ConnectionState,
  ExchangeProvider,
  KillSwitchMode,
  NotificationDeliveryStatus,
  PaperEventType,
  StrategyCode
} from "@fomo/shared";

export interface RuntimeMetadataShape {
  initialCapital?: number;
  exchange?: {
    exchange?: ExchangeProvider;
    mode?: BotMode;
    sandbox?: boolean;
    encryptedApiKey?: string | null;
    encryptedApiSecret?: string | null;
    apiKeyPreview?: string | null;
    updatedAt?: string | null;
  };
  risk?: {
    maxDailyLossUsd?: number;
    maxDailyLossPct?: number;
    maxConsecutiveLosses?: number;
    cooldownMinutes?: number;
    autoPauseEnabled?: boolean;
    isTriggered?: boolean;
    triggerReason?: string | null;
  };
  killSwitch?: {
    enabled?: boolean;
    mode?: KillSwitchMode;
    activatedAt?: string | null;
    reason?: string | null;
  };
  execution?: {
    allowMultiStrategy?: boolean;
    activeStrategyIds?: string[];
    primaryStrategyId?: string | null;
    runningStrategyIds?: string[];
  };
  system?: {
    marketDataStatus?: ConnectionState;
    currentAction?: AgentAction;
    lastMarketUpdateAt?: string | null;
    lastApiUpdateAt?: string | null;
    lastWorkerTickAt?: string | null;
    lastStrategyEvaluationAt?: string | null;
    lastEvaluationSymbol?: string | null;
    lastTradeExecutionAt?: string | null;
    lastTradeSymbol?: string | null;
    lastSessionId?: string | null;
    lastTelegramSentAt?: string | null;
    lastTelegramStatus?: NotificationDeliveryStatus | null;
    lastTelegramEventType?: PaperEventType | null;
    lastTelegramError?: string | null;
  };
  strategyCodes?: Record<string, StrategyCode>;
}

export interface NormalizedRuntimeMetadata {
  initialCapital: number;
  exchange: {
    exchange: ExchangeProvider;
    mode: BotMode;
    sandbox: boolean;
    encryptedApiKey: string | null;
    encryptedApiSecret: string | null;
    apiKeyPreview: string | null;
    updatedAt: string | null;
  };
  risk: {
    maxDailyLossUsd: number;
    maxDailyLossPct: number;
    maxConsecutiveLosses: number;
    cooldownMinutes: number;
    autoPauseEnabled: boolean;
    isTriggered: boolean;
    triggerReason: string | null;
  };
  killSwitch: {
    enabled: boolean;
    mode: KillSwitchMode;
    activatedAt: string | null;
    reason: string | null;
  };
  execution: {
    allowMultiStrategy: boolean;
    activeStrategyIds: string[];
    primaryStrategyId: string | null;
    runningStrategyIds: string[];
  };
  system: {
    marketDataStatus: ConnectionState;
    currentAction: AgentAction;
    lastMarketUpdateAt: string | null;
    lastApiUpdateAt: string | null;
    lastWorkerTickAt: string | null;
    lastStrategyEvaluationAt: string | null;
    lastEvaluationSymbol: string | null;
    lastTradeExecutionAt: string | null;
    lastTradeSymbol: string | null;
    lastSessionId: string | null;
    lastTelegramSentAt: string | null;
    lastTelegramStatus: NotificationDeliveryStatus | null;
    lastTelegramEventType: PaperEventType | null;
    lastTelegramError: string | null;
  };
  strategyCodes: Record<string, StrategyCode>;
}

export function normalizeRuntimeMetadata(raw: unknown): NormalizedRuntimeMetadata {
  const metadata = (raw as RuntimeMetadataShape | null) ?? {};

  return {
    initialCapital: metadata.initialCapital ?? 10000,
    exchange: {
      exchange: metadata.exchange?.exchange ?? "BINANCE",
      mode: metadata.exchange?.mode ?? "paper",
      sandbox: metadata.exchange?.sandbox ?? true,
      encryptedApiKey: metadata.exchange?.encryptedApiKey ?? null,
      encryptedApiSecret: metadata.exchange?.encryptedApiSecret ?? null,
      apiKeyPreview: metadata.exchange?.apiKeyPreview ?? null,
      updatedAt: metadata.exchange?.updatedAt ?? null
    },
    risk: {
      maxDailyLossUsd: metadata.risk?.maxDailyLossUsd ?? 150,
      maxDailyLossPct: metadata.risk?.maxDailyLossPct ?? 1.5,
      maxConsecutiveLosses: metadata.risk?.maxConsecutiveLosses ?? 3,
      cooldownMinutes: metadata.risk?.cooldownMinutes ?? 30,
      autoPauseEnabled: metadata.risk?.autoPauseEnabled ?? true,
      isTriggered: metadata.risk?.isTriggered ?? false,
      triggerReason: metadata.risk?.triggerReason ?? null
    },
    killSwitch: {
      enabled: metadata.killSwitch?.enabled ?? false,
      mode: metadata.killSwitch?.mode ?? "PAUSE_ONLY",
      activatedAt: metadata.killSwitch?.activatedAt ?? null,
      reason: metadata.killSwitch?.reason ?? null
    },
    execution: {
      allowMultiStrategy: metadata.execution?.allowMultiStrategy ?? false,
      activeStrategyIds: metadata.execution?.activeStrategyIds ?? [],
      primaryStrategyId: metadata.execution?.primaryStrategyId ?? null,
      runningStrategyIds: metadata.execution?.runningStrategyIds ?? []
    },
    system: {
      marketDataStatus: metadata.system?.marketDataStatus ?? "DEMO",
      currentAction: metadata.system?.currentAction ?? "WAIT_ENTRY",
      lastMarketUpdateAt: metadata.system?.lastMarketUpdateAt ?? null,
      lastApiUpdateAt: metadata.system?.lastApiUpdateAt ?? null,
      lastWorkerTickAt: metadata.system?.lastWorkerTickAt ?? null,
      lastStrategyEvaluationAt: metadata.system?.lastStrategyEvaluationAt ?? null,
      lastEvaluationSymbol: metadata.system?.lastEvaluationSymbol ?? null,
      lastTradeExecutionAt: metadata.system?.lastTradeExecutionAt ?? null,
      lastTradeSymbol: metadata.system?.lastTradeSymbol ?? null,
      lastSessionId: metadata.system?.lastSessionId ?? null,
      lastTelegramSentAt: metadata.system?.lastTelegramSentAt ?? null,
      lastTelegramStatus: metadata.system?.lastTelegramStatus ?? null,
      lastTelegramEventType: metadata.system?.lastTelegramEventType ?? null,
      lastTelegramError: metadata.system?.lastTelegramError ?? null
    },
    strategyCodes: metadata.strategyCodes ?? {}
  };
}
