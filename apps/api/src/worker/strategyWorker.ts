import type { StrategyCode, StrategyConfig } from "@fomo/shared";

import { env } from "../config/env.js";
import { AuditLogger } from "../domain/audit/auditLogger.js";
import type { ExchangeAdapter } from "../domain/exchange/types.js";
import { TradeExecutor } from "../domain/execution/tradeExecutor.js";
import { TradeFilter } from "../domain/execution/tradeFilter.js";
import { PaperEventService } from "../domain/events/paperEventService.js";
import type { NotifierPort } from "../domain/notifier/types.js";
import { ReportingService } from "../domain/reporting/reportingService.js";
import { normalizeRuntimeMetadata } from "../domain/runtime/runtimeMetadata.js";
import { SessionService } from "../domain/session/sessionService.js";
import { StrategyEvaluator } from "../domain/strategy/strategyEvaluator.js";
import type { StrategyRuntimeRecord } from "../domain/strategy/types.js";
import { toInputJsonValue } from "../lib/json.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { formatDateKey, getHourInTimeZone, getWeekdayInTimeZone, isSameLocalDate } from "../lib/time.js";

const strategyCodeFallbacks: StrategyCode[] = ["A", "B", "C"];

export class StrategyWorker {
  constructor(
    private readonly marketDataAdapter: ExchangeAdapter,
    private readonly evaluator: StrategyEvaluator,
    private readonly executor: TradeExecutor,
    private readonly notifier: NotifierPort,
    private readonly auditLogger: AuditLogger,
    private readonly eventService: PaperEventService,
    private readonly tradeFilter = new TradeFilter(),
    private readonly sessionService = new SessionService(),
    private readonly reportingService = new ReportingService()
  ) {}

  async runCycle() {
    const bots = await prisma.bot.findMany({
      where: {
        mode: "paper",
        status: {
          not: "STOPPED"
        }
      },
      include: {
        strategies: {
          where: {
            status: "ACTIVE"
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    for (const bot of bots) {
      let activeSessionId: string | null = null;
      let runtimeMetadata = normalizeRuntimeMetadata(bot.metadata);

      await prisma.bot.update({
        where: {
          id: bot.id
        },
        data: {
          heartbeatAt: new Date(),
          status: "RUNNING"
        }
      });

      await this.eventService.publish({
        botId: bot.id,
        eventType: "WORKER_TICK",
        message: `Worker tick started for ${bot.name}`,
        notifyTelegram: false
      });

      for (const [index, strategyRow] of bot.strategies.entries()) {
        const strategy: StrategyRuntimeRecord = {
          id: strategyRow.id,
          key: strategyRow.key,
          code: runtimeMetadata.strategyCodes[strategyRow.id] ?? strategyCodeFallbacks[index] ?? "A",
          name: strategyRow.name,
          symbol: strategyRow.symbol,
          timeframe: strategyRow.timeframe,
          config: strategyRow.config as unknown as StrategyConfig
        };

        try {
          const session = await this.sessionService.getOrCreateActiveSession({
            botId: bot.id,
            strategyConfig: strategy.config
          });
          activeSessionId = session.id;

          const candles = await this.marketDataAdapter.getRecentCandles({
            symbol: strategy.symbol,
            timeframe: strategy.timeframe,
            limit: strategy.config.candleLimit
          });
          const latestCandle = candles.at(-1) ?? null;

          await this.auditLogger.persistCandles(bot.exchangeKey, candles);
          runtimeMetadata = {
            ...runtimeMetadata,
            system: {
              ...runtimeMetadata.system,
              lastMarketUpdateAt: new Date().toISOString(),
              lastSessionId: session.id
            }
          };

          await prisma.bot.update({
            where: {
              id: bot.id
            },
            data: {
              metadata: toInputJsonValue(runtimeMetadata)
            }
          });

          await this.eventService.publish({
            botId: bot.id,
            eventType: "MARKET_DATA_UPDATED",
            symbol: strategy.symbol,
            strategyId: strategy.id,
            strategyCode: strategy.code ?? null,
            sessionId: session.id,
            message: `${strategy.symbol} ${strategy.timeframe} market data refreshed`,
            reasonMeta: latestCandle
              ? {
                  timeframe: strategy.timeframe,
                  candleCount: candles.length,
                  latestClose: latestCandle.close,
                  latestOpenTime: latestCandle.openTime
                }
              : {
                  timeframe: strategy.timeframe,
                  candleCount: candles.length
                }
          });

          const openPosition = await prisma.position.findFirst({
            where: {
              botId: bot.id,
              strategyId: strategy.id,
              sessionId: session.id,
              status: "OPEN"
            }
          });

          const signal = this.evaluator.evaluate(strategy, candles, Boolean(openPosition));

          await this.eventService.publish({
            botId: bot.id,
            eventType: "STRATEGY_EVALUATED",
            symbol: strategy.symbol,
            strategyId: strategy.id,
            strategyCode: strategy.code ?? null,
            sessionId: session.id,
            message: `${strategy.name} evaluated ${strategy.symbol} on ${strategy.timeframe} and returned ${signal.type}`,
            reasonMeta: {
              signalType: signal.type,
              action: signal.action,
              signalPrice: signal.price,
              indicators: signal.indicators,
              reasons: signal.reasons
            },
            timestamp: signal.timestamp
          });

          if (signal.type !== "HOLD") {
            await this.eventService.publish({
              botId: bot.id,
              eventType: "SIGNAL_GENERATED",
              symbol: strategy.symbol,
              strategyId: strategy.id,
              strategyCode: strategy.code ?? null,
              sessionId: session.id,
              message: signal.reasonText,
              reasonMeta: signal.reasonMeta,
              timestamp: signal.timestamp
            });
          }

          if (signal.type === "ENTER") {
            const filterDecision = await this.tradeFilter.evaluateEntry({
              bot: {
                id: bot.id,
                makerFeeRate: bot.makerFeeRate,
                takerFeeRate: bot.takerFeeRate,
                entryOrderRole: bot.entryOrderRole,
                exitOrderRole: bot.exitOrderRole,
                slippageBps: bot.slippageBps
              },
              strategyId: strategy.id,
              sessionId: session.id,
              signal,
              strategyConfig: strategy.config
            });

            if (!filterDecision.allowed) {
              const eventType = filterDecision.reasons.some((reason) => reason.code === "FILTER_COOLDOWN_ACTIVE")
                ? "COOLDOWN_TRIGGERED"
                : "TRADE_SKIPPED";

              await this.auditLogger.logStrategyRun({
                botId: bot.id,
                strategyId: strategy.id,
                sessionId: session.id,
                runLabel: session.runLabel,
                symbol: strategy.symbol,
                timeframe: strategy.timeframe,
                signal,
                status: "SKIPPED",
                reasonText: filterDecision.reasonText,
                reasonMeta: {
                  signal: signal.reasonMeta,
                  filters: filterDecision.reasonMeta
                },
                primaryReasonCode: filterDecision.reasons[0]?.code ?? "FILTERED",
                primaryReasonText: filterDecision.reasons[0]?.message ?? filterDecision.reasonText
              });

              await this.eventService.publish({
                botId: bot.id,
                eventType,
                symbol: strategy.symbol,
                strategyId: strategy.id,
                strategyCode: strategy.code ?? null,
                sessionId: session.id,
                message: filterDecision.reasonText,
                reasonMeta: filterDecision.reasonMeta,
                notifyTelegram: true,
                timestamp: signal.timestamp
              });

              continue;
            }
          }

          await this.auditLogger.logStrategyRun({
            botId: bot.id,
            strategyId: strategy.id,
            sessionId: session.id,
            runLabel: session.runLabel,
            symbol: strategy.symbol,
            timeframe: strategy.timeframe,
            signal,
            status: signal.type === "HOLD" ? "NO_SIGNAL" : "SIGNAL"
          });

          await prisma.strategy.update({
            where: {
              id: strategy.id
            },
            data: {
              lastEvaluatedAt: new Date(signal.timestamp)
            }
          });

          if (signal.type !== "HOLD") {
            await this.executor.execute({
              botId: bot.id,
              strategy,
              session: {
                id: session.id,
                name: session.name,
                runLabel: session.runLabel
              },
              signal
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown worker error";
          logger.error(message, {
            botId: bot.id,
            strategyId: strategy.id
          });

          await prisma.bot.update({
            where: {
              id: bot.id
            },
            data: {
              status: "DEGRADED",
              lastErrorAt: new Date()
            }
          });

          await this.auditLogger.logSystem({
            botId: bot.id,
            level: "ERROR",
            source: "strategy-worker",
            message,
            context: {
              strategyId: strategy.id,
              symbol: strategy.symbol
            }
          });

          await this.eventService.publish({
            botId: bot.id,
            eventType: "ERROR",
            symbol: strategy.symbol,
            strategyId: strategy.id,
            strategyCode: strategy.code ?? null,
            sessionId: activeSessionId ?? null,
            message: `${strategy.name} failed: ${message}`,
            reasonMeta: {
              strategyId: strategy.id,
              symbol: strategy.symbol
            },
            notifyTelegram: true
          });

        }
      }

      if (activeSessionId) {
        await this.reportingService.refreshCurrentDailySummary(bot.id, activeSessionId);
        await this.sendPeriodicReportsIfDue(bot.id, activeSessionId);
      }
    }
  }

  private async sendPeriodicReportsIfDue(botId: string, sessionId: string) {
    const bot = await prisma.bot.findUniqueOrThrow({
      where: {
        id: botId
      }
    });

    await this.sendDailyReportIfDue(bot, sessionId);
    await this.sendWeeklyReportIfDue(bot, sessionId);
  }

  private async sendDailyReportIfDue(bot: { id: string; lastDailyReportSentAt: Date | null }, sessionId: string) {
    const now = new Date();
    const currentHour = getHourInTimeZone(now, env.REPORT_TIMEZONE);

    if (currentHour < env.DAILY_REPORT_HOUR) {
      return;
    }

    if (isSameLocalDate(bot.lastDailyReportSentAt, now, env.REPORT_TIMEZONE)) {
      return;
    }

    const report = await this.reportingService.buildDailyReport(bot.id, sessionId, formatDateKey(now, env.REPORT_TIMEZONE));

    await this.notifier.sendDailyReportSummary({
      botId: bot.id,
      sessionId,
      report
    });

    await prisma.bot.update({
      where: {
        id: bot.id
      },
      data: {
        lastDailyReportSentAt: now
      }
    });
  }

  private async sendWeeklyReportIfDue(
    bot: { id: string; lastWeeklyReportSentAt: Date | null },
    sessionId: string
  ) {
    const now = new Date();
    const currentHour = getHourInTimeZone(now, env.REPORT_TIMEZONE);
    const currentWeekday = getWeekdayInTimeZone(now, env.REPORT_TIMEZONE);

    if (currentWeekday !== env.WEEKLY_REPORT_DAY || currentHour < env.WEEKLY_REPORT_HOUR) {
      return;
    }

    if (isSameLocalDate(bot.lastWeeklyReportSentAt, now, env.REPORT_TIMEZONE)) {
      return;
    }

    const report = await this.reportingService.buildWeeklyReport(bot.id, sessionId, formatDateKey(now, env.REPORT_TIMEZONE));

    await this.notifier.sendWeeklyReportSummary({
      botId: bot.id,
      sessionId,
      report
    });

    await prisma.bot.update({
      where: {
        id: bot.id
      },
      data: {
        lastWeeklyReportSentAt: now
      }
    });
  }
}
