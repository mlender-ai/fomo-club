import type { StrategyConfig, StrategySignal, SignalReason } from "@fomo/shared";

import { env } from "../../config/env.js";
import { formatDateKey } from "../../lib/time.js";
import { prisma } from "../../lib/prisma.js";
import { estimateRoundTripCostPct, type FeeModelInput } from "./feeModel.js";

interface TradeFilterInput {
  bot: {
    id: string;
    makerFeeRate: number;
    takerFeeRate: number;
    entryOrderRole: "MAKER" | "TAKER";
    exitOrderRole: "MAKER" | "TAKER";
    slippageBps: number;
  };
  strategyId: string;
  sessionId: string;
  signal: StrategySignal;
  strategyConfig: StrategyConfig;
}

export interface TradeFilterDecision {
  allowed: boolean;
  reasons: SignalReason[];
  reasonText: string;
  reasonMeta: Record<string, unknown>;
}

export class TradeFilter {
  async evaluateEntry(input: TradeFilterInput): Promise<TradeFilterDecision> {
    const reasons: SignalReason[] = [];
    const feeModel: FeeModelInput = {
      makerFeeRate: input.bot.makerFeeRate,
      takerFeeRate: input.bot.takerFeeRate,
      entryOrderRole: input.bot.entryOrderRole,
      exitOrderRole: input.bot.exitOrderRole,
      slippageBps: input.bot.slippageBps
    };
    const expectedExitPrice = input.signal.indicators.bbMiddle ?? input.signal.price;
    const expectedGrossReturnPct = Number((((expectedExitPrice - input.signal.price) / input.signal.price) * 100).toFixed(4));
    const roundTripCostPct = estimateRoundTripCostPct(feeModel);
    const requiredReturnPct = Number((roundTripCostPct * input.strategyConfig.expectedProfitMultiple).toFixed(4));
    const bandWidthPct = input.signal.indicators.bandWidthPct ?? 0;

    if (expectedGrossReturnPct <= requiredReturnPct) {
      reasons.push({
        code: "FILTER_EDGE_TOO_SMALL",
        message: `Skipped entry because the expected rebound of ${expectedGrossReturnPct.toFixed(
          2
        )}% does not clear the required ${requiredReturnPct.toFixed(2)}% after fees and slippage.`,
        meta: {
          expectedGrossReturnPct,
          roundTripCostPct,
          requiredReturnPct
        }
      });
    }

    if (bandWidthPct < input.strategyConfig.minVolatilityPct) {
      reasons.push({
        code: "FILTER_LOW_VOLATILITY",
        message: `Skipped entry because Bollinger band width is only ${bandWidthPct.toFixed(
          2
        )}%, below the minimum tradable volatility of ${input.strategyConfig.minVolatilityPct.toFixed(2)}%.`,
        meta: {
          bandWidthPct,
          threshold: input.strategyConfig.minVolatilityPct
        }
      });
    }

    const recentLosses = await prisma.position.findMany({
      where: {
        botId: input.bot.id,
        strategyId: input.strategyId,
        sessionId: input.sessionId,
        status: "CLOSED"
      },
      orderBy: {
        closedAt: "desc"
      },
      take: input.strategyConfig.cooldownAfterLosses
    });

    const hasLossStreak =
      recentLosses.length === input.strategyConfig.cooldownAfterLosses &&
      recentLosses.every((position) => position.realizedPnl < 0) &&
      Boolean(recentLosses[0]?.closedAt);

    if (hasLossStreak) {
      const latestLossAt = recentLosses[0]?.closedAt ?? null;

      if (latestLossAt) {
        const cooldownUntil = new Date(latestLossAt.getTime() + input.strategyConfig.cooldownMinutes * 60 * 1000);

        if (cooldownUntil.getTime() > Date.now()) {
          reasons.push({
            code: "FILTER_COOLDOWN_ACTIVE",
            message: `Skipped entry because the last ${input.strategyConfig.cooldownAfterLosses} trades all lost money. Cooldown remains active until ${cooldownUntil.toISOString()}.`,
            meta: {
              cooldownUntil: cooldownUntil.toISOString(),
              lossCount: input.strategyConfig.cooldownAfterLosses,
              lastLossDate: formatDateKey(latestLossAt, env.REPORT_TIMEZONE)
            }
          });
        }
      }
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      reasonText:
        reasons.length === 0
          ? "Entry passed the fee, volatility, and cooldown filters."
          : reasons.map((reason) => reason.message).join(" "),
      reasonMeta: {
        filters: reasons,
        expectedGrossReturnPct,
        roundTripCostPct,
        requiredReturnPct,
        bandWidthPct
      }
    };
  }
}

