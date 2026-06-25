export * from "./ai-client.js";

export type BotMode = "paper" | "real";
export type BotStatus = "RUNNING" | "STOPPED" | "DEGRADED";
export type StrategyStatus = "ACTIVE" | "PAUSED" | "DISABLED";
export type StrategySessionStatus = "ACTIVE" | "ARCHIVED";
export type PositionStatus = "OPEN" | "CLOSED";
export type PositionSide = "LONG" | "SHORT";
export type StrategySignalType = "ENTER" | "EXIT" | "HOLD";
export type OrderRole = "MAKER" | "TAKER";
export type OrderAction = "BUY" | "SELL" | "CLOSE" | "STOP_LOSS" | "TAKE_PROFIT";
export type AlertType = "ENTRY" | "EXIT" | "STOP_LOSS" | "TAKE_PROFIT" | "ERROR" | "INFO" | "RESTART";
export type StrategyKey = "bb-mean-reversion";
export type StrategyCode = "A" | "B" | "C";
export type PeriodFilter = "today" | "7d" | "all";
export type StrategySortKey = "profit" | "winRate";
export type ExchangeProvider = "BINANCE" | "BYBIT";
export type ConnectionState = "LIVE" | "DEMO" | "DELAYED" | "OFFLINE";
export type KillSwitchMode = "PAUSE_ONLY" | "CLOSE_POSITIONS";
export type AgentAction = "HOLD" | "WAIT_ENTRY" | "BLOCKED" | "EXITING";
export type MarketSymbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
export type PaperEventType =
  | "WORKER_TICK"
  | "MARKET_DATA_UPDATED"
  | "STRATEGY_EVALUATED"
  | "SIGNAL_GENERATED"
  | "ENTRY_PLACED"
  | "EXIT_TAKE_PROFIT"
  | "EXIT_STOP_LOSS"
  | "TRADE_SKIPPED"
  | "COOLDOWN_TRIGGERED"
  | "ERROR";
export type NotificationDeliveryStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

export interface CandleDto {
  symbol: string;
  timeframe: string;
  openTime: string;
  closeTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SignalReason {
  code: string;
  message: string;
  meta: Record<string, number | string | boolean | null>;
}

export interface IndicatorSnapshot {
  close: number;
  rsi: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  bandWidthPct: number | null;
}

export interface StrategySignal {
  type: StrategySignalType;
  action: OrderAction;
  symbol: string;
  price: number;
  timestamp: string;
  indicators: IndicatorSnapshot;
  reasons: SignalReason[];
  reasonText: string;
  reasonMeta: Record<string, unknown>;
}

export interface BaseStrategyConfig {
  key: StrategyKey;
  symbol: string;
  timeframe: string;
  candleLimit: number;
  allocationPct: number;
  cooldownAfterLosses: number;
  cooldownMinutes: number;
}

export interface BbMeanReversionConfig extends BaseStrategyConfig {
  key: "bb-mean-reversion";
  bbPeriod: number;
  bbStdDev: number;
  rsiPeriod: number;
  entryRsiFloor: number;
  exitRsiCeiling: number;
  expectedProfitMultiple: number;
  minVolatilityPct: number;
}

export type StrategyConfig = BbMeanReversionConfig;

export interface FeeModelView {
  makerFeeRate: number;
  takerFeeRate: number;
  entryOrderRole: OrderRole;
  exitOrderRole: OrderRole;
  slippageBps: number;
  estimatedRoundTripCostPct: number;
}

export interface DashboardMetrics {
  todayNetPnl: number;
  totalNetPnl: number;
  todayFees: number;
  totalFees: number;
  winRate: number;
  todayTradeCount: number;
  openPositionCount: number;
  cashBalance: number;
  totalEquity: number;
}

export interface AccountOverviewView {
  initialCapital: number;
  cashBalance: number;
  equity: number;
  totalPnlUsd: number;
  totalPnlPct: number;
  todayPnlUsd: number;
  todayPnlPct: number;
  reservedBalance: number;
}

export interface TradeView {
  id: string;
  symbol: string;
  action: OrderAction;
  price: number;
  quantity: number;
  grossPnl: number;
  realizedPnl: number;
  fee: number;
  feeRate: number;
  orderRole: OrderRole;
  slippageBps: number;
  reasonCode: string;
  reasonText: string;
  reasonMeta: Record<string, unknown>;
  strategyId?: string | null;
  strategyCode?: StrategyCode | null;
  strategyName?: string | null;
  sessionName: string | null;
  executedAt: string;
}

export interface PositionView {
  id: string;
  symbol: string;
  side: PositionSide;
  status: PositionStatus;
  quantity: number;
  entryPrice: number;
  currentPrice: number | null;
  realizedPnl: number;
  unrealizedPnl: number;
  feesPaid: number;
  openedAt: string;
  closedAt: string | null;
  entryReasonCode: string;
  entryReasonText: string;
  exitReasonCode: string | null;
  exitReasonText: string | null;
  strategyId?: string | null;
  strategyCode?: StrategyCode | null;
  strategyName?: string | null;
  sessionName: string | null;
}

export interface StrategyView {
  id: string;
  code: StrategyCode;
  key: StrategyKey;
  name: string;
  description: string;
  symbol: string;
  timeframe: string;
  status: StrategyStatus;
  isPrimary: boolean;
  isEnabled: boolean;
  allocationPct: number;
  lastEvaluatedAt: string | null;
  config: StrategyConfig;
}

export interface PerformanceBreakdownView {
  key: string;
  label: string;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  netPnl: number;
  totalFees: number;
  grossProfit: number;
  grossLoss: number;
  avgNetPnl: number;
  expectancy: number;
}

export interface StrategyPerformanceRow {
  strategyId: string;
  code: StrategyCode;
  name: string;
  key: StrategyKey;
  status: StrategyStatus;
  netPnl: number;
  pnlPct: number;
  winRate: number;
  tradeCount: number;
  totalFees: number;
  expectancy: number;
  equity: number;
  lastEvaluatedAt: string | null;
}

export interface ReportMetricsView {
  tradeCount: number;
  closedPositionCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  grossPnl: number;
  netPnl: number;
  totalFees: number;
  totalWinningPnl: number;
  totalLosingPnl: number;
  avgNetPnlPerTrade: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  expectancy: number;
}

export interface DailySeriesPoint {
  date: string;
  tradeCount: number;
  netPnl: number;
  totalFees: number;
  winRate: number;
}

export interface ReportInsightView {
  title: string;
  detail: string;
  tone: "positive" | "negative" | "neutral";
}

export interface ReportRecommendationView {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
}

export interface ReportDriverView {
  key: string;
  label: string;
  category: "entry" | "exit" | "strategy";
  netPnl: number;
  tradeCount: number;
  detail: string;
}

export interface StrategyInsightView {
  key: string;
  label: string;
  detail: string;
  netPnl: number;
  winRate: number;
  tradeCount: number;
}

export interface AiReportPayload {
  provider: string;
  generatedAt: string;
  summary: {
    headline: string;
    body: string;
  };
  insights: ReportInsightView[];
  recommendations: ReportRecommendationView[];
  profitDrivers: ReportDriverView[];
  lossDrivers: ReportDriverView[];
  strategyInsights: StrategyInsightView[];
}

export interface StrategySessionView {
  id: string;
  name: string;
  runLabel: string;
  status: StrategySessionStatus;
  startedAt: string;
  endedAt: string | null;
  netPnl: number;
  totalFees: number;
  tradeCount: number;
  isCurrent: boolean;
}

export interface LogView {
  id: string;
  level: "INFO" | "WARN" | "ERROR";
  source: string;
  message: string;
  context: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaperEventView {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  source: string;
  eventType: PaperEventType;
  symbol: string | null;
  strategyId: string | null;
  strategyCode: StrategyCode | null;
  sessionId: string | null;
  message: string;
  reasonMeta: Record<string, unknown> | null;
  pnlDelta: number | null;
  fee: number | null;
  telegramStatus: NotificationDeliveryStatus | null;
  telegramSentAt: string | null;
  telegramError: string | null;
}

export interface SystemStatusView {
  botStatus: BotStatus | "UNKNOWN";
  workerHealthy: boolean;
  apiHealthy: boolean;
  workerStatus: ConnectionState;
  apiStatus: ConnectionState;
  marketDataStatus: ConnectionState;
  lastHeartbeatAt: string | null;
  lastErrorAt: string | null;
  lastMarketUpdateAt: string | null;
  lastApiUpdateAt: string | null;
  currentAction: AgentAction;
}

export interface MarketTickPoint {
  time: string;
  value: number;
}

export interface MarketTickerView {
  symbol: MarketSymbol;
  lastPrice: number;
  changePct24h: number;
  status: ConnectionState;
  updatedAt: string;
  series: MarketTickPoint[];
}

export interface MarketOverviewResponse {
  provider: string;
  updatedAt: string;
  latencyMs: number | null;
  tickers: MarketTickerView[];
}

export interface StrategyExecutionView {
  allowMultiStrategy: boolean;
  activeStrategyIds: string[];
  primaryStrategyId: string | null;
  runningStrategyIds: string[];
}

export interface ExchangeSettingsView {
  exchange: ExchangeProvider;
  mode: BotMode;
  sandbox: boolean;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  apiKeyPreview: string | null;
  updatedAt: string | null;
}

export interface RiskSettingsView {
  maxDailyLossUsd: number;
  maxDailyLossPct: number;
  maxConsecutiveLosses: number;
  cooldownMinutes: number;
  autoPauseEnabled: boolean;
  isTriggered: boolean;
  triggerReason: string | null;
}

export interface KillSwitchView {
  enabled: boolean;
  mode: KillSwitchMode;
  activatedAt: string | null;
  reason: string | null;
}

export interface RuntimeStateResponse {
  exchange: ExchangeSettingsView;
  risk: RiskSettingsView;
  killSwitch: KillSwitchView;
  execution: StrategyExecutionView;
  system: SystemStatusView;
  account: AccountOverviewView;
}

export interface WorkerStatusResponse {
  botId: string;
  mode: BotMode;
  status: BotStatus | "UNKNOWN";
  exchangeKey: string;
  workerIntervalMs: number;
  workerStatus: ConnectionState;
  marketDataStatus: ConnectionState;
  currentAction: AgentAction;
  activeStrategyIds: string[];
  runningStrategyIds: string[];
  watchedSymbols: string[];
  lastHeartbeatAt: string | null;
  lastWorkerTickAt: string | null;
  lastMarketUpdateAt: string | null;
  lastStrategyEvaluationAt: string | null;
  lastTradeExecutionAt: string | null;
  lastTradeSymbol: string | null;
  lastErrorAt: string | null;
  lastTelegramSentAt: string | null;
  lastTelegramStatus: NotificationDeliveryStatus | null;
  lastTelegramEventType: PaperEventType | null;
  lastTelegramError: string | null;
}

export interface PaperStatusResponse {
  botId: string;
  name: string;
  mode: BotMode;
  status: BotStatus | "UNKNOWN";
  exchangeKey: string;
  paperBalance: number;
  reservedBalance: number;
  equity: number;
  totalPnlUsd: number;
  totalPnlPct: number;
  todayPnlUsd: number;
  todayPnlPct: number;
  openPositionCount: number;
  lastTradeAt: string | null;
  lastTradeSymbol: string | null;
  lastEvaluationAt: string | null;
  lastEvaluationSymbol: string | null;
  lastSessionId: string | null;
  activeStrategyIds: string[];
  watchedSymbols: string[];
  worker: WorkerStatusResponse;
}

export interface TelegramTestResponse {
  ok: boolean;
  status: NotificationDeliveryStatus;
  sentAt: string | null;
  error: string | null;
}

export interface StrategyControlResponse {
  period: PeriodFilter;
  sortBy: StrategySortKey;
  strategies: StrategyView[];
  performanceByPeriod: Record<PeriodFilter, StrategyPerformanceRow[]>;
  execution: StrategyExecutionView;
}

export interface DashboardSummaryResponse {
  summary: DashboardMetrics;
  account: AccountOverviewView;
  feeModel: FeeModelView;
  openPositions: PositionView[];
  recentTrades: TradeView[];
  strategies: StrategyView[];
  strategyPerformance: PerformanceBreakdownView[];
  strategyPerformanceByPeriod: Record<PeriodFilter, StrategyPerformanceRow[]>;
  entryReasonPerformance: PerformanceBreakdownView[];
  exitReasonPerformance: PerformanceBreakdownView[];
  currentSession: StrategySessionView | null;
  sessions: StrategySessionView[];
  recentLogs: LogView[];
  system: SystemStatusView;
}

export interface DailyReportResponse {
  date: string;
  timezone: string;
  session: StrategySessionView | null;
  source: "stored" | "computed";
  metrics: ReportMetricsView;
  strategyPerformance: PerformanceBreakdownView[];
  entryReasonPerformance: PerformanceBreakdownView[];
  exitReasonPerformance: PerformanceBreakdownView[];
  report: AiReportPayload;
}

export interface WeeklyReportResponse {
  periodStart: string;
  periodEnd: string;
  timezone: string;
  session: StrategySessionView | null;
  metrics: ReportMetricsView;
  dailySeries: DailySeriesPoint[];
  strategyPerformance: PerformanceBreakdownView[];
  entryReasonPerformance: PerformanceBreakdownView[];
  exitReasonPerformance: PerformanceBreakdownView[];
  report: AiReportPayload;
}

export interface SessionComparisonRow {
  session: StrategySessionView;
  metrics: ReportMetricsView;
  deltaNetPnl: number;
  deltaWinRate: number;
  deltaFees: number;
  deltaExpectancy: number;
  topEntryReason: PerformanceBreakdownView | null;
  topExitReason: PerformanceBreakdownView | null;
}

export interface SessionCompareResponse {
  currentSession: StrategySessionView | null;
  baselineSession: StrategySessionView | null;
  comparisons: SessionComparisonRow[];
  report: AiReportPayload;
}

export const emptyReportMetrics: ReportMetricsView = {
  tradeCount: 0,
  closedPositionCount: 0,
  winCount: 0,
  lossCount: 0,
  winRate: 0,
  grossPnl: 0,
  netPnl: 0,
  totalFees: 0,
  totalWinningPnl: 0,
  totalLosingPnl: 0,
  avgNetPnlPerTrade: 0,
  avgWin: 0,
  avgLoss: 0,
  bestTrade: 0,
  worstTrade: 0,
  expectancy: 0
};

export const emptyAiReportPayload: AiReportPayload = {
  provider: "none",
  generatedAt: new Date(0).toISOString(),
  summary: {
    headline: "No report available",
    body: "There is not enough data to generate an AI-style report yet."
  },
  insights: [],
  recommendations: [],
  profitDrivers: [],
  lossDrivers: [],
  strategyInsights: []
};

export const emptyAccountOverview: AccountOverviewView = {
  initialCapital: 0,
  cashBalance: 0,
  equity: 0,
  totalPnlUsd: 0,
  totalPnlPct: 0,
  todayPnlUsd: 0,
  todayPnlPct: 0,
  reservedBalance: 0
};

export const emptySystemStatus: SystemStatusView = {
  botStatus: "UNKNOWN",
  workerHealthy: false,
  apiHealthy: false,
  workerStatus: "OFFLINE",
  apiStatus: "OFFLINE",
  marketDataStatus: "OFFLINE",
  lastHeartbeatAt: null,
  lastErrorAt: null,
  lastMarketUpdateAt: null,
  lastApiUpdateAt: null,
  currentAction: "WAIT_ENTRY"
};

export const emptyMarketOverview: MarketOverviewResponse = {
  provider: "demo",
  updatedAt: new Date(0).toISOString(),
  latencyMs: null,
  tickers: []
};

export const emptyRuntimeState: RuntimeStateResponse = {
  exchange: {
    exchange: "BINANCE",
    mode: "paper",
    sandbox: true,
    hasApiKey: false,
    hasApiSecret: false,
    apiKeyPreview: null,
    updatedAt: null
  },
  risk: {
    maxDailyLossUsd: 0,
    maxDailyLossPct: 0,
    maxConsecutiveLosses: 0,
    cooldownMinutes: 0,
    autoPauseEnabled: false,
    isTriggered: false,
    triggerReason: null
  },
  killSwitch: {
    enabled: false,
    mode: "PAUSE_ONLY",
    activatedAt: null,
    reason: null
  },
  execution: {
    allowMultiStrategy: false,
    activeStrategyIds: [],
    primaryStrategyId: null,
    runningStrategyIds: []
  },
  system: emptySystemStatus,
  account: emptyAccountOverview
};

export const emptyWorkerStatus: WorkerStatusResponse = {
  botId: "",
  mode: "paper",
  status: "UNKNOWN",
  exchangeKey: "mock-binance-futures",
  workerIntervalMs: 30_000,
  workerStatus: "OFFLINE",
  marketDataStatus: "OFFLINE",
  currentAction: "WAIT_ENTRY",
  activeStrategyIds: [],
  runningStrategyIds: [],
  watchedSymbols: [],
  lastHeartbeatAt: null,
  lastWorkerTickAt: null,
  lastMarketUpdateAt: null,
  lastStrategyEvaluationAt: null,
  lastTradeExecutionAt: null,
  lastTradeSymbol: null,
  lastErrorAt: null,
  lastTelegramSentAt: null,
  lastTelegramStatus: null,
  lastTelegramEventType: null,
  lastTelegramError: null
};

export const emptyPaperStatus: PaperStatusResponse = {
  botId: "",
  name: "",
  mode: "paper",
  status: "UNKNOWN",
  exchangeKey: "mock-binance-futures",
  paperBalance: 0,
  reservedBalance: 0,
  equity: 0,
  totalPnlUsd: 0,
  totalPnlPct: 0,
  todayPnlUsd: 0,
  todayPnlPct: 0,
  openPositionCount: 0,
  lastTradeAt: null,
  lastTradeSymbol: null,
  lastEvaluationAt: null,
  lastEvaluationSymbol: null,
  lastSessionId: null,
  activeStrategyIds: [],
  watchedSymbols: [],
  worker: emptyWorkerStatus
};

export const emptyStrategyControl: StrategyControlResponse = {
  period: "today",
  sortBy: "profit",
  strategies: [],
  performanceByPeriod: {
    today: [],
    "7d": [],
    all: []
  },
  execution: emptyRuntimeState.execution
};

export const emptyDashboardSummary: DashboardSummaryResponse = {
  summary: {
    todayNetPnl: 0,
    totalNetPnl: 0,
    todayFees: 0,
    totalFees: 0,
    winRate: 0,
    todayTradeCount: 0,
    openPositionCount: 0,
    cashBalance: 0,
    totalEquity: 0
  },
  account: emptyAccountOverview,
  feeModel: {
    makerFeeRate: 0,
    takerFeeRate: 0,
    entryOrderRole: "TAKER",
    exitOrderRole: "TAKER",
    slippageBps: 0,
    estimatedRoundTripCostPct: 0
  },
  openPositions: [],
  recentTrades: [],
  strategies: [],
  strategyPerformance: [],
  strategyPerformanceByPeriod: {
    today: [],
    "7d": [],
    all: []
  },
  entryReasonPerformance: [],
  exitReasonPerformance: [],
  currentSession: null,
  sessions: [],
  recentLogs: [],
  system: emptySystemStatus
};

export const emptyDailyReport: DailyReportResponse = {
  date: "",
  timezone: "Asia/Seoul",
  session: null,
  source: "computed",
  metrics: emptyReportMetrics,
  strategyPerformance: [],
  entryReasonPerformance: [],
  exitReasonPerformance: [],
  report: emptyAiReportPayload
};

export const emptyWeeklyReport: WeeklyReportResponse = {
  periodStart: "",
  periodEnd: "",
  timezone: "Asia/Seoul",
  session: null,
  metrics: emptyReportMetrics,
  dailySeries: [],
  strategyPerformance: [],
  entryReasonPerformance: [],
  exitReasonPerformance: [],
  report: emptyAiReportPayload
};

export const emptySessionCompareReport: SessionCompareResponse = {
  currentSession: null,
  baselineSession: null,
  comparisons: [],
  report: emptyAiReportPayload
};
