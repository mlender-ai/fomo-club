import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { resolveBot } from "./helpers.js";

export async function registerTradeRoutes(app: FastifyInstance) {
  app.get("/trades", async (request) => {
    const query = z
      .object({
        botId: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(50)
      })
      .parse(request.query);

    const bot = await resolveBot(query.botId);

    const trades = await prisma.legacyTrade.findMany({
      where: {
        botId: bot.id
      },
      orderBy: {
        executedAt: "desc"
      },
      take: query.limit
    });

    return trades.map((trade) => ({
      ...trade,
      executedAt: trade.executedAt.toISOString()
    }));
  });
}
