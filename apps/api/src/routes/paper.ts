import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { env } from "../config/env.js";
import { getDemoDashboardSummary, getDemoRuntimeState } from "../demo/store.js";
import { PaperStatusService } from "../domain/status/paperStatusService.js";
import { prisma } from "../lib/prisma.js";
import { resolveBot } from "./helpers.js";

const paperStatusService = new PaperStatusService();

function getDemoPaperStatus() {
  const dashboard = getDemoDashboardSummary();
  const runtime = getDemoRuntimeState();

  return {
    botId: "seed-paper-bot",
    name: "demo-paper-bot",
    mode: "paper" as const,
    status: dashboard.system.botStatus,
    exchangeKey: "mock-binance-futures",
    paperBalance: dashboard.account.cashBalance,
    reservedBalance: dashboard.account.reservedBalance,
    equity: dashboard.account.equity,
    totalPnlUsd: dashboard.account.totalPnlUsd,
    totalPnlPct: dashboard.account.totalPnlPct,
    todayPnlUsd: dashboard.account.todayPnlUsd,
    todayPnlPct: dashboard.account.todayPnlPct,
    openPositionCount: dashboard.openPositions.length,
    lastTradeAt: dashboard.recentTrades[0]?.executedAt ?? null,
    lastTradeSymbol: dashboard.recentTrades[0]?.symbol ?? null,
    lastEvaluationAt: runtime.system.lastHeartbeatAt,
    lastEvaluationSymbol: dashboard.strategies[0]?.symbol ?? null,
    lastSessionId: dashboard.currentSession?.id ?? null,
    activeStrategyIds: runtime.execution.activeStrategyIds,
    watchedSymbols: [...new Set(dashboard.strategies.map((strategy) => strategy.symbol))],
    worker: {
      botId: "seed-paper-bot",
      mode: "paper" as const,
      status: dashboard.system.botStatus,
      exchangeKey: "mock-binance-futures",
      workerIntervalMs: env.WORKER_INTERVAL_MS,
      workerStatus: runtime.system.workerStatus,
      marketDataStatus: runtime.system.marketDataStatus,
      currentAction: runtime.system.currentAction,
      activeStrategyIds: runtime.execution.activeStrategyIds,
      runningStrategyIds: runtime.execution.runningStrategyIds,
      watchedSymbols: [...new Set(dashboard.strategies.map((strategy) => strategy.symbol))],
      lastHeartbeatAt: runtime.system.lastHeartbeatAt,
      lastWorkerTickAt: runtime.system.lastHeartbeatAt,
      lastMarketUpdateAt: runtime.system.lastMarketUpdateAt,
      lastStrategyEvaluationAt: runtime.system.lastHeartbeatAt,
      lastTradeExecutionAt: dashboard.recentTrades[0]?.executedAt ?? null,
      lastTradeSymbol: dashboard.recentTrades[0]?.symbol ?? null,
      lastErrorAt: runtime.system.lastErrorAt,
      lastTelegramSentAt: null,
      lastTelegramStatus: null,
      lastTelegramEventType: null,
      lastTelegramError: null
    }
  };
}

export async function registerPaperRoutes(app: FastifyInstance) {
  app.get("/paper/status", async (request) => {
    const query = z
      .object({
        botId: z.string().optional()
      })
      .parse(request.query);

    if (env.LOCAL_DEMO_MODE) {
      return getDemoPaperStatus();
    }

    return paperStatusService.buildPaperStatus(query.botId);
  });

  app.get("/paper/positions", async (request) => {
    const query = z
      .object({
        botId: z.string().optional(),
        status: z.enum(["OPEN", "CLOSED"]).optional()
      })
      .parse(request.query);

    if (env.LOCAL_DEMO_MODE) {
      return getDemoDashboardSummary().openPositions;
    }

    return paperStatusService.listPaperPositions(query.botId, query.status);
  });

  app.get("/paper/trades", async (request) => {
    const query = z
      .object({
        botId: z.string().optional(),
        limit: z.coerce.number().min(1).max(200).default(50)
      })
      .parse(request.query);

    if (env.LOCAL_DEMO_MODE) {
      return getDemoDashboardSummary().recentTrades.slice(0, query.limit);
    }

    return paperStatusService.listPaperTrades(query.botId, query.limit);
  });

  app.get("/paper/logs", async (request) => {
    const query = z
      .object({
        botId: z.string().optional(),
        limit: z.coerce.number().min(1).max(200).default(60)
      })
      .parse(request.query);

    if (env.LOCAL_DEMO_MODE) {
      return [];
    }

    return paperStatusService.listPaperEvents(query.botId, query.limit);
  });

  app.post("/paper/reset", async (request) => {
    const body = z
      .object({
        botId: z.string().optional(),
        balance: z.coerce.number().positive().default(10000)
      })
      .parse(request.body ?? {});

    if (env.LOCAL_DEMO_MODE) {
      return {
        ok: true,
        botId: body.botId ?? "seed-paper-bot",
        balance: body.balance,
        mode: "demo"
      };
    }

    const bot = await resolveBot(body.botId);

    await prisma.$transaction([
      prisma.legacyTrade.deleteMany({
        where: {
          botId: bot.id
        }
      }),
      prisma.position.deleteMany({
        where: {
          botId: bot.id
        }
      }),
      prisma.alert.deleteMany({
        where: {
          botId: bot.id
        }
      }),
      prisma.dailySummary.deleteMany({
        where: {
          botId: bot.id
        }
      }),
      prisma.strategyRun.deleteMany({
        where: {
          botId: bot.id
        }
      }),
      prisma.strategySession.deleteMany({
        where: {
          botId: bot.id
        }
      }),
      prisma.systemLog.deleteMany({
        where: {
          botId: bot.id
        }
      }),
      prisma.bot.update({
        where: {
          id: bot.id
        },
        data: {
          paperBalance: body.balance,
          reservedBalance: 0,
          heartbeatAt: null,
          lastErrorAt: null,
          lastDailyReportSentAt: null,
          lastWeeklyReportSentAt: null,
          status: "RUNNING",
          metadata: {
            initialCapital: body.balance
          }
        }
      })
    ]);

    return {
      ok: true,
      botId: bot.id,
      balance: body.balance
    };
  });
}
