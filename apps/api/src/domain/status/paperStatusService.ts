import type { PaperEventView, PaperStatusResponse, PositionView, TradeView, WorkerStatusResponse } from "@fomo/shared";

import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { resolveBot } from "../../routes/helpers.js";
import { AccountStateManager } from "../account/accountStateManager.js";
import { mapPaperEventLog } from "../events/paperEventService.js";
import { normalizeRuntimeMetadata } from "../runtime/runtimeMetadata.js";
import { deriveSystemStatus } from "../runtime/systemStatus.js";
import { StrategyControlService } from "../strategy/strategyControlService.js";

export class PaperStatusService {
  private readonly accountStateManager = new AccountStateManager();
  private readonly strategyControlService = new StrategyControlService();

  async buildWorkerStatus(botId?: string): Promise<WorkerStatusResponse> {
    const bot = await resolveBot(botId);
    const metadata = normalizeRuntimeMetadata(bot.metadata);
    const [strategyControl, openPositionCount, watchedStrategies] = await Promise.all([
      this.strategyControlService.build(bot.id, "today", "profit"),
      prisma.position.count({
        where: {
          botId: bot.id,
          status: "OPEN"
        }
      }),
      prisma.strategy.findMany({
        where: {
          botId: bot.id,
          status: {
            not: "DISABLED"
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      })
    ]);

    const system = deriveSystemStatus({
      botStatus: bot.status,
      lastHeartbeatAt: bot.heartbeatAt,
      lastErrorAt: bot.lastErrorAt,
      lastMarketUpdateAt: metadata.system.lastMarketUpdateAt,
      workerIntervalMs: env.WORKER_INTERVAL_MS,
      activeStrategyCount: strategyControl.execution.activeStrategyIds.length,
      openPositionCount,
      killSwitchEnabled: metadata.killSwitch.enabled,
      killSwitchMode: metadata.killSwitch.mode,
      riskTriggered: metadata.risk.isTriggered,
      ...(env.MARKET_DATA_PROVIDER === "demo" ? { fallbackMarketStatus: "DEMO" as const } : {})
    });

    return {
      botId: bot.id,
      mode: bot.mode === "real" ? "real" : "paper",
      status: bot.status,
      exchangeKey: bot.exchangeKey,
      workerIntervalMs: env.WORKER_INTERVAL_MS,
      workerStatus: system.workerStatus,
      marketDataStatus: system.marketDataStatus,
      currentAction: system.currentAction,
      activeStrategyIds: strategyControl.execution.activeStrategyIds,
      runningStrategyIds: strategyControl.execution.runningStrategyIds,
      watchedSymbols: [...new Set(watchedStrategies.map((strategy) => strategy.symbol))],
      lastHeartbeatAt: bot.heartbeatAt?.toISOString() ?? null,
      lastWorkerTickAt: metadata.system.lastWorkerTickAt,
      lastMarketUpdateAt: metadata.system.lastMarketUpdateAt,
      lastStrategyEvaluationAt: metadata.system.lastStrategyEvaluationAt,
      lastTradeExecutionAt: metadata.system.lastTradeExecutionAt,
      lastTradeSymbol: metadata.system.lastTradeSymbol,
      lastErrorAt: bot.lastErrorAt?.toISOString() ?? null,
      lastTelegramSentAt: metadata.system.lastTelegramSentAt,
      lastTelegramStatus: metadata.system.lastTelegramStatus,
      lastTelegramEventType: metadata.system.lastTelegramEventType,
      lastTelegramError: metadata.system.lastTelegramError
    };
  }

  async buildPaperStatus(botId?: string): Promise<PaperStatusResponse> {
    const bot = await resolveBot(botId);
    const metadata = normalizeRuntimeMetadata(bot.metadata);
    const [worker, account, openPositionCount] = await Promise.all([
      this.buildWorkerStatus(bot.id),
      this.accountStateManager.build(bot.id),
      prisma.position.count({
        where: {
          botId: bot.id,
          status: "OPEN"
        }
      })
    ]);

    return {
      botId: bot.id,
      name: bot.name,
      mode: bot.mode === "real" ? "real" : "paper",
      status: bot.status,
      exchangeKey: bot.exchangeKey,
      paperBalance: bot.paperBalance,
      reservedBalance: account.reservedBalance,
      equity: account.equity,
      totalPnlUsd: account.totalPnlUsd,
      totalPnlPct: account.totalPnlPct,
      todayPnlUsd: account.todayPnlUsd,
      todayPnlPct: account.todayPnlPct,
      openPositionCount,
      lastTradeAt: metadata.system.lastTradeExecutionAt,
      lastTradeSymbol: metadata.system.lastTradeSymbol,
      lastEvaluationAt: metadata.system.lastStrategyEvaluationAt,
      lastEvaluationSymbol: metadata.system.lastEvaluationSymbol,
      lastSessionId: metadata.system.lastSessionId,
      activeStrategyIds: worker.activeStrategyIds,
      watchedSymbols: worker.watchedSymbols,
      worker
    };
  }

  async listPaperEvents(botId?: string, limit = 50): Promise<PaperEventView[]> {
    const bot = await resolveBot(botId);
    const logs = await prisma.systemLog.findMany({
      where: {
        botId: bot.id,
        source: "paper-event"
      },
      orderBy: {
        createdAt: "desc"
      },
      take: limit
    });

    return logs
      .map((log) => mapPaperEventLog(log))
      .filter((event): event is PaperEventView => Boolean(event))
      .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  }

  async listPaperTrades(botId?: string, limit = 50): Promise<TradeView[]> {
    const bot = await resolveBot(botId);
    const [trades, strategyControl] = await Promise.all([
      prisma.trade.findMany({
        where: {
          botId: bot.id
        },
        include: {
          session: true,
          strategy: true
        },
        orderBy: {
          executedAt: "desc"
        },
        take: limit
      }),
      this.strategyControlService.build(bot.id)
    ]);
    const strategyCodeMap = new Map(strategyControl.strategies.map((strategy) => [strategy.id, strategy.code]));

    return trades.map((trade) => ({
      id: trade.id,
      symbol: trade.symbol,
      action: trade.action,
      price: trade.price,
      quantity: trade.quantity,
      grossPnl: trade.grossPnl,
      realizedPnl: trade.realizedPnl,
      fee: trade.fee,
      feeRate: trade.feeRate,
      orderRole: trade.orderRole,
      slippageBps: trade.slippageBps,
      reasonCode: trade.reasonCode,
      reasonText: trade.reasonText,
      reasonMeta: (trade.reasonMeta as Record<string, unknown>) ?? {},
      strategyId: trade.strategyId ?? null,
      strategyCode: trade.strategyId ? strategyCodeMap.get(trade.strategyId) ?? null : null,
      strategyName: trade.strategy?.name ?? null,
      sessionName: trade.session?.name ?? null,
      executedAt: trade.executedAt.toISOString()
    }));
  }

  async listPaperPositions(botId?: string, status?: "OPEN" | "CLOSED"): Promise<PositionView[]> {
    const bot = await resolveBot(botId);
    const [positions, strategyControl] = await Promise.all([
      prisma.position.findMany({
        where: {
          botId: bot.id,
          ...(status ? { status } : {})
        },
        include: {
          session: true,
          strategy: true
        },
        orderBy: {
          openedAt: "desc"
        }
      }),
      this.strategyControlService.build(bot.id)
    ]);
    const strategyCodeMap = new Map(strategyControl.strategies.map((strategy) => [strategy.id, strategy.code]));

    return Promise.all(
      positions.map(async (position) => {
        const latestCandle = await prisma.marketCandle.findFirst({
          where: {
            symbol: position.symbol,
            timeframe: position.strategy?.timeframe ?? "1m"
          },
          orderBy: {
            openTime: "desc"
          }
        });
        const currentPrice = latestCandle?.close ?? position.entryPrice;
        const currentValue = Number((currentPrice * position.quantity).toFixed(2));
        const unrealizedPnl = position.status === "OPEN" ? Number((currentValue - position.entryValue).toFixed(2)) : 0;

        return {
          id: position.id,
          symbol: position.symbol,
          side: position.side as PositionView["side"],
          status: position.status,
          quantity: position.quantity,
          entryPrice: position.entryPrice,
          currentPrice,
          realizedPnl: position.realizedPnl,
          unrealizedPnl,
          feesPaid: position.feesPaid,
          openedAt: position.openedAt.toISOString(),
          closedAt: position.closedAt?.toISOString() ?? null,
          entryReasonCode: position.entryReasonCode,
          entryReasonText: position.entryReasonText,
          exitReasonCode: position.exitReasonCode ?? null,
          exitReasonText: position.exitReasonText ?? null,
          strategyId: position.strategyId ?? null,
          strategyCode: position.strategyId ? strategyCodeMap.get(position.strategyId) ?? null : null,
          strategyName: position.strategy?.name ?? null,
          sessionName: position.session?.name ?? null
        };
      })
    );
  }
}
