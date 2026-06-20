import type { Prisma } from "@prisma/client";
import type { AlertType, StrategyConfig, StrategySignal } from "@fomo/shared";

import { toInputJsonValue } from "../../lib/json.js";
import { prisma } from "../../lib/prisma.js";
import { applyExecutionPrice, resolveFeeRate } from "../execution/feeModel.js";
import { buildSignalReasonPayload, getPrimaryReason } from "../strategy/reasoning.js";
import type { BrokerExecutionResult, BrokerPort } from "./types.js";

export class PaperBroker implements BrokerPort {
  async executeSignal(input: {
    botId: string;
    strategyId: string;
    sessionId: string;
    signal: StrategySignal;
    strategyConfig: StrategyConfig;
  }): Promise<BrokerExecutionResult | null> {
    const bot = await prisma.bot.findUniqueOrThrow({
      where: {
        id: input.botId
      }
    });

    const openPosition = await prisma.position.findFirst({
      where: {
        botId: input.botId,
        strategyId: input.strategyId,
        sessionId: input.sessionId,
        status: "OPEN"
      }
    });

    if (input.signal.type === "ENTER" && !openPosition) {
      return this.openLong({
        bot,
        strategyId: input.strategyId,
        sessionId: input.sessionId,
        signal: input.signal,
        allocationPct: input.strategyConfig.allocationPct
      });
    }

    if (input.signal.type === "EXIT" && openPosition) {
      return this.closeLong({
        bot,
        position: openPosition,
        strategyId: input.strategyId,
        sessionId: input.sessionId,
        signal: input.signal
      });
    }

    return null;
  }

  private async openLong(input: {
    bot: {
      id: string;
      paperBalance: number;
      reservedBalance: number;
      makerFeeRate: number;
      takerFeeRate: number;
      entryOrderRole: "MAKER" | "TAKER";
      slippageBps: number;
    };
    strategyId: string;
    sessionId: string;
    signal: StrategySignal;
    allocationPct: number;
  }): Promise<BrokerExecutionResult | null> {
    const cashToDeploy = Number((input.bot.paperBalance * input.allocationPct).toFixed(2));

    if (cashToDeploy <= 25) {
      return null;
    }

    const executedPrice = applyExecutionPrice(input.signal.price, "BUY", input.bot.slippageBps);
    const quantity = Number((cashToDeploy / executedPrice).toFixed(6));
    const notional = Number((quantity * executedPrice).toFixed(2));
    const feeRate = resolveFeeRate(input.bot, input.bot.entryOrderRole);
    const fee = Number((notional * feeRate).toFixed(2));
    const nextBalance = Number((input.bot.paperBalance - notional - fee).toFixed(2));
    const primaryReason = getPrimaryReason(input.signal.reasons);

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const position = await tx.position.create({
        data: {
          botId: input.bot.id,
          strategyId: input.strategyId,
          sessionId: input.sessionId,
          symbol: input.signal.symbol,
          side: "LONG",
          quantity,
          entryPrice: executedPrice,
          entryValue: notional,
          feesPaid: fee,
          entryReasonCode: primaryReason.code,
          entryReasonText: input.signal.reasonText,
          entryReasonMeta: toInputJsonValue({
            ...buildSignalReasonPayload(input.signal),
            signalPrice: input.signal.price,
            executedPrice,
            orderRole: input.bot.entryOrderRole,
            feeRate,
            slippageBps: input.bot.slippageBps
          })
        }
      });

      await tx.trade.create({
        data: {
          botId: input.bot.id,
          strategyId: input.strategyId,
          positionId: position.id,
          sessionId: input.sessionId,
          symbol: input.signal.symbol,
          action: "BUY",
          side: "LONG",
          quantity,
          price: executedPrice,
          notional,
          orderRole: input.bot.entryOrderRole,
          feeRate,
          slippageBps: input.bot.slippageBps,
          fee,
          grossPnl: 0,
          realizedPnl: -fee,
          reasonCode: primaryReason.code,
          reasonText: input.signal.reasonText,
          reasonMeta: toInputJsonValue({
            ...buildSignalReasonPayload(input.signal),
            signalPrice: input.signal.price,
            executedPrice
          })
        }
      });

      await tx.bot.update({
        where: {
          id: input.bot.id
        },
        data: {
          paperBalance: nextBalance,
          reservedBalance: Number((input.bot.reservedBalance + notional).toFixed(2))
        }
      });

      return {
        alertType: "ENTRY" as const,
        action: "BUY" as const,
        fee,
        grossPnl: 0,
        currentPnl: -fee,
        positionId: position.id
      };
    });
  }

  private async closeLong(input: {
    bot: {
      id: string;
      paperBalance: number;
      reservedBalance: number;
      makerFeeRate: number;
      takerFeeRate: number;
      exitOrderRole: "MAKER" | "TAKER";
      slippageBps: number;
    };
    position: {
      id: string;
      quantity: number;
      entryPrice: number;
      entryValue: number;
      feesPaid: number;
    };
    strategyId: string;
    sessionId: string;
    signal: StrategySignal;
  }): Promise<BrokerExecutionResult> {
    const executedPrice = applyExecutionPrice(input.signal.price, "SELL", input.bot.slippageBps);
    const notional = Number((input.position.quantity * executedPrice).toFixed(2));
    const feeRate = resolveFeeRate(input.bot, input.bot.exitOrderRole);
    const fee = Number((notional * feeRate).toFixed(2));
    const grossPnl = Number(((executedPrice - input.position.entryPrice) * input.position.quantity).toFixed(2));
    const tradeNetPnl = Number((grossPnl - fee).toFixed(2));
    const realizedPnl = Number((grossPnl - fee - input.position.feesPaid).toFixed(2));
    const nextBalance = Number((input.bot.paperBalance + notional - fee).toFixed(2));
    const primaryReason = getPrimaryReason(input.signal.reasons);
    const alertType: AlertType = realizedPnl > 0 ? "TAKE_PROFIT" : realizedPnl < 0 ? "STOP_LOSS" : "EXIT";

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.position.update({
        where: {
          id: input.position.id
        },
        data: {
          status: "CLOSED",
          exitPrice: executedPrice,
          exitValue: notional,
          realizedPnl,
          feesPaid: Number((input.position.feesPaid + fee).toFixed(2)),
          closedAt: new Date(input.signal.timestamp),
          exitReasonCode: primaryReason.code,
          exitReasonText: input.signal.reasonText,
          exitReasonMeta: toInputJsonValue({
            ...buildSignalReasonPayload(input.signal),
            signalPrice: input.signal.price,
            executedPrice,
            orderRole: input.bot.exitOrderRole,
            feeRate,
            slippageBps: input.bot.slippageBps
          })
        }
      });

      await tx.trade.create({
        data: {
          botId: input.bot.id,
          strategyId: input.strategyId,
          positionId: input.position.id,
          sessionId: input.sessionId,
          symbol: input.signal.symbol,
          action: realizedPnl > 0 ? "TAKE_PROFIT" : realizedPnl < 0 ? "STOP_LOSS" : "CLOSE",
          side: "LONG",
          quantity: input.position.quantity,
          price: executedPrice,
          notional,
          orderRole: input.bot.exitOrderRole,
          feeRate,
          slippageBps: input.bot.slippageBps,
          fee,
          grossPnl,
          realizedPnl: tradeNetPnl,
          reasonCode: primaryReason.code,
          reasonText: input.signal.reasonText,
          reasonMeta: toInputJsonValue({
            ...buildSignalReasonPayload(input.signal),
            signalPrice: input.signal.price,
            executedPrice
          })
        }
      });

      await tx.bot.update({
        where: {
          id: input.bot.id
        },
        data: {
          paperBalance: nextBalance,
          reservedBalance: Number(Math.max(0, input.bot.reservedBalance - input.position.entryValue).toFixed(2))
        }
      });

      return {
        alertType,
        action: "CLOSE" as const,
        fee,
        grossPnl,
        currentPnl: realizedPnl,
        positionId: input.position.id
      };
    });
  }
}
