import { Prisma } from "@prisma/client";
import type { CandleDto, StrategySignal } from "@fomo/shared";

import { toInputJsonValue } from "../../lib/json.js";
import { prisma } from "../../lib/prisma.js";
import { buildSignalReasonPayload, getPrimaryReason } from "../strategy/reasoning.js";

export class AuditLogger {
  async logStrategyRun(input: {
    botId: string;
    strategyId: string;
    sessionId?: string;
    runLabel?: string;
    symbol: string;
    timeframe: string;
    signal: StrategySignal;
    status: "SIGNAL" | "NO_SIGNAL" | "ERROR" | "SKIPPED";
    reasonText?: string;
    reasonMeta?: Record<string, unknown>;
    primaryReasonCode?: string;
    primaryReasonText?: string;
    errorMessage?: string;
  }) {
    const primaryReason = getPrimaryReason(input.signal.reasons);

    await prisma.strategyRun.create({
      data: {
        botId: input.botId,
        strategyId: input.strategyId,
        sessionId: input.sessionId ?? null,
        runLabel: input.runLabel ?? null,
        symbol: input.symbol,
        timeframe: input.timeframe,
        status: input.status,
        signalType: input.signal.type,
        price: input.signal.price,
        primaryReasonCode: input.primaryReasonCode ?? primaryReason.code,
        primaryReasonText: input.primaryReasonText ?? primaryReason.message,
        reasonsText: input.reasonText ?? input.signal.reasonText,
        reasons: toInputJsonValue(input.reasonMeta ?? buildSignalReasonPayload(input.signal)),
        indicators: toInputJsonValue(input.signal.indicators),
        errorMessage: input.errorMessage ?? null
      }
    });
  }

  async logSystem(input: {
    level: "INFO" | "WARN" | "ERROR";
    source: string;
    message: string;
    context?: Record<string, unknown>;
    botId?: string;
  }) {
    await prisma.systemLog.create({
      data: {
        botId: input.botId ?? null,
        level: input.level,
        source: input.source,
        message: input.message,
        context: input.context ? toInputJsonValue(input.context) : Prisma.JsonNull
      }
    });
  }

  async persistCandles(exchangeKey: string, candles: CandleDto[]) {
    if (candles.length === 0) {
      return;
    }

    await prisma.$transaction(
      candles.map((candle) =>
        prisma.marketCandle.upsert({
          where: {
            exchangeKey_symbol_timeframe_openTime: {
              exchangeKey,
              symbol: candle.symbol,
              timeframe: candle.timeframe,
              openTime: new Date(candle.openTime)
            }
          },
          update: {
            closeTime: new Date(candle.closeTime),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume
          },
          create: {
            exchangeKey,
            symbol: candle.symbol,
            timeframe: candle.timeframe,
            openTime: new Date(candle.openTime),
            closeTime: new Date(candle.closeTime),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume
          }
        })
      )
    );
  }
}
