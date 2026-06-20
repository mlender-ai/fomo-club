import type {
  PeriodFilter,
  StrategyCode,
  StrategyControlResponse,
  StrategyPerformanceRow,
  StrategySortKey,
  StrategyView
} from "@fomo/shared";

import { prisma } from "../../lib/prisma.js";
import { recentWindowStart } from "../../lib/time.js";
import { resolveBot } from "../../routes/helpers.js";
import { AccountStateManager } from "../account/accountStateManager.js";
import { normalizeRuntimeMetadata } from "../runtime/runtimeMetadata.js";

const strategyCodeFallbacks: StrategyCode[] = ["A", "B", "C"];

function periodStart(period: PeriodFilter) {
  if (period === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (period === "7d") {
    return recentWindowStart(7);
  }

  return null;
}

function sortRows(rows: StrategyPerformanceRow[], sortBy: StrategySortKey) {
  return [...rows].sort((left, right) => {
    if (sortBy === "winRate") {
      return right.winRate - left.winRate || right.netPnl - left.netPnl;
    }

    return right.netPnl - left.netPnl || right.winRate - left.winRate;
  });
}

export class StrategyControlService {
  private readonly accountStateManager = new AccountStateManager();

  async build(botId?: string, period: PeriodFilter = "today", sortBy: StrategySortKey = "profit"): Promise<StrategyControlResponse> {
    const bot = await resolveBot(botId);
    const metadata = normalizeRuntimeMetadata(bot.metadata);
    const [strategies, trades, account] = await Promise.all([
      prisma.strategy.findMany({
        where: {
          botId: bot.id
        },
        orderBy: {
          createdAt: "asc"
        }
      }),
      prisma.trade.findMany({
        where: {
          botId: bot.id
        },
        orderBy: {
          executedAt: "desc"
        }
      }),
      this.accountStateManager.build(bot.id)
    ]);

    const strategyViews: StrategyView[] = strategies.map((strategy, index) => {
      const code = metadata.strategyCodes[strategy.id] ?? strategyCodeFallbacks[index] ?? "A";
      const activeIds = metadata.execution.activeStrategyIds.length > 0 ? metadata.execution.activeStrategyIds : strategies.filter((item) => item.status !== "DISABLED").map((item) => item.id);
      const primaryId = metadata.execution.primaryStrategyId ?? strategies[0]?.id ?? null;

      return {
        id: strategy.id,
        code,
        key: strategy.key as StrategyView["key"],
        name: strategy.name,
        description: strategy.description ?? `${code} 전략`,
        symbol: strategy.symbol,
        timeframe: strategy.timeframe,
        status: strategy.status,
        isPrimary: strategy.id === primaryId,
        isEnabled: activeIds.includes(strategy.id),
        allocationPct: Number(((strategy.config as { allocationPct?: number } | null)?.allocationPct ?? 0).toFixed(4)),
        lastEvaluatedAt: strategy.lastEvaluatedAt?.toISOString() ?? null,
        config: strategy.config as unknown as StrategyView["config"]
      };
    });

    const rowsByPeriod = (["today", "7d", "all"] as PeriodFilter[]).reduce<Record<PeriodFilter, StrategyPerformanceRow[]>>(
      (accumulator, periodKey) => {
        const start = periodStart(periodKey);
        const scopedTrades = start ? trades.filter((trade) => trade.executedAt >= start) : trades;

        const rows = strategyViews.map((strategy) => {
          const strategyTrades = scopedTrades.filter((trade) => trade.strategyId === strategy.id);
          const netPnl = strategyTrades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
          const totalFees = strategyTrades.reduce((sum, trade) => sum + trade.fee, 0);
          const closingTrades = strategyTrades.filter((trade) => trade.realizedPnl !== 0);
          const winCount = closingTrades.filter((trade) => trade.realizedPnl > 0).length;
          const tradeCount = closingTrades.length;
          const winRate = tradeCount === 0 ? 0 : Number(((winCount / tradeCount) * 100).toFixed(1));

          return {
            strategyId: strategy.id,
            code: strategy.code,
            name: strategy.name,
            key: strategy.key,
            status: strategy.status,
            netPnl: Number(netPnl.toFixed(2)),
            pnlPct: account.initialCapital === 0 ? 0 : Number(((netPnl / account.initialCapital) * 100).toFixed(2)),
            winRate,
            tradeCount,
            totalFees: Number(totalFees.toFixed(2)),
            expectancy: tradeCount === 0 ? 0 : Number((netPnl / tradeCount).toFixed(2)),
            equity: Number((account.initialCapital + netPnl).toFixed(2)),
            lastEvaluatedAt: strategy.lastEvaluatedAt
          };
        });

        accumulator[periodKey] = sortRows(rows, sortBy);
        return accumulator;
      },
      {
        today: [],
        "7d": [],
        all: []
      }
    );

    return {
      period,
      sortBy,
      strategies: strategyViews,
      performanceByPeriod: rowsByPeriod,
      execution: {
        allowMultiStrategy: metadata.execution.allowMultiStrategy,
        activeStrategyIds:
          metadata.execution.activeStrategyIds.length > 0
            ? metadata.execution.activeStrategyIds
            : strategyViews.filter((strategy) => strategy.status !== "DISABLED").map((strategy) => strategy.id),
        primaryStrategyId: metadata.execution.primaryStrategyId ?? strategyViews[0]?.id ?? null,
        runningStrategyIds: metadata.execution.runningStrategyIds
      }
    };
  }
}
