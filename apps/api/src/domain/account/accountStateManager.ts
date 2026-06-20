import type { AccountOverviewView } from "@fomo/shared";

import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { formatDateKey } from "../../lib/time.js";
import { resolveBot } from "../../routes/helpers.js";
import { normalizeRuntimeMetadata } from "../runtime/runtimeMetadata.js";

export class AccountStateManager {
  async build(botId?: string, sessionId?: string): Promise<AccountOverviewView> {
    const bot = await resolveBot(botId);
    const sessionWhere = sessionId ? { sessionId } : {};
    const metadata = normalizeRuntimeMetadata(bot.metadata);

    const [openPositions, trades] = await Promise.all([
      prisma.position.findMany({
        where: {
          botId: bot.id,
          status: "OPEN",
          ...sessionWhere
        }
      }),
      prisma.trade.findMany({
        where: {
          botId: bot.id,
          ...sessionWhere
        }
      })
    ]);

    const positionValuations = await Promise.all(
      openPositions.map(async (position) => {
        const latestCandle = await prisma.marketCandle.findFirst({
          where: {
            symbol: position.symbol
          },
          orderBy: {
            openTime: "desc"
          }
        });
        const currentPrice = latestCandle?.close ?? position.entryPrice;
        const currentValue = Number((currentPrice * position.quantity).toFixed(2));
        const unrealizedPnl = Number((currentValue - position.entryValue).toFixed(2));

        return {
          currentValue,
          unrealizedPnl
        };
      })
    );
    const equity = Number((bot.paperBalance + positionValuations.reduce((sum, position) => sum + position.currentValue, 0)).toFixed(2));
    const todayKey = formatDateKey(new Date(), env.REPORT_TIMEZONE);
    const todayPnlUsd = trades
      .filter((trade) => formatDateKey(trade.executedAt, env.REPORT_TIMEZONE) === todayKey)
      .reduce((sum, trade) => sum + trade.realizedPnl, 0);

    const totalPnlUsd = Number((equity - metadata.initialCapital).toFixed(2));

    return {
      initialCapital: metadata.initialCapital,
      cashBalance: bot.paperBalance,
      equity,
      totalPnlUsd,
      totalPnlPct: metadata.initialCapital === 0 ? 0 : Number(((totalPnlUsd / metadata.initialCapital) * 100).toFixed(2)),
      todayPnlUsd: Number(todayPnlUsd.toFixed(2)),
      todayPnlPct: metadata.initialCapital === 0 ? 0 : Number(((todayPnlUsd / metadata.initialCapital) * 100).toFixed(2)),
      reservedBalance: Number(positionValuations.reduce((sum, position) => sum + position.currentValue, 0).toFixed(2))
    };
  }
}
