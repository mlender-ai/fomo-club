import type { StrategyConfig } from "@fomo/shared";

import { toInputJsonValue } from "../../lib/json.js";
import { formatDateKey } from "../../lib/time.js";
import { prisma } from "../../lib/prisma.js";

interface EnsureSessionInput {
  botId: string;
  strategyConfig: StrategyConfig;
}

export class SessionService {
  async getOrCreateActiveSession(input: EnsureSessionInput) {
    const existing = await prisma.strategySession.findFirst({
      where: {
        botId: input.botId,
        status: "ACTIVE"
      },
      orderBy: {
        startedAt: "desc"
      }
    });

    if (existing) {
      return existing;
    }

    const dateKey = formatDateKey(new Date(), "UTC").replaceAll("-", "");

    return prisma.strategySession.create({
      data: {
        botId: input.botId,
        name: "A Strategy Validation",
        runLabel: `a-strategy-${input.strategyConfig.symbol.toLowerCase()}-${input.strategyConfig.timeframe}-${dateKey}`,
        status: "ACTIVE",
        notes: "Auto-created active validation session.",
        configSnapshot: toInputJsonValue(input.strategyConfig)
      }
    });
  }

  async listSessions(botId: string) {
    return prisma.strategySession.findMany({
      where: {
        botId
      },
      orderBy: {
        startedAt: "desc"
      },
      take: 10
    });
  }

  async createSession(input: {
    botId: string;
    name: string;
    runLabel: string;
    notes?: string;
    activate?: boolean;
    configSnapshot?: Record<string, unknown> | undefined;
  }) {
    if (input.activate ?? true) {
      await prisma.strategySession.updateMany({
        where: {
          botId: input.botId,
          status: "ACTIVE"
        },
        data: {
          status: "ARCHIVED",
          endedAt: new Date()
        }
      });
    }

    return prisma.strategySession.create({
      data: {
        botId: input.botId,
        name: input.name,
        runLabel: input.runLabel,
        notes: input.notes ?? null,
        status: input.activate ?? true ? "ACTIVE" : "ARCHIVED",
        ...(input.configSnapshot ? { configSnapshot: toInputJsonValue(input.configSnapshot) } : {})
      }
    });
  }

  async activateSession(sessionId: string) {
    const session = await prisma.strategySession.findUniqueOrThrow({
      where: {
        id: sessionId
      }
    });

    await prisma.strategySession.updateMany({
      where: {
        botId: session.botId,
        status: "ACTIVE",
        NOT: {
          id: session.id
        }
      },
      data: {
        status: "ARCHIVED",
        endedAt: new Date()
      }
    });

    return prisma.strategySession.update({
      where: {
        id: session.id
      },
      data: {
        status: "ACTIVE",
        endedAt: null
      }
    });
  }
}
