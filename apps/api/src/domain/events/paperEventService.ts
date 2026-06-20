import { Prisma } from "@prisma/client";
import type { PaperEventView } from "@fomo/shared";

import { toInputJsonValue } from "../../lib/json.js";
import { prisma } from "../../lib/prisma.js";
import { normalizeRuntimeMetadata } from "../runtime/runtimeMetadata.js";
import type { NotificationDispatchResult, NotifierPort } from "../notifier/types.js";
import type { PaperEventContextPayload, PublishPaperEventInput } from "./types.js";

function levelForEvent(eventType: PublishPaperEventInput["eventType"]): "INFO" | "WARN" | "ERROR" {
  if (eventType === "ERROR") {
    return "ERROR";
  }

  if (eventType === "TRADE_SKIPPED" || eventType === "COOLDOWN_TRIGGERED") {
    return "WARN";
  }

  return "INFO";
}

function shouldUpdateEvaluationAt(eventType: PublishPaperEventInput["eventType"]) {
  return (
    eventType === "STRATEGY_EVALUATED" ||
    eventType === "SIGNAL_GENERATED" ||
    eventType === "TRADE_SKIPPED" ||
    eventType === "COOLDOWN_TRIGGERED"
  );
}

function shouldUpdateTradeAt(eventType: PublishPaperEventInput["eventType"]) {
  return eventType === "ENTRY_PLACED" || eventType === "EXIT_TAKE_PROFIT" || eventType === "EXIT_STOP_LOSS";
}

function toEventContext(input: PublishPaperEventInput, notification?: NotificationDispatchResult): PaperEventContextPayload {
  return {
    schema: "paper-event/v1",
    eventType: input.eventType,
    symbol: input.symbol ?? null,
    strategyId: input.strategyId ?? null,
    strategyCode: input.strategyCode ?? null,
    sessionId: input.sessionId ?? null,
    reasonMeta: input.reasonMeta ?? null,
    pnlDelta: input.pnlDelta ?? null,
    fee: input.fee ?? null,
    telegramStatus: notification?.status ?? null,
    telegramSentAt: notification?.sentAt ?? null,
    telegramError: notification?.error ?? null
  };
}

export function mapPaperEventLog(log: {
  id: string;
  level: "INFO" | "WARN" | "ERROR";
  source: string;
  message: string;
  context: Prisma.JsonValue | null;
  createdAt: Date;
}): PaperEventView | null {
  const context = (log.context as PaperEventContextPayload | null) ?? null;

  if (!context || context.schema !== "paper-event/v1") {
    return null;
  }

  return {
    id: log.id,
    timestamp: log.createdAt.toISOString(),
    level: log.level,
    source: log.source,
    eventType: context.eventType,
    symbol: context.symbol,
    strategyId: context.strategyId,
    strategyCode: context.strategyCode,
    sessionId: context.sessionId,
    message: log.message,
    reasonMeta: context.reasonMeta,
    pnlDelta: context.pnlDelta,
    fee: context.fee,
    telegramStatus: context.telegramStatus,
    telegramSentAt: context.telegramSentAt,
    telegramError: context.telegramError
  };
}

export class PaperEventService {
  constructor(private readonly notifier: NotifierPort) {}

  async publish(input: PublishPaperEventInput): Promise<PaperEventView> {
    const timestamp = input.timestamp ? new Date(input.timestamp) : new Date();
    const log = await prisma.systemLog.create({
      data: {
        botId: input.botId,
        level: levelForEvent(input.eventType),
        source: "paper-event",
        message: input.message,
        context: toInputJsonValue(toEventContext(input))
      }
    });

    let notification: NotificationDispatchResult | undefined;

    if (input.notifyTelegram) {
      notification = await this.notifier.sendPaperEvent({
        botId: input.botId,
        strategyId: input.strategyId ?? null,
        strategyCode: input.strategyCode ?? null,
        sessionId: input.sessionId ?? null,
        eventType: input.eventType,
        symbol: input.symbol ?? null,
        message: input.message,
        reasonMeta: input.reasonMeta ?? null,
        pnlDelta: input.pnlDelta ?? null,
        fee: input.fee ?? null,
        timestamp: timestamp.toISOString()
      });

      await prisma.systemLog.update({
        where: {
          id: log.id
        },
        data: {
          context: toInputJsonValue(toEventContext(input, notification))
        }
      });
    }

    await this.updateBotMetadata(input, timestamp.toISOString(), notification);

    return {
      id: log.id,
      timestamp: log.createdAt.toISOString(),
      level: log.level,
      source: log.source,
      eventType: input.eventType,
      symbol: input.symbol ?? null,
      strategyId: input.strategyId ?? null,
      strategyCode: input.strategyCode ?? null,
      sessionId: input.sessionId ?? null,
      message: input.message,
      reasonMeta: input.reasonMeta ?? null,
      pnlDelta: input.pnlDelta ?? null,
      fee: input.fee ?? null,
      telegramStatus: notification?.status ?? null,
      telegramSentAt: notification?.sentAt ?? null,
      telegramError: notification?.error ?? null
    };
  }

  private async updateBotMetadata(
    input: PublishPaperEventInput,
    timestamp: string,
    notification?: NotificationDispatchResult
  ) {
    const bot = await prisma.bot.findUnique({
      where: {
        id: input.botId
      },
      select: {
        metadata: true
      }
    });

    if (!bot) {
      return;
    }

    const metadata = normalizeRuntimeMetadata(bot.metadata);
    const nextSystem = {
      ...metadata.system,
      ...(input.sessionId ? { lastSessionId: input.sessionId } : {})
    };

    if (input.eventType === "WORKER_TICK") {
      nextSystem.lastWorkerTickAt = timestamp;
    }

    if (input.eventType === "MARKET_DATA_UPDATED") {
      nextSystem.lastMarketUpdateAt = timestamp;
      nextSystem.lastEvaluationSymbol = input.symbol ?? nextSystem.lastEvaluationSymbol;
    }

    if (shouldUpdateEvaluationAt(input.eventType)) {
      nextSystem.lastStrategyEvaluationAt = timestamp;
      nextSystem.lastEvaluationSymbol = input.symbol ?? nextSystem.lastEvaluationSymbol;
    }

    if (shouldUpdateTradeAt(input.eventType)) {
      nextSystem.lastTradeExecutionAt = timestamp;
      nextSystem.lastTradeSymbol = input.symbol ?? nextSystem.lastTradeSymbol;
    }

    if (notification) {
      nextSystem.lastTelegramSentAt = notification.sentAt;
      nextSystem.lastTelegramStatus = notification.status;
      nextSystem.lastTelegramEventType = input.eventType;
      nextSystem.lastTelegramError = notification.error;
    }

    await prisma.bot.update({
      where: {
        id: input.botId
      },
      data: {
        metadata: toInputJsonValue({
          ...metadata,
          system: nextSystem
        })
      }
    });
  }
}
