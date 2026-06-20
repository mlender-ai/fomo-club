import { PrismaClient } from "@prisma/client";
import type { BbMeanReversionConfig, PerformanceBreakdownView, ReportMetricsView } from "@fomo/shared";

const prisma = new PrismaClient();

interface ClosedPositionSeed {
  id: string;
  sessionId: string;
  sessionName: string;
  runLabel: string;
  openedAt: Date;
  closedAt: Date;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  grossPnl: number;
  realizedPnl: number;
  feesPaid: number;
  entryReasonCode: string;
  entryReasonText: string;
  exitReasonCode: string;
  exitReasonText: string;
  exitAction: "TAKE_PROFIT" | "STOP_LOSS";
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function formatDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function daysAgo(days: number, hour: number, minute: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

function buildPerformanceBreakdown(
  rows: Array<{
    realizedPnl: number;
    feesPaid: number;
    key: string;
    label: string;
  }>
): PerformanceBreakdownView[] {
  const grouped = new Map<
    string,
    {
      label: string;
      tradeCount: number;
      winCount: number;
      lossCount: number;
      netPnl: number;
      totalFees: number;
      grossProfit: number;
      grossLoss: number;
    }
  >();

  for (const row of rows) {
    const current = grouped.get(row.key) ?? {
      label: row.label,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
      netPnl: 0,
      totalFees: 0,
      grossProfit: 0,
      grossLoss: 0
    };

    current.tradeCount += 1;
    current.netPnl += row.realizedPnl;
    current.totalFees += row.feesPaid;

    if (row.realizedPnl > 0) {
      current.winCount += 1;
      current.grossProfit += row.realizedPnl;
    } else if (row.realizedPnl < 0) {
      current.lossCount += 1;
      current.grossLoss += row.realizedPnl;
    }

    grouped.set(row.key, current);
  }

  return [...grouped.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      tradeCount: value.tradeCount,
      winCount: value.winCount,
      lossCount: value.lossCount,
      winRate: value.tradeCount === 0 ? 0 : Number(((value.winCount / value.tradeCount) * 100).toFixed(1)),
      netPnl: round(value.netPnl),
      totalFees: round(value.totalFees),
      grossProfit: round(value.grossProfit),
      grossLoss: round(value.grossLoss),
      avgNetPnl: value.tradeCount === 0 ? 0 : round(value.netPnl / value.tradeCount),
      expectancy: value.tradeCount === 0 ? 0 : round(value.netPnl / value.tradeCount)
    }))
    .sort((left, right) => right.netPnl - left.netPnl);
}

function buildMetrics(
  trades: Array<{ realizedPnl: number; grossPnl: number; fee: number }>,
  positions: Array<{ realizedPnl: number }>
): ReportMetricsView {
  const winCount = positions.filter((position) => position.realizedPnl > 0).length;
  const lossCount = positions.filter((position) => position.realizedPnl < 0).length;
  const totalWinningPnl = positions.filter((position) => position.realizedPnl > 0).reduce((sum, position) => sum + position.realizedPnl, 0);
  const totalLosingPnl = positions.filter((position) => position.realizedPnl < 0).reduce((sum, position) => sum + position.realizedPnl, 0);

  return {
    tradeCount: trades.length,
    closedPositionCount: positions.length,
    winCount,
    lossCount,
    winRate: positions.length === 0 ? 0 : Number(((winCount / positions.length) * 100).toFixed(1)),
    grossPnl: round(trades.reduce((sum, trade) => sum + trade.grossPnl, 0)),
    netPnl: round(trades.reduce((sum, trade) => sum + trade.realizedPnl, 0)),
    totalFees: round(trades.reduce((sum, trade) => sum + trade.fee, 0)),
    totalWinningPnl: round(totalWinningPnl),
    totalLosingPnl: round(totalLosingPnl),
    avgNetPnlPerTrade: trades.length === 0 ? 0 : round(trades.reduce((sum, trade) => sum + trade.realizedPnl, 0) / trades.length),
    avgWin: winCount === 0 ? 0 : round(totalWinningPnl / winCount),
    avgLoss: lossCount === 0 ? 0 : round(totalLosingPnl / lossCount),
    bestTrade: positions.length === 0 ? 0 : round(Math.max(...positions.map((position) => position.realizedPnl))),
    worstTrade: positions.length === 0 ? 0 : round(Math.min(...positions.map((position) => position.realizedPnl))),
    expectancy: positions.length === 0 ? 0 : round(trades.reduce((sum, trade) => sum + trade.realizedPnl, 0) / positions.length)
  };
}

async function main() {
  const botName = process.env.DEFAULT_BOT_NAME ?? "personal-paper-bot";
  const paperBalance = Number(process.env.DEFAULT_PAPER_BALANCE ?? 10000);
  const timeZone = process.env.REPORT_TIMEZONE ?? "Asia/Seoul";

  const bot = await prisma.bot.upsert({
    where: {
      id: "seed-paper-bot"
    },
    update: {
      name: botName,
      paperBalance,
      status: "RUNNING",
      makerFeeRate: 0.0002,
      takerFeeRate: 0.0005,
      entryOrderRole: "TAKER",
      exitOrderRole: "TAKER",
      slippageBps: 4
    },
    create: {
      id: "seed-paper-bot",
      name: botName,
      mode: "paper",
      status: "RUNNING",
      paperBalance,
      exchangeKey: "mock-binance-futures",
      makerFeeRate: 0.0002,
      takerFeeRate: 0.0005,
      entryOrderRole: "TAKER",
      exitOrderRole: "TAKER",
      slippageBps: 4
    }
  });

  const bbMeanReversion: BbMeanReversionConfig = {
    key: "bb-mean-reversion",
    symbol: "BTCUSDT",
    timeframe: "1m",
    candleLimit: 240,
    allocationPct: 0.1,
    bbPeriod: 20,
    bbStdDev: 2,
    rsiPeriod: 14,
    entryRsiFloor: 32,
    exitRsiCeiling: 52,
    expectedProfitMultiple: 1.6,
    minVolatilityPct: 0.18,
    cooldownAfterLosses: 2,
    cooldownMinutes: 30
  };

  await prisma.alert.deleteMany({ where: { botId: bot.id } });
  await prisma.dailySummary.deleteMany({ where: { botId: bot.id } });
  await prisma.trade.deleteMany({ where: { botId: bot.id } });
  await prisma.position.deleteMany({ where: { botId: bot.id } });
  await prisma.strategyRun.deleteMany({ where: { botId: bot.id } });
  await prisma.systemLog.deleteMany({ where: { botId: bot.id } });
  await prisma.strategySession.deleteMany({ where: { botId: bot.id } });
  await prisma.marketCandle.deleteMany({
    where: {
      exchangeKey: "mock-binance-futures",
      symbol: bbMeanReversion.symbol,
      timeframe: bbMeanReversion.timeframe
    }
  });

  await prisma.strategy.deleteMany({
    where: {
      botId: bot.id,
      key: {
        not: bbMeanReversion.key
      }
    }
  });

  const strategy = await prisma.strategy.upsert({
    where: {
      botId_key: {
        botId: bot.id,
        key: bbMeanReversion.key
      }
    },
    update: {
      name: "A Strategy · Fee-aware BB Mean Reversion",
      symbol: bbMeanReversion.symbol,
      timeframe: bbMeanReversion.timeframe,
      status: "ACTIVE",
      config: bbMeanReversion
    },
    create: {
      id: "seed-strategy-a",
      botId: bot.id,
      key: bbMeanReversion.key,
      name: "A Strategy · Fee-aware BB Mean Reversion",
      description: "BTCUSDT 1m lower-band reversion with fee, volatility, and cooldown filters.",
      symbol: bbMeanReversion.symbol,
      timeframe: bbMeanReversion.timeframe,
      status: "ACTIVE",
      config: bbMeanReversion
    }
  });

  const sessions = await prisma.$transaction([
    prisma.strategySession.create({
      data: {
        id: "seed-session-a",
        botId: bot.id,
        name: "A Strategy Validation",
        runLabel: "a-strategy-btc-1m-demo",
        status: "ACTIVE",
        notes: "Current fee-aware validation run.",
        configSnapshot: bbMeanReversion,
        startedAt: daysAgo(3, 0, 0)
      }
    }),
    prisma.strategySession.create({
      data: {
        id: "seed-session-b",
        botId: bot.id,
        name: "A Strategy Validation",
        runLabel: "a-strategy-btc-1m-baseline",
        status: "ARCHIVED",
        notes: "Baseline run before fee and volatility filters were tightened.",
        configSnapshot: bbMeanReversion,
        startedAt: daysAgo(12, 0, 0),
        endedAt: daysAgo(6, 23, 0)
      }
    }),
    prisma.strategySession.create({
      data: {
        id: "seed-session-c",
        botId: bot.id,
        name: "A Strategy Validation",
        runLabel: "a-strategy-btc-1m-conservative",
        status: "ARCHIVED",
        notes: "Conservative run with fewer entries.",
        configSnapshot: bbMeanReversion,
        startedAt: daysAgo(20, 0, 0),
        endedAt: daysAgo(14, 23, 0)
      }
    })
  ]);

  const activeSession = sessions[0]!;
  const baselineSession = sessions[1]!;
  const conservativeSession = sessions[2]!;

  const closedPositions: ClosedPositionSeed[] = [
    {
      id: "seed-position-a1",
      sessionId: activeSession.id,
      sessionName: activeSession.name,
      runLabel: activeSession.runLabel,
      openedAt: daysAgo(0, 1, 10),
      closedAt: daysAgo(0, 1, 34),
      quantity: 0.0151,
      entryPrice: 68274.12,
      exitPrice: 68410.21,
      grossPnl: 19.44,
      realizedPnl: 18.41,
      feesPaid: 1.03,
      entryReasonCode: "LOWER_BAND_TOUCH",
      entryReasonText: "Price closed below the lower Bollinger band with RSI compression.",
      exitReasonCode: "MEAN_REVERSION_COMPLETE",
      exitReasonText: "Price reverted toward the Bollinger mid line and momentum normalized.",
      exitAction: "TAKE_PROFIT"
    },
    {
      id: "seed-position-a2",
      sessionId: activeSession.id,
      sessionName: activeSession.name,
      runLabel: activeSession.runLabel,
      openedAt: daysAgo(0, 3, 20),
      closedAt: daysAgo(0, 3, 44),
      quantity: 0.0153,
      entryPrice: 68220.54,
      exitPrice: 68124.83,
      grossPnl: -9.11,
      realizedPnl: -10.14,
      feesPaid: 1.03,
      entryReasonCode: "WEAK_RECLAIM",
      entryReasonText: "Price reclaimed the band without enough volatility follow-through.",
      exitReasonCode: "WEAK_REBOUND_STOP",
      exitReasonText: "Rebound stalled before covering fee drag, so the position was cut.",
      exitAction: "STOP_LOSS"
    },
    {
      id: "seed-position-a3",
      sessionId: activeSession.id,
      sessionName: activeSession.name,
      runLabel: activeSession.runLabel,
      openedAt: daysAgo(1, 2, 0),
      closedAt: daysAgo(1, 2, 36),
      quantity: 0.015,
      entryPrice: 67942.1,
      exitPrice: 68110.44,
      grossPnl: 25.3,
      realizedPnl: 24.21,
      feesPaid: 1.09,
      entryReasonCode: "LOWER_BAND_TOUCH",
      entryReasonText: "Price closed below the lower Bollinger band with RSI compression.",
      exitReasonCode: "MEAN_REVERSION_COMPLETE",
      exitReasonText: "Price reverted toward the Bollinger mid line and momentum normalized.",
      exitAction: "TAKE_PROFIT"
    },
    {
      id: "seed-position-a4",
      sessionId: activeSession.id,
      sessionName: activeSession.name,
      runLabel: activeSession.runLabel,
      openedAt: daysAgo(2, 5, 5),
      closedAt: daysAgo(2, 5, 31),
      quantity: 0.0147,
      entryPrice: 67744.24,
      exitPrice: 67880.78,
      grossPnl: 18.91,
      realizedPnl: 17.83,
      feesPaid: 1.08,
      entryReasonCode: "LOWER_BAND_TOUCH",
      entryReasonText: "Price closed below the lower Bollinger band with RSI compression.",
      exitReasonCode: "MEAN_REVERSION_COMPLETE",
      exitReasonText: "Price reverted toward the Bollinger mid line and momentum normalized.",
      exitAction: "TAKE_PROFIT"
    },
    {
      id: "seed-position-a5",
      sessionId: activeSession.id,
      sessionName: activeSession.name,
      runLabel: activeSession.runLabel,
      openedAt: daysAgo(3, 1, 42),
      closedAt: daysAgo(3, 2, 11),
      quantity: 0.0149,
      entryPrice: 67640.31,
      exitPrice: 67590.74,
      grossPnl: -7.39,
      realizedPnl: -8.44,
      feesPaid: 1.05,
      entryReasonCode: "WEAK_RECLAIM",
      entryReasonText: "Price reclaimed the band without enough volatility follow-through.",
      exitReasonCode: "WEAK_REBOUND_STOP",
      exitReasonText: "Rebound stalled before covering fee drag, so the position was cut.",
      exitAction: "STOP_LOSS"
    },
    {
      id: "seed-position-b1",
      sessionId: baselineSession.id,
      sessionName: baselineSession.name,
      runLabel: baselineSession.runLabel,
      openedAt: daysAgo(7, 0, 55),
      closedAt: daysAgo(7, 1, 18),
      quantity: 0.015,
      entryPrice: 67140.12,
      exitPrice: 67229.19,
      grossPnl: 13.15,
      realizedPnl: 12.14,
      feesPaid: 1.01,
      entryReasonCode: "LOWER_BAND_TOUCH",
      entryReasonText: "Price closed below the lower Bollinger band with RSI compression.",
      exitReasonCode: "MEAN_REVERSION_COMPLETE",
      exitReasonText: "Price reverted toward the Bollinger mid line and momentum normalized.",
      exitAction: "TAKE_PROFIT"
    },
    {
      id: "seed-position-b2",
      sessionId: baselineSession.id,
      sessionName: baselineSession.name,
      runLabel: baselineSession.runLabel,
      openedAt: daysAgo(8, 2, 10),
      closedAt: daysAgo(8, 2, 44),
      quantity: 0.0151,
      entryPrice: 66910.81,
      exitPrice: 66872.34,
      grossPnl: -5.79,
      realizedPnl: -6.82,
      feesPaid: 1.03,
      entryReasonCode: "WEAK_RECLAIM",
      entryReasonText: "Price reclaimed the band without enough volatility follow-through.",
      exitReasonCode: "WEAK_REBOUND_STOP",
      exitReasonText: "Rebound stalled before covering fee drag, so the position was cut.",
      exitAction: "STOP_LOSS"
    },
    {
      id: "seed-position-b3",
      sessionId: baselineSession.id,
      sessionName: baselineSession.name,
      runLabel: baselineSession.runLabel,
      openedAt: daysAgo(9, 3, 5),
      closedAt: daysAgo(9, 3, 39),
      quantity: 0.0148,
      entryPrice: 66782.19,
      exitPrice: 66984.5,
      grossPnl: 20.57,
      realizedPnl: 19.53,
      feesPaid: 1.04,
      entryReasonCode: "LOWER_BAND_TOUCH",
      entryReasonText: "Price closed below the lower Bollinger band with RSI compression.",
      exitReasonCode: "MEAN_REVERSION_COMPLETE",
      exitReasonText: "Price reverted toward the Bollinger mid line and momentum normalized.",
      exitAction: "TAKE_PROFIT"
    },
    {
      id: "seed-position-b4",
      sessionId: baselineSession.id,
      sessionName: baselineSession.name,
      runLabel: baselineSession.runLabel,
      openedAt: daysAgo(10, 4, 15),
      closedAt: daysAgo(10, 5, 2),
      quantity: 0.0147,
      entryPrice: 66510.19,
      exitPrice: 66875.23,
      grossPnl: 27.39,
      realizedPnl: 26.35,
      feesPaid: 1.04,
      entryReasonCode: "LOWER_BAND_TOUCH",
      entryReasonText: "Price closed below the lower Bollinger band with RSI compression.",
      exitReasonCode: "MEAN_REVERSION_COMPLETE",
      exitReasonText: "Price reverted toward the Bollinger mid line and momentum normalized.",
      exitAction: "TAKE_PROFIT"
    },
    {
      id: "seed-position-b5",
      sessionId: baselineSession.id,
      sessionName: baselineSession.name,
      runLabel: baselineSession.runLabel,
      openedAt: daysAgo(11, 1, 34),
      closedAt: daysAgo(11, 2, 5),
      quantity: 0.0152,
      entryPrice: 66322.54,
      exitPrice: 66284.19,
      grossPnl: -6.93,
      realizedPnl: -7.96,
      feesPaid: 1.03,
      entryReasonCode: "WEAK_RECLAIM",
      entryReasonText: "Price reclaimed the band without enough volatility follow-through.",
      exitReasonCode: "WEAK_REBOUND_STOP",
      exitReasonText: "Rebound stalled before covering fee drag, so the position was cut.",
      exitAction: "STOP_LOSS"
    },
    {
      id: "seed-position-c1",
      sessionId: conservativeSession.id,
      sessionName: conservativeSession.name,
      runLabel: conservativeSession.runLabel,
      openedAt: daysAgo(15, 2, 11),
      closedAt: daysAgo(15, 2, 35),
      quantity: 0.0142,
      entryPrice: 65741.3,
      exitPrice: 65942.38,
      grossPnl: 16.67,
      realizedPnl: 15.62,
      feesPaid: 1.05,
      entryReasonCode: "LOWER_BAND_TOUCH",
      entryReasonText: "Price closed below the lower Bollinger band with RSI compression.",
      exitReasonCode: "MEAN_REVERSION_COMPLETE",
      exitReasonText: "Price reverted toward the Bollinger mid line and momentum normalized.",
      exitAction: "TAKE_PROFIT"
    },
    {
      id: "seed-position-c2",
      sessionId: conservativeSession.id,
      sessionName: conservativeSession.name,
      runLabel: conservativeSession.runLabel,
      openedAt: daysAgo(16, 5, 5),
      closedAt: daysAgo(16, 5, 42),
      quantity: 0.014,
      entryPrice: 65512.9,
      exitPrice: 65782.37,
      grossPnl: 23.71,
      realizedPnl: 22.67,
      feesPaid: 1.04,
      entryReasonCode: "LOWER_BAND_TOUCH",
      entryReasonText: "Price closed below the lower Bollinger band with RSI compression.",
      exitReasonCode: "MEAN_REVERSION_COMPLETE",
      exitReasonText: "Price reverted toward the Bollinger mid line and momentum normalized.",
      exitAction: "TAKE_PROFIT"
    },
    {
      id: "seed-position-c3",
      sessionId: conservativeSession.id,
      sessionName: conservativeSession.name,
      runLabel: conservativeSession.runLabel,
      openedAt: daysAgo(17, 0, 20),
      closedAt: daysAgo(17, 0, 58),
      quantity: 0.0141,
      entryPrice: 65330.11,
      exitPrice: 65288.81,
      grossPnl: -6.34,
      realizedPnl: -7.35,
      feesPaid: 1.01,
      entryReasonCode: "WEAK_RECLAIM",
      entryReasonText: "Price reclaimed the band without enough volatility follow-through.",
      exitReasonCode: "WEAK_REBOUND_STOP",
      exitReasonText: "Rebound stalled before covering fee drag, so the position was cut.",
      exitAction: "STOP_LOSS"
    }
  ];

  const openPosition = {
    id: "seed-position-open",
    botId: bot.id,
    strategyId: strategy.id,
    sessionId: activeSession.id,
    symbol: bbMeanReversion.symbol,
    side: "LONG",
    status: "OPEN" as const,
    quantity: 0.0142,
    entryPrice: 68422.15,
    exitPrice: null,
    entryValue: round(68422.15 * 0.0142),
    exitValue: null,
    realizedPnl: 0,
    unrealizedPnl: 23.47,
    feesPaid: 0.97,
    openedAt: daysAgo(0, 0, 41),
    closedAt: null,
    entryReasonCode: "LOWER_BAND_TOUCH",
    entryReasonText:
      "BTCUSDT entered on 1m because price closed 0.41% below the lower Bollinger band while RSI cooled to 29.8.",
    entryReasonMeta: {
      signal: "bb-mean-reversion",
      timeframe: "1m"
    },
    exitReasonCode: null,
    exitReasonText: null,
    exitReasonMeta: null
  };

  await prisma.position.createMany({
    data: [
      ...closedPositions.map((position) => ({
        id: position.id,
        botId: bot.id,
        strategyId: strategy.id,
        sessionId: position.sessionId,
        symbol: bbMeanReversion.symbol,
        side: "LONG",
        status: "CLOSED",
        quantity: position.quantity,
        entryPrice: position.entryPrice,
        exitPrice: position.exitPrice,
        entryValue: round(position.entryPrice * position.quantity),
        exitValue: round(position.exitPrice * position.quantity),
        realizedPnl: position.realizedPnl,
        unrealizedPnl: 0,
        feesPaid: position.feesPaid,
        openedAt: position.openedAt,
        closedAt: position.closedAt,
        entryReasonCode: position.entryReasonCode,
        entryReasonText: position.entryReasonText,
        entryReasonMeta: {
          sessionName: position.sessionName,
          runLabel: position.runLabel
        },
        exitReasonCode: position.exitReasonCode,
        exitReasonText: position.exitReasonText,
        exitReasonMeta: {
          sessionName: position.sessionName,
          runLabel: position.runLabel
        }
      })),
      openPosition
    ]
  });

  const trades = [
    ...closedPositions.flatMap((position) => {
      const entryFee = round(position.feesPaid / 2);
      const exitFee = round(position.feesPaid - entryFee);

      return [
        {
          id: `${position.id}-entry`,
          botId: bot.id,
          strategyId: strategy.id,
          positionId: position.id,
          sessionId: position.sessionId,
          symbol: bbMeanReversion.symbol,
          action: "BUY" as const,
          side: "LONG",
          quantity: position.quantity,
          price: position.entryPrice,
          notional: round(position.entryPrice * position.quantity),
          orderRole: "TAKER" as const,
          feeRate: 0.0005,
          slippageBps: 4,
          fee: entryFee,
          grossPnl: 0,
          realizedPnl: 0,
          reasonCode: position.entryReasonCode,
          reasonText: position.entryReasonText,
          reasonMeta: {
            sessionName: position.sessionName,
            runLabel: position.runLabel
          },
          executedAt: position.openedAt
        },
        {
          id: `${position.id}-exit`,
          botId: bot.id,
          strategyId: strategy.id,
          positionId: position.id,
          sessionId: position.sessionId,
          symbol: bbMeanReversion.symbol,
          action: position.exitAction,
          side: "LONG",
          quantity: position.quantity,
          price: position.exitPrice,
          notional: round(position.exitPrice * position.quantity),
          orderRole: "TAKER" as const,
          feeRate: 0.0005,
          slippageBps: 4,
          fee: exitFee,
          grossPnl: position.grossPnl,
          realizedPnl: position.realizedPnl,
          reasonCode: position.exitReasonCode,
          reasonText: position.exitReasonText,
          reasonMeta: {
            sessionName: position.sessionName,
            runLabel: position.runLabel
          },
          executedAt: position.closedAt
        }
      ];
    }),
    {
      id: "seed-position-open-entry",
      botId: bot.id,
      strategyId: strategy.id,
      positionId: openPosition.id,
      sessionId: activeSession.id,
      symbol: bbMeanReversion.symbol,
      action: "BUY" as const,
      side: "LONG",
      quantity: openPosition.quantity,
      price: openPosition.entryPrice,
      notional: openPosition.entryValue,
      orderRole: "TAKER" as const,
      feeRate: 0.0005,
      slippageBps: 4,
      fee: 0.97,
      grossPnl: 0,
      realizedPnl: 0,
      reasonCode: openPosition.entryReasonCode,
      reasonText: openPosition.entryReasonText,
      reasonMeta: {
        signal: "bb-mean-reversion",
        timeframe: "1m"
      },
      executedAt: openPosition.openedAt
    }
  ];

  await prisma.trade.createMany({ data: trades });

  await prisma.marketCandle.createMany({
    data: [
      { exchangeKey: "mock-binance-futures", symbol: "BTCUSDT", timeframe: "1m", openTime: daysAgo(0, 0, 37), closeTime: daysAgo(0, 0, 38), open: 68510.2, high: 68548.2, low: 68482.1, close: 68523.5, volume: 42.1 },
      { exchangeKey: "mock-binance-futures", symbol: "BTCUSDT", timeframe: "1m", openTime: daysAgo(0, 0, 38), closeTime: daysAgo(0, 0, 39), open: 68523.5, high: 68572.3, low: 68512.4, close: 68560.8, volume: 39.3 },
      { exchangeKey: "mock-binance-futures", symbol: "BTCUSDT", timeframe: "1m", openTime: daysAgo(0, 0, 39), closeTime: daysAgo(0, 0, 40), open: 68560.8, high: 68592.4, low: 68510.6, close: 68541.2, volume: 37.7 },
      { exchangeKey: "mock-binance-futures", symbol: "BTCUSDT", timeframe: "1m", openTime: daysAgo(0, 0, 40), closeTime: daysAgo(0, 0, 41), open: 68541.2, high: 68584.7, low: 68535.2, close: 68573.9, volume: 31.2 },
      { exchangeKey: "mock-binance-futures", symbol: "BTCUSDT", timeframe: "1m", openTime: daysAgo(0, 0, 41), closeTime: daysAgo(0, 0, 42), open: 68573.9, high: 68604.9, low: 68541.5, close: 68587.4, volume: 44.9 }
    ]
  });

  await prisma.systemLog.createMany({
    data: [
      {
        id: "seed-log-1",
        botId: bot.id,
        level: "INFO",
        source: "strategy-worker",
        message: "Entry passed fee, volatility, and cooldown filters.",
        context: {
          symbol: "BTCUSDT",
          session: activeSession.runLabel
        },
        createdAt: daysAgo(0, 0, 45)
      },
      {
        id: "seed-log-2",
        botId: bot.id,
        level: "WARN",
        source: "trade-filter",
        message: "Skipped entry because expected rebound did not clear round-trip costs.",
        context: {
          expectedGrossReturnPct: 0.11,
          requiredReturnPct: 0.29
        },
        createdAt: daysAgo(0, 1, 5)
      },
      {
        id: "seed-log-3",
        botId: bot.id,
        level: "INFO",
        source: "report-agent",
        message: "Daily summary snapshot refreshed for current session.",
        context: {
          date: formatDateKey(new Date(), timeZone)
        },
        createdAt: daysAgo(0, 1, 20)
      }
    ]
  });

  await prisma.alert.createMany({
    data: [
      {
        id: "seed-alert-1",
        botId: bot.id,
        strategyId: strategy.id,
        sessionId: activeSession.id,
        type: "INFO",
        status: "SENT",
        title: "Daily report",
        message: "Daily report summary delivered.",
        payload: {
          session: activeSession.runLabel
        },
        sentAt: daysAgo(0, 1, 25),
        createdAt: daysAgo(0, 1, 25)
      }
    ]
  });

  const sessionLookup = new Map(
    [activeSession, baselineSession, conservativeSession].map((session) => [session.id, session] as const)
  );
  const summaryRows = new Map<
    string,
    {
      sessionId: string;
      dateKey: string;
      trades: typeof trades;
      positions: ClosedPositionSeed[];
    }
  >();

  for (const trade of trades) {
    const dateKey = formatDateKey(trade.executedAt, timeZone);
    const key = `${trade.sessionId}:${dateKey}`;
    const current = summaryRows.get(key) ?? {
      sessionId: trade.sessionId!,
      dateKey,
      trades: [],
      positions: []
    };

    current.trades.push(trade);
    summaryRows.set(key, current);
  }

  for (const position of closedPositions) {
    const dateKey = formatDateKey(position.closedAt, timeZone);
    const key = `${position.sessionId}:${dateKey}`;
    const current = summaryRows.get(key) ?? {
      sessionId: position.sessionId,
      dateKey,
      trades: [],
      positions: []
    };

    current.positions.push(position);
    summaryRows.set(key, current);
  }

  await prisma.dailySummary.createMany({
    data: [...summaryRows.values()].map((summary) => {
      const metrics = buildMetrics(
        summary.trades.map((trade) => ({
          realizedPnl: trade.realizedPnl,
          grossPnl: trade.grossPnl,
          fee: trade.fee
        })),
        summary.positions.map((position) => ({
          realizedPnl: position.realizedPnl
        }))
      );
      const session = sessionLookup.get(summary.sessionId)!;
      const strategyBreakdown = buildPerformanceBreakdown(
        summary.positions.map((position) => ({
          realizedPnl: position.realizedPnl,
          feesPaid: position.feesPaid,
          key: strategy.key,
          label: strategy.name
        }))
      );
      const entryBreakdown = buildPerformanceBreakdown(
        summary.positions.map((position) => ({
          realizedPnl: position.realizedPnl,
          feesPaid: position.feesPaid,
          key: position.entryReasonCode,
          label: position.entryReasonText
        }))
      );
      const exitBreakdown = buildPerformanceBreakdown(
        summary.positions.map((position) => ({
          realizedPnl: position.realizedPnl,
          feesPaid: position.feesPaid,
          key: position.exitReasonCode,
          label: position.exitReasonText
        }))
      );

      return {
        id: `daily-${summary.sessionId}-${summary.dateKey}`,
        botId: bot.id,
        sessionId: summary.sessionId,
        scopeKey: `${bot.id}:${summary.sessionId}:${summary.dateKey}`,
        dateKey: summary.dateKey,
        timezone: timeZone,
        sessionName: session.name,
        runLabel: session.runLabel,
        tradeCount: metrics.tradeCount,
        closedPositionCount: metrics.closedPositionCount,
        winCount: metrics.winCount,
        lossCount: metrics.lossCount,
        grossPnl: metrics.grossPnl,
        netPnl: metrics.netPnl,
        totalFees: metrics.totalFees,
        totalWinningPnl: metrics.totalWinningPnl,
        totalLosingPnl: metrics.totalLosingPnl,
        bestTrade: metrics.bestTrade,
        worstTrade: metrics.worstTrade,
        strategyPerformance: strategyBreakdown,
        entryReasonPerformance: entryBreakdown,
        exitReasonPerformance: exitBreakdown
      };
    })
  });

  await prisma.bot.update({
    where: {
      id: bot.id
    },
    data: {
      heartbeatAt: new Date(),
      status: "RUNNING",
      lastDailyReportSentAt: daysAgo(0, 1, 25),
      lastWeeklyReportSentAt: daysAgo(2, 1, 25),
      metadata: {
        activeSessionId: activeSession.id
      }
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
