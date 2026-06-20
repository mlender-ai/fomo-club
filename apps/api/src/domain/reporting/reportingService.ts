import type {
  DailyReportResponse,
  DashboardSummaryResponse,
  PerformanceBreakdownView,
  PositionView,
  ReportMetricsView,
  SessionCompareResponse,
  StrategySessionView,
  TradeView,
  WeeklyReportResponse
} from "@fomo/shared";

import { env } from "../../config/env.js";
import { toInputJsonValue } from "../../lib/json.js";
import { prisma } from "../../lib/prisma.js";
import { formatDateKey, listDateKeys, recentWindowStart } from "../../lib/time.js";
import { AccountStateManager } from "../account/accountStateManager.js";
import { estimateRoundTripCostPct } from "../execution/feeModel.js";
import { normalizeRuntimeMetadata } from "../runtime/runtimeMetadata.js";
import { deriveSystemStatus } from "../runtime/systemStatus.js";
import { StrategyControlService } from "../strategy/strategyControlService.js";
import { createReportGenerator } from "./reportGeneratorFactory.js";
import {
  buildPerformanceBreakdown,
  buildReportMetrics,
  buildSessionViews,
  coercePerformanceBreakdowns,
  mergePerformanceBreakdowns,
  mergeReportMetrics
} from "./reportMetrics.js";

type BotRecord = Awaited<ReturnType<typeof prisma.bot.findFirstOrThrow>>;
type SessionRecord = Awaited<ReturnType<typeof prisma.strategySession.findMany>>[number];
type StrategyRecord = Awaited<ReturnType<typeof prisma.strategy.findMany>>[number];
type TradeRecord = Awaited<ReturnType<typeof prisma.trade.findMany>>[number];
type PositionRecord = Awaited<ReturnType<typeof prisma.position.findMany>>[number];

interface DailySummarySnapshot {
  date: string;
  timezone: string;
  source: "stored" | "computed";
  metrics: ReportMetricsView;
  strategyPerformance: PerformanceBreakdownView[];
  entryReasonPerformance: PerformanceBreakdownView[];
  exitReasonPerformance: PerformanceBreakdownView[];
}

function mapTrade(
  trade: TradeRecord & {
    session: SessionRecord | null;
    strategy: StrategyRecord | null;
  },
  strategyCodeMap: Map<string, DashboardSummaryResponse["strategies"][number]["code"]>
): TradeView {
  return {
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
  };
}

function createScopeKey(botId: string, sessionId: string | null, dateKey: string): string {
  return `${botId}:${sessionId ?? "all"}:${dateKey}`;
}

export class ReportingService {
  private readonly reportGenerator = createReportGenerator();
  private readonly accountStateManager = new AccountStateManager();
  private readonly strategyControlService = new StrategyControlService();

  async resolveScope(botId?: string, sessionId?: string) {
    const bot = botId
      ? await prisma.bot.findUniqueOrThrow({
          where: {
            id: botId
          }
        })
      : await prisma.bot.findFirstOrThrow({
          orderBy: {
            createdAt: "asc"
          }
        });
    const sessions = await prisma.strategySession.findMany({
      where: {
        botId: bot.id
      },
      orderBy: {
        startedAt: "desc"
      },
      take: 12
    });

    const currentSession =
      (sessionId
        ? await prisma.strategySession.findUnique({
            where: {
              id: sessionId
            }
          })
        : null) ??
      sessions.find((session) => session.status === "ACTIVE") ??
      sessions[0] ??
      null;

    return {
      bot,
      currentSession,
      sessions
    };
  }

  async buildDashboardSummary(botId?: string, sessionId?: string): Promise<DashboardSummaryResponse> {
    const { bot, currentSession, sessions } = await this.resolveScope(botId, sessionId);
    const sessionWhere = currentSession ? { sessionId: currentSession.id } : {};
    const tradeHorizonStart = recentWindowStart(30);
    const sessionViews = await this.buildSessionViewsForScope(bot.id, sessions, currentSession?.id ?? null);
    const metadata = normalizeRuntimeMetadata(bot.metadata);

    const [trades, positions, recentLogs, account, strategyControl] = await Promise.all([
      prisma.trade.findMany({
        where: {
          botId: bot.id,
          executedAt: {
            gte: tradeHorizonStart
          },
          ...sessionWhere
        },
        include: {
          session: true,
          strategy: true
        },
        orderBy: {
          executedAt: "desc"
        }
      }),
      prisma.position.findMany({
        where: {
          botId: bot.id,
          ...sessionWhere
        },
        include: {
          strategy: true,
          session: true
        },
        orderBy: {
          openedAt: "desc"
        }
      }),
      prisma.systemLog.findMany({
        where: {
          botId: bot.id
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 20
      }),
      this.accountStateManager.build(bot.id, currentSession?.id ?? undefined),
      this.strategyControlService.build(bot.id, "today", "profit")
    ]);

    const dateKey = formatDateKey(new Date(), env.REPORT_TIMEZONE);
    const todayTrades = trades.filter((trade) => formatDateKey(trade.executedAt, env.REPORT_TIMEZONE) === dateKey);
    const openPositionsRaw = positions.filter((position) => position.status === "OPEN");
    const closedPositions = positions.filter((position) => position.status === "CLOSED" && position.closedAt !== null);
    const todayClosedPositions = closedPositions.filter(
      (position) => position.closedAt && formatDateKey(position.closedAt, env.REPORT_TIMEZONE) === dateKey
    );
    const strategyCodeMap = new Map(strategyControl.strategies.map((strategy) => [strategy.id, strategy.code]));
    const openPositions = await this.mapOpenPositions(openPositionsRaw, strategyCodeMap);
    const recentTrades = trades.slice(0, 15).map((trade) => mapTrade(trade, strategyCodeMap));
    const totalMetrics = buildReportMetrics(
      trades.map((trade) => ({
        realizedPnl: trade.realizedPnl,
        grossPnl: trade.grossPnl,
        fee: trade.fee
      })),
      closedPositions.map((position) => ({
        realizedPnl: position.realizedPnl
      }))
    );
    const todayMetrics = buildReportMetrics(
      todayTrades.map((trade) => ({
        realizedPnl: trade.realizedPnl,
        grossPnl: trade.grossPnl,
        fee: trade.fee
      })),
      todayClosedPositions.map((position) => ({
        realizedPnl: position.realizedPnl
      }))
    );
    const strategyPerformance = buildPerformanceBreakdown(
      closedPositions,
      (position) => position.strategyId ?? position.symbol,
      (position) => position.strategy?.name ?? position.symbol
    );
    const entryReasonPerformance = buildPerformanceBreakdown(
      closedPositions,
      (position) => position.entryReasonCode,
      (position) => position.entryReasonText
    );
    const exitReasonPerformance = buildPerformanceBreakdown(
      closedPositions.filter((position) => position.exitReasonCode !== null),
      (position) => position.exitReasonCode ?? "UNKNOWN",
      (position) => position.exitReasonText ?? "Unknown exit reason"
    );
    const activeStrategyCount = strategyControl.execution.activeStrategyIds.length;
    const system = deriveSystemStatus({
      botStatus: bot.status,
      lastHeartbeatAt: bot.heartbeatAt,
      lastErrorAt: bot.lastErrorAt,
      lastMarketUpdateAt: metadata.system.lastMarketUpdateAt,
      workerIntervalMs: env.WORKER_INTERVAL_MS,
      activeStrategyCount,
      openPositionCount: openPositions.length,
      killSwitchEnabled: metadata.killSwitch.enabled,
      killSwitchMode: metadata.killSwitch.mode,
      riskTriggered: metadata.risk.isTriggered
    });

    return {
      summary: {
        todayNetPnl: todayMetrics.netPnl,
        totalNetPnl: totalMetrics.netPnl,
        todayFees: todayMetrics.totalFees,
        totalFees: totalMetrics.totalFees,
        winRate: totalMetrics.winRate,
        todayTradeCount: todayMetrics.tradeCount,
        openPositionCount: openPositions.length,
        cashBalance: account.cashBalance,
        totalEquity: account.equity
      },
      account,
      feeModel: {
        makerFeeRate: bot.makerFeeRate,
        takerFeeRate: bot.takerFeeRate,
        entryOrderRole: bot.entryOrderRole,
        exitOrderRole: bot.exitOrderRole,
        slippageBps: bot.slippageBps,
        estimatedRoundTripCostPct: estimateRoundTripCostPct(bot)
      },
      openPositions,
      recentTrades,
      strategies: strategyControl.strategies,
      strategyPerformance,
      strategyPerformanceByPeriod: strategyControl.performanceByPeriod,
      entryReasonPerformance,
      exitReasonPerformance,
      currentSession: sessionViews.find((item) => item.isCurrent) ?? null,
      sessions: sessionViews,
      recentLogs: recentLogs.map((log) => ({
        id: log.id,
        level: log.level,
        source: log.source,
        message: log.message,
        context: (log.context as Record<string, unknown> | null) ?? null,
        createdAt: log.createdAt.toISOString()
      })),
      system
    };
  }

  async refreshCurrentDailySummary(botId: string, sessionId?: string) {
    const { bot, currentSession } = await this.resolveScope(botId, sessionId);

    return this.getOrBuildDailySummary(bot, currentSession, formatDateKey(new Date(), env.REPORT_TIMEZONE));
  }

  async buildDailyReport(botId?: string, sessionId?: string, dateKey = formatDateKey(new Date(), env.REPORT_TIMEZONE)): Promise<DailyReportResponse> {
    const { bot, currentSession, sessions } = await this.resolveScope(botId, sessionId);
    const sessionViews = await this.buildSessionViewsForScope(bot.id, sessions, currentSession?.id ?? null);
    const summary = await this.getOrBuildDailySummary(bot, currentSession, dateKey);
    const sessionView = sessionViews.find((item) => item.id === currentSession?.id) ?? null;
    const baseReport = {
      date: summary.date,
      timezone: summary.timezone,
      session: sessionView,
      source: summary.source,
      metrics: summary.metrics,
      strategyPerformance: summary.strategyPerformance,
      entryReasonPerformance: summary.entryReasonPerformance,
      exitReasonPerformance: summary.exitReasonPerformance
    };

    return {
      ...baseReport,
      report: this.reportGenerator.generateDaily(baseReport)
    };
  }

  async buildWeeklyReport(
    botId?: string,
    sessionId?: string,
    endDateKey = formatDateKey(new Date(), env.REPORT_TIMEZONE)
  ): Promise<WeeklyReportResponse> {
    const { bot, currentSession, sessions } = await this.resolveScope(botId, sessionId);
    const sessionViews = await this.buildSessionViewsForScope(bot.id, sessions, currentSession?.id ?? null);
    const dailySnapshots = await Promise.all(
      listDateKeys(endDateKey, 7, env.REPORT_TIMEZONE).map((dateKey) => this.getOrBuildDailySummary(bot, currentSession, dateKey))
    );
    const metrics = mergeReportMetrics(dailySnapshots.map((item) => item.metrics));
    const strategyPerformance = mergePerformanceBreakdowns(dailySnapshots.map((item) => item.strategyPerformance));
    const entryReasonPerformance = mergePerformanceBreakdowns(dailySnapshots.map((item) => item.entryReasonPerformance));
    const exitReasonPerformance = mergePerformanceBreakdowns(dailySnapshots.map((item) => item.exitReasonPerformance));
    const baseReport = {
      periodStart: dailySnapshots[0]?.date ?? endDateKey,
      periodEnd: dailySnapshots[dailySnapshots.length - 1]?.date ?? endDateKey,
      timezone: env.REPORT_TIMEZONE,
      session: sessionViews.find((item) => item.id === currentSession?.id) ?? null,
      metrics,
      dailySeries: dailySnapshots.map((item) => ({
        date: item.date,
        tradeCount: item.metrics.tradeCount,
        netPnl: item.metrics.netPnl,
        totalFees: item.metrics.totalFees,
        winRate: item.metrics.winRate
      })),
      strategyPerformance,
      entryReasonPerformance,
      exitReasonPerformance
    };

    return {
      ...baseReport,
      report: this.reportGenerator.generateWeekly(baseReport)
    };
  }

  async buildSessionCompareReport(botId?: string, sessionId?: string, baselineSessionId?: string, limit = 4): Promise<SessionCompareResponse> {
    const { bot, currentSession, sessions } = await this.resolveScope(botId, sessionId);
    const candidateSessions = sessions.slice(0, Math.max(limit, 2));
    const comparisons = await this.buildSessionComparisonRows(bot.id, candidateSessions, currentSession?.id ?? null, baselineSessionId);
    const currentSessionView = comparisons.find((row) => row.session.id === currentSession?.id)?.session ?? null;
    const baselineSessionView =
      (baselineSessionId ? comparisons.find((row) => row.session.id === baselineSessionId)?.session : null) ??
      comparisons.find((row) => row.session.id !== currentSession?.id)?.session ??
      comparisons[0]?.session ??
      null;
    const baseReport = {
      currentSession: currentSessionView,
      baselineSession: baselineSessionView,
      comparisons
    };

    return {
      ...baseReport,
      report: this.reportGenerator.generateSessionCompare(baseReport)
    };
  }

  private async getOrBuildDailySummary(bot: BotRecord, currentSession: SessionRecord | null, dateKey: string): Promise<DailySummarySnapshot> {
    const scopeKey = createScopeKey(bot.id, currentSession?.id ?? null, dateKey);
    const existing = await prisma.dailySummary.findUnique({
      where: {
        scopeKey
      }
    });
    const todayKey = formatDateKey(new Date(), env.REPORT_TIMEZONE);

    if (existing && dateKey !== todayKey) {
      return this.mapDailySummaryRow(existing);
    }

    const computed = await this.computeDailySummary(bot, currentSession, dateKey);

    await prisma.dailySummary.upsert({
      where: {
        scopeKey
      },
      update: {
        sessionName: currentSession?.name ?? null,
        runLabel: currentSession?.runLabel ?? null,
        timezone: computed.timezone,
        tradeCount: computed.metrics.tradeCount,
        closedPositionCount: computed.metrics.closedPositionCount,
        winCount: computed.metrics.winCount,
        lossCount: computed.metrics.lossCount,
        grossPnl: computed.metrics.grossPnl,
        netPnl: computed.metrics.netPnl,
        totalFees: computed.metrics.totalFees,
        totalWinningPnl: computed.metrics.totalWinningPnl,
        totalLosingPnl: computed.metrics.totalLosingPnl,
        bestTrade: computed.metrics.bestTrade,
        worstTrade: computed.metrics.worstTrade,
        strategyPerformance: toInputJsonValue(computed.strategyPerformance),
        entryReasonPerformance: toInputJsonValue(computed.entryReasonPerformance),
        exitReasonPerformance: toInputJsonValue(computed.exitReasonPerformance)
      },
      create: {
        botId: bot.id,
        sessionId: currentSession?.id ?? null,
        scopeKey,
        dateKey,
        timezone: computed.timezone,
        sessionName: currentSession?.name ?? null,
        runLabel: currentSession?.runLabel ?? null,
        tradeCount: computed.metrics.tradeCount,
        closedPositionCount: computed.metrics.closedPositionCount,
        winCount: computed.metrics.winCount,
        lossCount: computed.metrics.lossCount,
        grossPnl: computed.metrics.grossPnl,
        netPnl: computed.metrics.netPnl,
        totalFees: computed.metrics.totalFees,
        totalWinningPnl: computed.metrics.totalWinningPnl,
        totalLosingPnl: computed.metrics.totalLosingPnl,
        bestTrade: computed.metrics.bestTrade,
        worstTrade: computed.metrics.worstTrade,
        strategyPerformance: toInputJsonValue(computed.strategyPerformance),
        entryReasonPerformance: toInputJsonValue(computed.entryReasonPerformance),
        exitReasonPerformance: toInputJsonValue(computed.exitReasonPerformance)
      }
    });

    return computed;
  }

  private async computeDailySummary(bot: BotRecord, currentSession: SessionRecord | null, dateKey: string): Promise<DailySummarySnapshot> {
    const scopeWhere = currentSession ? { sessionId: currentSession.id } : {};
    const horizonStart = recentWindowStart(120);
    const [trades, positions] = await Promise.all([
      prisma.trade.findMany({
        where: {
          botId: bot.id,
          executedAt: {
            gte: horizonStart
          },
          ...scopeWhere
        }
      }),
      prisma.position.findMany({
        where: {
          botId: bot.id,
          status: "CLOSED",
          closedAt: {
            gte: horizonStart
          },
          ...scopeWhere
        },
        include: {
          strategy: true
        }
      })
    ]);

    const dailyTrades = trades.filter((trade) => formatDateKey(trade.executedAt, env.REPORT_TIMEZONE) === dateKey);
    const dailyClosedPositions = positions.filter(
      (position) => position.closedAt && formatDateKey(position.closedAt, env.REPORT_TIMEZONE) === dateKey
    );
    const metrics = buildReportMetrics(
      dailyTrades.map((trade) => ({
        realizedPnl: trade.realizedPnl,
        grossPnl: trade.grossPnl,
        fee: trade.fee
      })),
      dailyClosedPositions.map((position) => ({
        realizedPnl: position.realizedPnl
      }))
    );

    return {
      date: dateKey,
      timezone: env.REPORT_TIMEZONE,
      source: "computed",
      metrics,
      strategyPerformance: buildPerformanceBreakdown(
        dailyClosedPositions,
        (position) => position.strategyId ?? position.symbol,
        (position) => position.strategy?.name ?? position.symbol
      ),
      entryReasonPerformance: buildPerformanceBreakdown(
        dailyClosedPositions,
        (position) => position.entryReasonCode,
        (position) => position.entryReasonText
      ),
      exitReasonPerformance: buildPerformanceBreakdown(
        dailyClosedPositions.filter((position) => position.exitReasonCode !== null),
        (position) => position.exitReasonCode ?? "UNKNOWN",
        (position) => position.exitReasonText ?? "Unknown exit reason"
      )
    };
  }

  private mapDailySummaryRow(row: Awaited<ReturnType<typeof prisma.dailySummary.findUnique>> extends infer T ? Exclude<T, null> : never): DailySummarySnapshot {
    const metrics: ReportMetricsView = {
      tradeCount: row.tradeCount,
      closedPositionCount: row.closedPositionCount,
      winCount: row.winCount,
      lossCount: row.lossCount,
      winRate: row.closedPositionCount === 0 ? 0 : Number(((row.winCount / row.closedPositionCount) * 100).toFixed(1)),
      grossPnl: row.grossPnl,
      netPnl: row.netPnl,
      totalFees: row.totalFees,
      totalWinningPnl: row.totalWinningPnl,
      totalLosingPnl: row.totalLosingPnl,
      avgNetPnlPerTrade: row.tradeCount === 0 ? 0 : Number((row.netPnl / row.tradeCount).toFixed(2)),
      avgWin: row.winCount === 0 ? 0 : Number((row.totalWinningPnl / row.winCount).toFixed(2)),
      avgLoss: row.lossCount === 0 ? 0 : Number((row.totalLosingPnl / row.lossCount).toFixed(2)),
      bestTrade: row.bestTrade,
      worstTrade: row.worstTrade,
      expectancy: row.closedPositionCount === 0 ? 0 : Number((row.netPnl / row.closedPositionCount).toFixed(2))
    };

    return {
      date: row.dateKey,
      timezone: row.timezone,
      source: "stored",
      metrics,
      strategyPerformance: coercePerformanceBreakdowns(row.strategyPerformance),
      entryReasonPerformance: coercePerformanceBreakdowns(row.entryReasonPerformance),
      exitReasonPerformance: coercePerformanceBreakdowns(row.exitReasonPerformance)
    };
  }

  private async buildSessionViewsForScope(botId: string, sessions: SessionRecord[], currentSessionId: string | null): Promise<StrategySessionView[]> {
    const sessionMetrics = await this.getSessionMetrics(botId, sessions.map((session) => session.id));

    return buildSessionViews(sessions, sessionMetrics, currentSessionId);
  }

  private async getSessionMetrics(botId: string, sessionIds: string[]): Promise<Map<string, ReportMetricsView>> {
    if (sessionIds.length === 0) {
      return new Map();
    }

    const [trades, positions] = await Promise.all([
      prisma.trade.findMany({
        where: {
          botId,
          sessionId: {
            in: sessionIds
          }
        }
      }),
      prisma.position.findMany({
        where: {
          botId,
          sessionId: {
            in: sessionIds
          },
          status: "CLOSED"
        }
      })
    ]);

    return new Map(
      sessionIds.map((sessionId) => {
        const sessionTrades = trades.filter((trade) => trade.sessionId === sessionId);
        const sessionPositions = positions.filter((position) => position.sessionId === sessionId);

        return [
          sessionId,
          buildReportMetrics(
            sessionTrades.map((trade) => ({
              realizedPnl: trade.realizedPnl,
              grossPnl: trade.grossPnl,
              fee: trade.fee
            })),
            sessionPositions.map((position) => ({
              realizedPnl: position.realizedPnl
            }))
          )
        ];
      })
    );
  }

  private async buildSessionComparisonRows(
    botId: string,
    sessions: SessionRecord[],
    currentSessionId: string | null,
    baselineSessionId?: string
  ): Promise<SessionCompareResponse["comparisons"]> {
    if (sessions.length === 0) {
      return [];
    }

    const [trades, positions] = await Promise.all([
      prisma.trade.findMany({
        where: {
          botId,
          sessionId: {
            in: sessions.map((session) => session.id)
          }
        }
      }),
      prisma.position.findMany({
        where: {
          botId,
          sessionId: {
            in: sessions.map((session) => session.id)
          },
          status: "CLOSED"
        }
      })
    ]);
    const sessionMetrics = await this.getSessionMetrics(botId, sessions.map((session) => session.id));
    const sessionViews = buildSessionViews(sessions, sessionMetrics, currentSessionId);
    const baselineView =
      (baselineSessionId ? sessionViews.find((session) => session.id === baselineSessionId) : null) ??
      sessionViews.find((session) => session.id !== currentSessionId) ??
      sessionViews[0];
    const baselineMetrics = baselineView ? sessionMetrics.get(baselineView.id) : undefined;

    return sessionViews.map((sessionView) => {
      const metrics = sessionMetrics.get(sessionView.id)!;
      const sessionPositions = positions.filter((position) => position.sessionId === sessionView.id);
      const entryBreakdown = buildPerformanceBreakdown(
        sessionPositions,
        (position) => position.entryReasonCode,
        (position) => position.entryReasonText
      );
      const exitBreakdown = buildPerformanceBreakdown(
        sessionPositions.filter((position) => position.exitReasonCode !== null),
        (position) => position.exitReasonCode ?? "UNKNOWN",
        (position) => position.exitReasonText ?? "Unknown exit reason"
      );

      return {
        session: sessionView,
        metrics,
        deltaNetPnl: Number((metrics.netPnl - (baselineMetrics?.netPnl ?? 0)).toFixed(2)),
        deltaWinRate: Number((metrics.winRate - (baselineMetrics?.winRate ?? 0)).toFixed(1)),
        deltaFees: Number((metrics.totalFees - (baselineMetrics?.totalFees ?? 0)).toFixed(2)),
        deltaExpectancy: Number((metrics.expectancy - (baselineMetrics?.expectancy ?? 0)).toFixed(2)),
        topEntryReason: entryBreakdown[0] ?? null,
        topExitReason: exitBreakdown[0] ?? null
      };
    });
  }

  private async mapOpenPositions(
    positions: (PositionRecord & { strategy: { id: string; name: string; timeframe: string } | null; session: SessionRecord | null })[],
    strategyCodeMap: Map<string, DashboardSummaryResponse["openPositions"][number]["strategyCode"]>
  ): Promise<PositionView[]> {
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
        const currentPrice = latestCandle?.close ?? null;
        const unrealizedPnl =
          currentPrice === null ? 0 : Number(((currentPrice - position.entryPrice) * position.quantity).toFixed(2));

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
