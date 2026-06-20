import { Prisma } from "@prisma/client";
import TelegramBot from "node-telegram-bot-api";
import type { AlertType, DailyReportResponse, PaperEventType, WeeklyReportResponse } from "@fomo/shared";

import { env } from "../../config/env.js";
import { toInputJsonValue } from "../../lib/json.js";
import { prisma } from "../../lib/prisma.js";
import { normalizeRuntimeMetadata } from "../runtime/runtimeMetadata.js";
import type { NotificationDispatchResult, NotifierPort, PaperEventNotificationInput } from "./types.js";

interface TradeAlertInput {
  botId: string;
  strategyId: string;
  sessionId?: string;
  type: AlertType;
  symbol: string;
  action: string;
  signal: {
    timestamp: string;
    reasonText: string;
    reasons: Array<{ message: string }>;
  };
  fee: number;
  grossPnl: number;
  currentPnl: number;
}

const telegramEventLabels: Record<PaperEventType, string> = {
  WORKER_TICK: "WORKER",
  MARKET_DATA_UPDATED: "MARKET",
  STRATEGY_EVALUATED: "EVAL",
  SIGNAL_GENERATED: "SIGNAL",
  ENTRY_PLACED: "ENTRY",
  EXIT_TAKE_PROFIT: "EXIT",
  EXIT_STOP_LOSS: "EXIT",
  TRADE_SKIPPED: "SKIP",
  COOLDOWN_TRIGGERED: "COOLDOWN",
  ERROR: "ERROR"
};

function formatPaperEventMessage(input: PaperEventNotificationInput) {
  const lines = [`[${telegramEventLabels[input.eventType]}]`, input.symbol ?? "-", `시간: ${input.timestamp}`];

  if (input.strategyCode) {
    lines.push(`전략: ${input.strategyCode}`);
  }

  lines.push(`사유: ${input.message}`);

  if (typeof input.pnlDelta === "number") {
    lines.push(`실현손익: ${input.pnlDelta >= 0 ? "+" : ""}${input.pnlDelta.toFixed(2)} USD`);
  }

  if (typeof input.fee === "number") {
    lines.push(`수수료: ${input.fee.toFixed(2)} USD`);
  }

  return lines.join("\n");
}

export class TelegramNotifier implements NotifierPort {
  private readonly enabled =
    env.TELEGRAM_NOTIFICATIONS_ENABLED && (env.TELEGRAM_BOT_TOKEN?.length ?? 0) > 0 && (env.TELEGRAM_CHAT_ID?.length ?? 0) > 0;
  private readonly client = this.enabled ? new TelegramBot(env.TELEGRAM_BOT_TOKEN!, { polling: false }) : null;

  async sendPaperEvent(input: PaperEventNotificationInput): Promise<NotificationDispatchResult> {
    if ((input.eventType === "TRADE_SKIPPED" || input.eventType === "COOLDOWN_TRIGGERED") && !env.TELEGRAM_NOTIFY_SKIPPED) {
      return {
        status: "SKIPPED",
        sentAt: null,
        error: "Skip notifications disabled"
      };
    }

    return this.dispatch({
      botId: input.botId,
      strategyId: input.strategyId ?? undefined,
      sessionId: input.sessionId ?? undefined,
      type: input.eventType === "ERROR" ? "ERROR" : input.eventType === "ENTRY_PLACED" ? "ENTRY" : input.eventType === "EXIT_STOP_LOSS" ? "STOP_LOSS" : input.eventType === "EXIT_TAKE_PROFIT" ? "TAKE_PROFIT" : "INFO",
      title: `${telegramEventLabels[input.eventType]} ${input.symbol ?? "-"}`,
      message: formatPaperEventMessage(input),
      payload: {
        eventType: input.eventType,
        symbol: input.symbol ?? null,
        strategyCode: input.strategyCode ?? null,
        reasonMeta: input.reasonMeta ?? null,
        pnlDelta: input.pnlDelta ?? null,
        fee: input.fee ?? null
      },
      eventType: input.eventType
    });
  }

  async sendTradeAlert(input: TradeAlertInput): Promise<NotificationDispatchResult> {
    const reasonText = input.signal.reasons.map((reason) => reason.message).join(" / ");
    const message = [
      `[${input.type}]`,
      input.symbol,
      `시간: ${input.signal.timestamp}`,
      `액션: ${input.action}`,
      `사유: ${input.signal.reasonText || reasonText}`,
      `총손익: ${input.grossPnl.toFixed(2)} USD`,
      `수수료: ${input.fee.toFixed(2)} USD`,
      `순손익: ${input.currentPnl >= 0 ? "+" : ""}${input.currentPnl.toFixed(2)} USD`
    ].join("\n");

    return this.dispatch({
      botId: input.botId,
      strategyId: input.strategyId,
      sessionId: input.sessionId,
      type: input.type,
      title: `${input.type} ${input.symbol}`,
      message,
      payload: {
        action: input.action,
        fee: input.fee,
        grossPnl: input.grossPnl,
        pnl: input.currentPnl,
        signal: input.signal
      }
    });
  }

  async sendDailyReportSummary(input: {
    botId: string;
    sessionId?: string;
    report: DailyReportResponse;
  }): Promise<NotificationDispatchResult> {
    const strategyLines =
      input.report.strategyPerformance.length === 0
        ? ["전략 성과: 종료된 거래 없음"]
        : input.report.strategyPerformance.map(
            (row) => `${row.label}: 순손익 ${row.netPnl.toFixed(2)}, 수수료 ${row.totalFees.toFixed(2)}, 승률 ${row.winRate.toFixed(1)}%`
          );
    const recommendationLines =
      input.report.report.recommendations.length === 0
        ? []
        : input.report.report.recommendations.slice(0, 3).map((item) => `- ${item.title}: ${item.detail}`);

    const message = [
      `[DAILY REPORT] ${input.report.date}`,
      `세션: ${input.report.session?.runLabel ?? "-"}`,
      `거래 수: ${input.report.metrics.tradeCount}`,
      `순손익: ${input.report.metrics.netPnl.toFixed(2)} USD`,
      `총 수수료: ${input.report.metrics.totalFees.toFixed(2)} USD`,
      `승률: ${input.report.metrics.winRate.toFixed(1)}%`,
      `요약: ${input.report.report.summary.headline}`,
      ...strategyLines,
      ...recommendationLines
    ].join("\n");

    return this.dispatch({
      botId: input.botId,
      sessionId: input.sessionId,
      type: "INFO",
      title: `Daily report ${input.report.date}`,
      message,
      payload: {
        report: input.report
      }
    });
  }

  async sendWeeklyReportSummary(input: {
    botId: string;
    sessionId?: string;
    report: WeeklyReportResponse;
  }): Promise<NotificationDispatchResult> {
    const strategyLines =
      input.report.strategyPerformance.length === 0
        ? ["전략 성과: 종료된 거래 없음"]
        : input.report.strategyPerformance.map(
            (row) => `${row.label}: 순손익 ${row.netPnl.toFixed(2)}, 수수료 ${row.totalFees.toFixed(2)}, 승률 ${row.winRate.toFixed(1)}%`
          );
    const recommendationLines =
      input.report.report.recommendations.length === 0
        ? []
        : input.report.report.recommendations.slice(0, 3).map((item) => `- ${item.title}: ${item.detail}`);

    const message = [
      `[WEEKLY REPORT] ${input.report.periodStart} -> ${input.report.periodEnd}`,
      `세션: ${input.report.session?.runLabel ?? "-"}`,
      `거래 수: ${input.report.metrics.tradeCount}`,
      `순손익: ${input.report.metrics.netPnl.toFixed(2)} USD`,
      `총 수수료: ${input.report.metrics.totalFees.toFixed(2)} USD`,
      `승률: ${input.report.metrics.winRate.toFixed(1)}%`,
      `요약: ${input.report.report.summary.headline}`,
      ...strategyLines,
      ...recommendationLines
    ].join("\n");

    return this.dispatch({
      botId: input.botId,
      sessionId: input.sessionId,
      type: "INFO",
      title: `Weekly report ${input.report.periodStart} - ${input.report.periodEnd}`,
      message,
      payload: {
        report: input.report
      }
    });
  }

  async sendSystemAlert(input: {
    botId?: string | undefined;
    strategyId?: string | undefined;
    sessionId?: string | undefined;
    type: AlertType;
    title: string;
    message: string;
    payload?: Record<string, unknown> | undefined;
  }): Promise<NotificationDispatchResult> {
    return this.dispatch(input);
  }

  async sendTestMessage(input: { botId?: string; text?: string }): Promise<NotificationDispatchResult> {
    return this.dispatch({
      botId: input.botId,
      type: "INFO",
      title: "Telegram test",
      message: input.text ?? `Paper trading bot test message at ${new Date().toISOString()}`,
      payload: {
        kind: "test"
      }
    });
  }

  private async dispatch(input: {
    botId?: string | undefined;
    strategyId?: string | undefined;
    sessionId?: string | undefined;
    type: AlertType;
    title: string;
    message: string;
    payload?: Record<string, unknown> | undefined;
    eventType?: PaperEventType | undefined;
  }): Promise<NotificationDispatchResult> {
    if (!this.enabled || !this.client || !env.TELEGRAM_CHAT_ID) {
      const skipped = {
        status: "SKIPPED" as const,
        sentAt: null,
        error: env.TELEGRAM_NOTIFICATIONS_ENABLED
          ? "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing"
          : "Telegram notifications disabled"
      };

      if (input.botId) {
        await this.recordDispatchResult(input.botId, skipped, input.eventType ?? null);
      }

      return skipped;
    }

    let status: "SENT" | "FAILED" = "FAILED";
    let sentAt: string | null = null;
    let error: string | null = null;

    try {
      await this.client.sendMessage(env.TELEGRAM_CHAT_ID, input.message);
      status = "SENT";
      sentAt = new Date().toISOString();
    } catch (dispatchError) {
      status = "FAILED";
      error = dispatchError instanceof Error ? dispatchError.message : "Telegram send failed";
    }

    await prisma.alert.create({
      data: {
        botId: input.botId ?? "seed-paper-bot",
        strategyId: input.strategyId ?? null,
        sessionId: input.sessionId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        status,
        sentAt: sentAt ? new Date(sentAt) : null,
        payload: input.payload ? toInputJsonValue(input.payload) : Prisma.JsonNull
      }
    });

    const result = {
      status,
      sentAt,
      error
    } satisfies NotificationDispatchResult;

    if (input.botId) {
      await this.recordDispatchResult(input.botId, result, input.eventType ?? null);
    }

    return result;
  }

  private async recordDispatchResult(
    botId: string,
    result: NotificationDispatchResult,
    eventType: PaperEventType | null
  ) {
    const bot = await prisma.bot.findUnique({
      where: {
        id: botId
      },
      select: {
        metadata: true
      }
    });

    if (!bot) {
      return;
    }

    const metadata = normalizeRuntimeMetadata(bot.metadata);

    await prisma.bot.update({
      where: {
        id: botId
      },
      data: {
        metadata: toInputJsonValue({
          ...metadata,
          system: {
            ...metadata.system,
            lastTelegramSentAt: result.sentAt,
            lastTelegramStatus: result.status,
            lastTelegramEventType: eventType,
            lastTelegramError: result.error
          }
        })
      }
    });
  }
}
