import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { env } from "../config/env.js";
import { getDemoStrategyControl, updateDemoStrategyExecution, updateDemoStrategyToggle } from "../demo/store.js";
import { RuntimeConfigService } from "../domain/runtime/runtimeConfigService.js";
import { StrategyControlService } from "../domain/strategy/strategyControlService.js";
import { prisma } from "../lib/prisma.js";
import { resolveBot } from "./helpers.js";

export async function registerStrategyRoutes(app: FastifyInstance) {
  const strategyControlService = new StrategyControlService();
  const runtimeConfigService = new RuntimeConfigService();

  app.get("/strategies", async (request) => {
    const query = z
      .object({
        botId: z.string().optional()
      })
      .parse(request.query);

    const bot = await resolveBot(query.botId);

    if (env.LOCAL_DEMO_MODE) {
      return getDemoStrategyControl().strategies;
    }

    const control = await strategyControlService.build(bot.id);
    return control.strategies;
  });

  app.get("/strategies/control", async (request) => {
    const query = z
      .object({
        botId: z.string().optional(),
        period: z.enum(["today", "7d", "all"]).optional(),
        sortBy: z.enum(["profit", "winRate"]).optional()
      })
      .parse(request.query);

    if (env.LOCAL_DEMO_MODE) {
      return getDemoStrategyControl(query.period, query.sortBy);
    }

    return strategyControlService.build(query.botId, query.period, query.sortBy);
  });

  app.patch("/strategies/:id/toggle", async (request) => {
    const params = z
      .object({
        id: z.string()
      })
      .parse(request.params);

    if (env.LOCAL_DEMO_MODE) {
      return updateDemoStrategyToggle(params.id);
    }

    const strategy = await prisma.legacyStrategy.findUniqueOrThrow({
      where: {
        id: params.id
      }
    });

    const nextStatus = strategy.status === "ACTIVE" ? "PAUSED" : "ACTIVE";

    await prisma.legacyStrategy.update({
      where: {
        id: strategy.id
      },
      data: {
        status: nextStatus
      }
    });

    return strategyControlService.build(strategy.botId);
  });

  app.patch("/strategies/execution", async (request) => {
    const body = z
      .object({
        botId: z.string().optional(),
        allowMultiStrategy: z.boolean().optional(),
        activeStrategyIds: z.array(z.string()).optional(),
        primaryStrategyId: z.string().nullable().optional()
      })
      .parse(request.body);

    const payload = {
      ...(typeof body.allowMultiStrategy === "boolean" ? { allowMultiStrategy: body.allowMultiStrategy } : {}),
      ...(body.activeStrategyIds ? { activeStrategyIds: body.activeStrategyIds } : {}),
      ...(body.primaryStrategyId !== undefined ? { primaryStrategyId: body.primaryStrategyId } : {})
    };

    if (env.LOCAL_DEMO_MODE) {
      return updateDemoStrategyExecution(payload);
    }

    return runtimeConfigService.updateExecution(body.botId, payload);
  });
}
