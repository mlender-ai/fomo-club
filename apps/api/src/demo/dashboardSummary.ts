import type {
  DailyReportResponse,
  DashboardSummaryResponse,
  MarketOverviewResponse,
  RuntimeStateResponse,
  SessionCompareResponse,
  StrategyControlResponse,
  StrategyPerformanceRow,
  StrategyView,
  WeeklyReportResponse
} from "@fomo/shared";

const now = new Date();
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const strategies: StrategyView[] = [
  {
    id: "demo-strategy-a",
    code: "A",
    key: "bb-mean-reversion",
    name: "전략 A",
    description: "비용을 넘기는 평균회귀 구간만 진입하는 기본 전략",
    symbol: "BTCUSDT",
    timeframe: "1m",
    status: "ACTIVE",
    isPrimary: true,
    isEnabled: true,
    allocationPct: 0.12,
    lastEvaluatedAt: now.toISOString(),
    config: {
      key: "bb-mean-reversion",
      symbol: "BTCUSDT",
      timeframe: "1m",
      candleLimit: 240,
      allocationPct: 0.12,
      bbPeriod: 20,
      bbStdDev: 2,
      rsiPeriod: 14,
      entryRsiFloor: 32,
      exitRsiCeiling: 52,
      expectedProfitMultiple: 1.6,
      minVolatilityPct: 0.18,
      cooldownAfterLosses: 2,
      cooldownMinutes: 30
    }
  },
  {
    id: "demo-strategy-b",
    code: "B",
    key: "bb-mean-reversion",
    name: "전략 B",
    description: "BB 평균회귀를 더 보수적인 변동성 조건으로 실험하는 보조 전략",
    symbol: "BTCUSDT",
    timeframe: "3m",
    status: "PAUSED",
    isPrimary: false,
    isEnabled: true,
    allocationPct: 0.08,
    lastEvaluatedAt: minutesAgo(3),
    config: {
      key: "bb-mean-reversion",
      symbol: "BTCUSDT",
      timeframe: "3m",
      candleLimit: 180,
      allocationPct: 0.08,
      cooldownAfterLosses: 2,
      cooldownMinutes: 40,
      bbPeriod: 24,
      bbStdDev: 2.2,
      rsiPeriod: 14,
      entryRsiFloor: 30,
      exitRsiCeiling: 54,
      expectedProfitMultiple: 1.8,
      minVolatilityPct: 0.22
    }
  },
  {
    id: "demo-strategy-c",
    code: "C",
    key: "bb-mean-reversion",
    name: "전략 C",
    description: "BB 평균회귀를 더 공격적인 진입값으로 실험하는 후보 전략",
    symbol: "BTCUSDT",
    timeframe: "5m",
    status: "DISABLED",
    isPrimary: false,
    isEnabled: false,
    allocationPct: 0.05,
    lastEvaluatedAt: minutesAgo(12),
    config: {
      key: "bb-mean-reversion",
      symbol: "BTCUSDT",
      timeframe: "5m",
      candleLimit: 160,
      allocationPct: 0.05,
      cooldownAfterLosses: 3,
      cooldownMinutes: 60,
      bbPeriod: 18,
      bbStdDev: 1.9,
      rsiPeriod: 10,
      entryRsiFloor: 35,
      exitRsiCeiling: 56,
      expectedProfitMultiple: 1.3,
      minVolatilityPct: 0.14
    }
  }
];

const performanceByPeriod: Record<"today" | "7d" | "all", StrategyPerformanceRow[]> = {
  today: [
    {
      strategyId: "demo-strategy-a",
      code: "A",
      name: "전략 A",
      key: "bb-mean-reversion",
      status: "ACTIVE",
      netPnl: 48.72,
      pnlPct: 0.49,
      winRate: 75,
      tradeCount: 8,
      totalFees: 11.36,
      expectancy: 12.18,
      equity: 10048.72,
      lastEvaluatedAt: now.toISOString()
    },
    {
      strategyId: "demo-strategy-b",
      code: "B",
      name: "전략 B",
      key: "bb-mean-reversion",
      status: "PAUSED",
      netPnl: 6.14,
      pnlPct: 0.06,
      winRate: 50,
      tradeCount: 2,
      totalFees: 1.94,
      expectancy: 3.07,
      equity: 10006.14,
      lastEvaluatedAt: minutesAgo(3)
    },
    {
      strategyId: "demo-strategy-c",
      code: "C",
      name: "전략 C",
      key: "bb-mean-reversion",
      status: "DISABLED",
      netPnl: -3.12,
      pnlPct: -0.03,
      winRate: 0,
      tradeCount: 1,
      totalFees: 0.86,
      expectancy: -3.12,
      equity: 9996.88,
      lastEvaluatedAt: minutesAgo(12)
    }
  ],
  "7d": [
    {
      strategyId: "demo-strategy-a",
      code: "A",
      name: "전략 A",
      key: "bb-mean-reversion",
      status: "ACTIVE",
      netPnl: 183.41,
      pnlPct: 1.83,
      winRate: 58.3,
      tradeCount: 24,
      totalFees: 42.17,
      expectancy: 15.28,
      equity: 10183.41,
      lastEvaluatedAt: now.toISOString()
    },
    {
      strategyId: "demo-strategy-b",
      code: "B",
      name: "전략 B",
      key: "bb-mean-reversion",
      status: "PAUSED",
      netPnl: 74.08,
      pnlPct: 0.74,
      winRate: 54.5,
      tradeCount: 11,
      totalFees: 14.82,
      expectancy: 6.73,
      equity: 10074.08,
      lastEvaluatedAt: minutesAgo(3)
    },
    {
      strategyId: "demo-strategy-c",
      code: "C",
      name: "전략 C",
      key: "bb-mean-reversion",
      status: "DISABLED",
      netPnl: -29.64,
      pnlPct: -0.3,
      winRate: 33.3,
      tradeCount: 6,
      totalFees: 8.71,
      expectancy: -4.94,
      equity: 9970.36,
      lastEvaluatedAt: minutesAgo(12)
    }
  ],
  all: [
    {
      strategyId: "demo-strategy-a",
      code: "A",
      name: "전략 A",
      key: "bb-mean-reversion",
      status: "ACTIVE",
      netPnl: 412.55,
      pnlPct: 4.13,
      winRate: 57.9,
      tradeCount: 61,
      totalFees: 108.17,
      expectancy: 13.75,
      equity: 10412.55,
      lastEvaluatedAt: now.toISOString()
    },
    {
      strategyId: "demo-strategy-b",
      code: "B",
      name: "전략 B",
      key: "bb-mean-reversion",
      status: "PAUSED",
      netPnl: 164.1,
      pnlPct: 1.64,
      winRate: 55.2,
      tradeCount: 29,
      totalFees: 38.22,
      expectancy: 5.66,
      equity: 10164.1,
      lastEvaluatedAt: minutesAgo(3)
    },
    {
      strategyId: "demo-strategy-c",
      code: "C",
      name: "전략 C",
      key: "bb-mean-reversion",
      status: "DISABLED",
      netPnl: -82.33,
      pnlPct: -0.82,
      winRate: 36.4,
      tradeCount: 17,
      totalFees: 20.74,
      expectancy: -4.84,
      equity: 9917.67,
      lastEvaluatedAt: minutesAgo(12)
    }
  ]
};

const strategyPerformance = [
  {
    key: "bb-mean-reversion",
    label: "전략 A · 비용 필터형 평균회귀",
    tradeCount: 12,
    winCount: 7,
    lossCount: 5,
    winRate: 58.3,
    netPnl: 183.41,
    totalFees: 42.17,
    grossProfit: 241.66,
    grossLoss: -58.25,
    avgNetPnl: 15.28,
    expectancy: 15.28
  },
  {
    key: "ema-trend-pullback",
    label: "전략 B · EMA 추세 눌림",
    tradeCount: 11,
    winCount: 6,
    lossCount: 5,
    winRate: 54.5,
    netPnl: 74.08,
    totalFees: 14.82,
    grossProfit: 109.31,
    grossLoss: -35.23,
    avgNetPnl: 6.73,
    expectancy: 6.73
  },
  {
    key: "volatility-breakout",
    label: "전략 C · 변동성 돌파",
    tradeCount: 6,
    winCount: 2,
    lossCount: 4,
    winRate: 33.3,
    netPnl: -29.64,
    totalFees: 8.71,
    grossProfit: 16.42,
    grossLoss: -46.06,
    avgNetPnl: -4.94,
    expectancy: -4.94
  }
];

const entryReasonPerformance = [
  {
    key: "LOWER_BAND_TOUCH",
    label: "하단 밴드 이탈 + RSI 둔화",
    tradeCount: 9,
    winCount: 6,
    lossCount: 3,
    winRate: 66.7,
    netPnl: 214.24,
    totalFees: 31.88,
    grossProfit: 249.72,
    grossLoss: -35.48,
    avgNetPnl: 23.8,
    expectancy: 23.8
  },
  {
    key: "WEAK_RECLAIM",
    label: "반등 복귀는 있었지만 속도가 약함",
    tradeCount: 3,
    winCount: 1,
    lossCount: 2,
    winRate: 33.3,
    netPnl: -30.83,
    totalFees: 10.29,
    grossProfit: 8.17,
    grossLoss: -39,
    avgNetPnl: -10.28,
    expectancy: -10.28
  }
];

const exitReasonPerformance = [
  {
    key: "MEAN_REVERSION_COMPLETE",
    label: "중심선 회귀 완료",
    tradeCount: 7,
    winCount: 6,
    lossCount: 1,
    winRate: 85.7,
    netPnl: 228.65,
    totalFees: 24.11,
    grossProfit: 240.11,
    grossLoss: -11.46,
    avgNetPnl: 32.66,
    expectancy: 32.66
  },
  {
    key: "WEAK_REBOUND_STOP",
    label: "반등 약화 손절",
    tradeCount: 5,
    winCount: 1,
    lossCount: 4,
    winRate: 20,
    netPnl: -45.24,
    totalFees: 18.06,
    grossProfit: 7.16,
    grossLoss: -52.4,
    avgNetPnl: -9.05,
    expectancy: -9.05
  }
];

export const demoDashboardSummary: DashboardSummaryResponse = {
  summary: {
    todayNetPnl: 48.72,
    totalNetPnl: 412.55,
    todayFees: 11.36,
    totalFees: 108.17,
    winRate: 57.9,
    todayTradeCount: 8,
    openPositionCount: 1,
    cashBalance: 10183.41,
    totalEquity: 10206.88
  },
  account: {
    initialCapital: 10000,
    cashBalance: 10183.41,
    equity: 10206.88,
    totalPnlUsd: 206.88,
    totalPnlPct: 2.07,
    todayPnlUsd: 48.72,
    todayPnlPct: 0.48,
    reservedBalance: 280.14
  },
  feeModel: {
    makerFeeRate: 0.0002,
    takerFeeRate: 0.0005,
    entryOrderRole: "TAKER",
    exitOrderRole: "TAKER",
    slippageBps: 4,
    estimatedRoundTripCostPct: 0.18
  },
  openPositions: [
    {
      id: "demo-position-1",
      symbol: "BTCUSDT",
      side: "LONG",
      status: "OPEN",
      quantity: 0.0142,
      entryPrice: 68422.15,
      currentPrice: 68587.4,
      realizedPnl: 0,
      unrealizedPnl: 23.47,
      feesPaid: 0.97,
      openedAt: minutesAgo(17),
      closedAt: null,
      entryReasonCode: "LOWER_BAND_TOUCH",
      entryReasonText: "BB 하단 복귀, RSI 반등, 비용 필터 통과",
      exitReasonCode: null,
      exitReasonText: null,
      strategyId: "demo-strategy-a",
      strategyCode: "A",
      strategyName: "전략 A",
      sessionName: "A 전략 검증 세션"
    }
  ],
  recentTrades: [
    {
      id: "demo-trade-1",
      symbol: "BTCUSDT",
      action: "TAKE_PROFIT",
      price: 68410.21,
      quantity: 0.0151,
      grossPnl: 19.44,
      realizedPnl: 18.41,
      fee: 1.03,
      feeRate: 0.0005,
      orderRole: "TAKER",
      slippageBps: 4,
      reasonCode: "MEAN_REVERSION_COMPLETE",
      reasonText: "중심선 회귀 완료 후 익절",
      reasonMeta: {
        strategyCode: "A",
        bbGapPct: -0.41,
        exitRsi: 53.2
      },
      strategyId: "demo-strategy-a",
      strategyCode: "A",
      strategyName: "전략 A",
      sessionName: "A 전략 검증 세션",
      executedAt: minutesAgo(9)
    },
    {
      id: "demo-trade-2",
      symbol: "BTCUSDT",
      action: "STOP_LOSS",
      price: 68124.83,
      quantity: 0.0153,
      grossPnl: -9.11,
      realizedPnl: -10.14,
      fee: 1.03,
      feeRate: 0.0005,
      orderRole: "TAKER",
      slippageBps: 4,
      reasonCode: "WEAK_REBOUND_STOP",
      reasonText: "반등 약화로 손절",
      reasonMeta: {
        strategyCode: "A",
        reboundPct: 0.08,
        requiredMovePct: 0.19
      },
      strategyId: "demo-strategy-a",
      strategyCode: "A",
      strategyName: "전략 A",
      sessionName: "A 전략 검증 세션",
      executedAt: minutesAgo(34)
    },
    {
      id: "demo-trade-3",
      symbol: "ETHUSDT",
      action: "SELL",
      price: 3475.52,
      quantity: 0.32,
      grossPnl: 7.18,
      realizedPnl: 6.14,
      fee: 1.04,
      feeRate: 0.0005,
      orderRole: "TAKER",
      slippageBps: 3,
      reasonCode: "EMA_PULLBACK_EXIT",
      reasonText: "EMA 재가속 확인 후 청산",
      reasonMeta: {
        strategyCode: "B",
        fastEma: 3468.11,
        slowEma: 3454.82
      },
      strategyId: "demo-strategy-b",
      strategyCode: "B",
      strategyName: "전략 B",
      sessionName: "멀티 전략 실험 세션",
      executedAt: minutesAgo(46)
    }
  ],
  strategies,
  strategyPerformance,
  strategyPerformanceByPeriod: performanceByPeriod,
  entryReasonPerformance,
  exitReasonPerformance,
  currentSession: {
    id: "demo-session-1",
    name: "A 전략 검증 세션",
    runLabel: "a-btc-1m-live-paper",
    status: "ACTIVE",
    startedAt: daysAgo(3),
    endedAt: null,
    netPnl: 183.41,
    totalFees: 42.17,
    tradeCount: 24,
    isCurrent: true
  },
  sessions: [
    {
      id: "demo-session-1",
      name: "A 전략 검증 세션",
      runLabel: "a-btc-1m-live-paper",
      status: "ACTIVE",
      startedAt: daysAgo(3),
      endedAt: null,
      netPnl: 183.41,
      totalFees: 42.17,
      tradeCount: 24,
      isCurrent: true
    },
    {
      id: "demo-session-0",
      name: "A 전략 기준 세션",
      runLabel: "a-btc-1m-baseline",
      status: "ARCHIVED",
      startedAt: daysAgo(12),
      endedAt: daysAgo(6),
      netPnl: 51.2,
      totalFees: 37.83,
      tradeCount: 30,
      isCurrent: false
    },
    {
      id: "demo-session-2",
      name: "멀티 전략 실험 세션",
      runLabel: "multi-a-b-rotation",
      status: "ARCHIVED",
      startedAt: daysAgo(20),
      endedAt: daysAgo(14),
      netPnl: 129.84,
      totalFees: 28.47,
      tradeCount: 18,
      isCurrent: false
    }
  ],
  recentLogs: [
    {
      id: "demo-log-1",
      level: "INFO",
      source: "strategy-worker",
      message: "전략 A 진입 조건이 수수료, 변동성, 쿨다운 필터를 모두 통과했습니다.",
      context: {
        symbol: "BTCUSDT",
        session: "a-btc-1m-live-paper"
      },
      createdAt: minutesAgo(2)
    },
    {
      id: "demo-log-2",
      level: "WARN",
      source: "risk-guard",
      message: "전략 B는 연속 손실 2회로 일시정지 상태입니다.",
      context: {
        cooldownMinutes: 40
      },
      createdAt: minutesAgo(15)
    },
    {
      id: "demo-log-3",
      level: "INFO",
      source: "report-agent",
      message: "일간 리포트 스냅샷을 갱신했습니다.",
      context: {
        date: new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(now)
      },
      createdAt: minutesAgo(41)
    }
  ],
  system: {
    botStatus: "RUNNING",
    workerHealthy: true,
    apiHealthy: true,
    workerStatus: "LIVE",
    apiStatus: "LIVE",
    marketDataStatus: "DEMO",
    lastHeartbeatAt: now.toISOString(),
    lastErrorAt: null,
    lastMarketUpdateAt: now.toISOString(),
    lastApiUpdateAt: now.toISOString(),
    currentAction: "HOLD"
  }
};

export const demoRuntimeState: RuntimeStateResponse = {
  exchange: {
    exchange: "BINANCE",
    mode: "paper",
    sandbox: true,
    hasApiKey: true,
    hasApiSecret: true,
    apiKeyPreview: "bina_********_7f2a",
    updatedAt: minutesAgo(55)
  },
  risk: {
    maxDailyLossUsd: 150,
    maxDailyLossPct: 1.5,
    maxConsecutiveLosses: 3,
    cooldownMinutes: 30,
    autoPauseEnabled: true,
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
    allowMultiStrategy: true,
    activeStrategyIds: ["demo-strategy-a", "demo-strategy-b"],
    primaryStrategyId: "demo-strategy-a",
    runningStrategyIds: ["demo-strategy-a"]
  },
  system: demoDashboardSummary.system,
  account: demoDashboardSummary.account
};

export const demoStrategyControl: StrategyControlResponse = {
  period: "today",
  sortBy: "profit",
  strategies,
  performanceByPeriod,
  execution: demoRuntimeState.execution
};

function buildSeries(base: number, drift: number) {
  return Array.from({ length: 24 }, (_, index) => ({
    time: minutesAgo(24 - index),
    value: Number((base + drift * index + Math.sin(index / 2) * (base * 0.0014)).toFixed(2))
  }));
}

export const demoMarketOverview: MarketOverviewResponse = {
  provider: "demo",
  updatedAt: now.toISOString(),
  latencyMs: 220,
  tickers: [
    {
      symbol: "BTCUSDT",
      lastPrice: 68587.4,
      changePct24h: 1.84,
      status: "DEMO",
      updatedAt: now.toISOString(),
      series: buildSeries(68120, 18.6)
    },
    {
      symbol: "ETHUSDT",
      lastPrice: 3472.18,
      changePct24h: 1.12,
      status: "DEMO",
      updatedAt: now.toISOString(),
      series: buildSeries(3430, 1.8)
    },
    {
      symbol: "SOLUSDT",
      lastPrice: 191.27,
      changePct24h: -0.62,
      status: "DEMO",
      updatedAt: now.toISOString(),
      series: buildSeries(194, -0.1)
    }
  ]
};

export const demoDailyReport: DailyReportResponse = {
  date: new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now),
  timezone: "Asia/Seoul",
  session: demoDashboardSummary.currentSession,
  source: "stored",
  metrics: {
    tradeCount: 8,
    closedPositionCount: 4,
    winCount: 3,
    lossCount: 1,
    winRate: 75,
    grossPnl: 60.08,
    netPnl: 48.72,
    totalFees: 11.36,
    totalWinningPnl: 58.86,
    totalLosingPnl: -10.14,
    avgNetPnlPerTrade: 6.09,
    avgWin: 19.62,
    avgLoss: -10.14,
    bestTrade: 24.21,
    worstTrade: -10.14,
    expectancy: 12.18
  },
  strategyPerformance,
  entryReasonPerformance,
  exitReasonPerformance,
  report: {
    provider: "rule-based",
    generatedAt: now.toISOString(),
    summary: {
      headline: "A 전략이 비용 우위를 유지했습니다",
      body: "오늘은 BB 평균회귀 구간이 빠르게 되돌아오며 수수료와 슬리피지를 넘겼고, 전략 B는 관망 상태를 유지했습니다."
    },
    insights: [
      {
        title: "오늘 요약",
        detail: "오늘 8회 체결, 승률 75.0%, 순손익은 48.72달러입니다.",
        tone: "positive"
      },
      {
        title: "수익 이유",
        detail: "하단 밴드 진입 후 중심선 회귀 청산이 가장 큰 수익 기여를 만들었습니다.",
        tone: "positive"
      },
      {
        title: "손실 이유",
        detail: "반등 강도가 약한 손절은 여전히 순손익을 깎는 주 요인입니다.",
        tone: "negative"
      }
    ],
    recommendations: [
      {
        title: "비용 필터 유지",
        detail: "왕복 비용을 충분히 넘기는 진입만 유지하고 기준을 더 느슨하게 풀지 마세요.",
        priority: "high"
      },
      {
        title: "전략 B 재개 전 확인",
        detail: "연속 손실 구간 캔들을 점검한 뒤에만 전략 B를 다시 활성화하세요.",
        priority: "medium"
      },
      {
        title: "킬스위치 절차 점검",
        detail: "실거래 전환 전에는 포지션 유지/즉시 청산 시나리오를 각각 리허설하세요.",
        priority: "low"
      }
    ],
    profitDrivers: [
      {
        key: "LOWER_BAND_TOUCH",
        label: "하단 밴드 복귀 진입",
        category: "entry",
        netPnl: 214.24,
        tradeCount: 9,
        detail: "9건 중 6건 승리, 평균 23.80 순손익"
      },
      {
        key: "MEAN_REVERSION_COMPLETE",
        label: "중심선 회귀 청산",
        category: "exit",
        netPnl: 228.65,
        tradeCount: 7,
        detail: "7건 중 6건 승리, 평균 32.66 순손익"
      }
    ],
    lossDrivers: [
      {
        key: "WEAK_REBOUND_STOP",
        label: "반등 약화 손절",
        category: "exit",
        netPnl: -45.24,
        tradeCount: 5,
        detail: "5건 중 4건 손실, 평균 -9.05 순손익"
      }
    ],
    strategyInsights: [
      {
        key: "bb-mean-reversion",
        label: "전략 A",
        detail: "전략 A는 비용을 넘기는 구간만 선별해 현재 가장 안정적인 순손익을 보여줍니다.",
        netPnl: 183.41,
        winRate: 58.3,
        tradeCount: 24
      },
      {
        key: "ema-trend-pullback",
        label: "전략 B",
        detail: "전략 B는 손실 연속 이후 쿨다운이 걸려 있어 지금은 재가동보다 검토가 우선입니다.",
        netPnl: 74.08,
        winRate: 54.5,
        tradeCount: 11
      }
    ]
  }
};

export const demoWeeklyReport: WeeklyReportResponse = {
  periodStart: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  periodEnd: new Date().toISOString().slice(0, 10),
  timezone: "Asia/Seoul",
  session: demoDashboardSummary.currentSession,
  metrics: {
    tradeCount: 24,
    closedPositionCount: 12,
    winCount: 7,
    lossCount: 5,
    winRate: 58.3,
    grossPnl: 225.58,
    netPnl: 183.41,
    totalFees: 42.17,
    totalWinningPnl: 251.04,
    totalLosingPnl: -67.63,
    avgNetPnlPerTrade: 7.64,
    avgWin: 35.86,
    avgLoss: -13.53,
    bestTrade: 41.82,
    worstTrade: -17.94,
    expectancy: 15.28
  },
  dailySeries: [
    { date: daysAgo(6).slice(0, 10), tradeCount: 2, netPnl: 12.14, totalFees: 3.26, winRate: 50 },
    { date: daysAgo(5).slice(0, 10), tradeCount: 4, netPnl: 27.83, totalFees: 5.91, winRate: 66.7 },
    { date: daysAgo(4).slice(0, 10), tradeCount: 2, netPnl: -8.44, totalFees: 3.11, winRate: 0 },
    { date: daysAgo(3).slice(0, 10), tradeCount: 4, netPnl: 31.9, totalFees: 6.08, winRate: 66.7 },
    { date: daysAgo(2).slice(0, 10), tradeCount: 2, netPnl: 18.01, totalFees: 3.44, winRate: 100 },
    { date: daysAgo(1).slice(0, 10), tradeCount: 2, netPnl: 53.25, totalFees: 9.01, winRate: 100 },
    { date: now.toISOString().slice(0, 10), tradeCount: 8, netPnl: 48.72, totalFees: 11.36, winRate: 75 }
  ],
  strategyPerformance,
  entryReasonPerformance,
  exitReasonPerformance,
  report: {
    provider: "rule-based",
    generatedAt: now.toISOString(),
    summary: {
      headline: "주간 기준으로도 전략 A가 우세합니다",
      body: "최근 7일은 전략 A가 비용과 손절을 모두 감안하고도 가장 높은 기대값을 유지했고, 전략 B는 보조, 전략 C는 후보 단계에 머물렀습니다."
    },
    insights: [
      {
        title: "7일 순손익",
        detail: "최근 7일 순손익은 183.41달러, 총 수수료는 42.17달러입니다.",
        tone: "positive"
      },
      {
        title: "전략 집중도",
        detail: "실제 수익은 전략 A에 집중돼 있어 아직 멀티 전략 확대보다 단일 전략 검증이 우선입니다.",
        tone: "neutral"
      },
      {
        title: "손실 집중도",
        detail: "반등 약화 손절과 전략 C의 돌파 실패가 손실 대부분을 차지합니다.",
        tone: "negative"
      }
    ],
    recommendations: [
      {
        title: "전략 A 유지",
        detail: "전략 A는 충분한 표본이 쌓일 때까지 그대로 유지하고, B/C는 보조 실험으로만 운영하세요.",
        priority: "high"
      },
      {
        title: "전략별 자본 분리",
        detail: "A/B/C 자본 배분을 분리해서 어떤 전략이 실제 자본 효율이 높은지 비교하세요.",
        priority: "medium"
      },
      {
        title: "일일 손실 제한 엄수",
        detail: "실제 운영 단계에서는 일일 손실 제한이 트리거되는 즉시 자동 pause가 반드시 실행돼야 합니다.",
        priority: "medium"
      }
    ],
    profitDrivers: demoDailyReport.report.profitDrivers,
    lossDrivers: demoDailyReport.report.lossDrivers,
    strategyInsights: demoDailyReport.report.strategyInsights
  }
};

const currentSession = demoDashboardSummary.currentSession;
const baselineSession = demoDashboardSummary.sessions[1] ?? null;
const latestSession = demoDashboardSummary.sessions[0]!;
const archivedSession = demoDashboardSummary.sessions[2]!;
const topEntryReason = entryReasonPerformance[0] ?? null;
const topExitReasonWin = exitReasonPerformance[0] ?? null;
const topExitReasonLoss = exitReasonPerformance[1] ?? null;

export const demoSessionCompareReport: SessionCompareResponse = {
  currentSession,
  baselineSession,
  comparisons: [
    {
      session: latestSession,
      metrics: demoWeeklyReport.metrics,
      deltaNetPnl: 132.21,
      deltaWinRate: 7.9,
      deltaFees: 4.34,
      deltaExpectancy: 3.1,
      topEntryReason,
      topExitReason: topExitReasonWin
    },
    {
      session: archivedSession,
      metrics: {
        ...demoWeeklyReport.metrics,
        tradeCount: 18,
        netPnl: 129.84,
        totalFees: 28.47,
        expectancy: 7.21
      },
      deltaNetPnl: 78.64,
      deltaWinRate: 3.1,
      deltaFees: -9.36,
      deltaExpectancy: 1.12,
      topEntryReason,
      topExitReason: topExitReasonLoss
    }
  ],
  report: {
    provider: "rule-based",
    generatedAt: now.toISOString(),
    summary: {
      headline: "현재 세션이 기준 세션보다 우위입니다",
      body: "현 세션은 비용 증가를 감수해도 순손익과 기대값 모두 기준 세션보다 개선됐습니다."
    },
    insights: [
      {
        title: "세션 비교",
        detail: "현재 세션은 기준 세션 대비 순손익이 132.21달러 개선됐습니다.",
        tone: "positive"
      }
    ],
    recommendations: [
      {
        title: "기준 세션 유지",
        detail: "세션 간 비교는 계속 유지하되, 자동으로 파라미터를 수정하지 말고 사람 검토 후 반영하세요.",
        priority: "high"
      }
    ],
    profitDrivers: demoDailyReport.report.profitDrivers,
    lossDrivers: demoDailyReport.report.lossDrivers,
    strategyInsights: demoDailyReport.report.strategyInsights
  }
};
