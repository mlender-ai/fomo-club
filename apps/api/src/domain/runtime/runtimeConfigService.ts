import type { KillSwitchMode, RuntimeStateResponse } from "@fomo/shared";

import { env } from "../../config/env.js";
import { encryptText } from "../../lib/crypto.js";
import { toInputJsonValue } from "../../lib/json.js";
import { prisma } from "../../lib/prisma.js";
import { resolveBot } from "../../routes/helpers.js";
import { AccountStateManager } from "../account/accountStateManager.js";
import { StrategyControlService } from "../strategy/strategyControlService.js";
import { normalizeRuntimeMetadata } from "./runtimeMetadata.js";
import { deriveSystemStatus } from "./systemStatus.js";

export class RuntimeConfigService {
  private readonly accountStateManager = new AccountStateManager();
  private readonly strategyControlService = new StrategyControlService();

  async build(botId?: string): Promise<RuntimeStateResponse> {
    const bot = await resolveBot(botId);
    const metadata = normalizeRuntimeMetadata(bot.metadata);
    const [account, strategyControl, openPositionCount] = await Promise.all([
      this.accountStateManager.build(bot.id),
      this.strategyControlService.build(bot.id),
      prisma.position.count({
        where: {
          botId: bot.id,
          status: "OPEN"
        }
      })
    ]);
    const activeStrategyCount = strategyControl.execution.activeStrategyIds.length;
    const system = deriveSystemStatus({
      botStatus: bot.status,
      lastHeartbeatAt: bot.heartbeatAt,
      lastErrorAt: bot.lastErrorAt,
      lastMarketUpdateAt: metadata.system.lastMarketUpdateAt,
      workerIntervalMs: env.WORKER_INTERVAL_MS,
      activeStrategyCount,
      openPositionCount,
      killSwitchEnabled: metadata.killSwitch.enabled,
      killSwitchMode: metadata.killSwitch.mode,
      riskTriggered: metadata.risk.isTriggered
    });

    return {
      exchange: {
        exchange: metadata.exchange.exchange,
        mode: bot.mode === "real" ? "real" : metadata.exchange.mode,
        sandbox: metadata.exchange.sandbox,
        hasApiKey: Boolean(metadata.exchange.encryptedApiKey),
        hasApiSecret: Boolean(metadata.exchange.encryptedApiSecret),
        apiKeyPreview: metadata.exchange.apiKeyPreview,
        updatedAt: metadata.exchange.updatedAt
      },
      risk: {
        maxDailyLossUsd: metadata.risk.maxDailyLossUsd,
        maxDailyLossPct: metadata.risk.maxDailyLossPct,
        maxConsecutiveLosses: metadata.risk.maxConsecutiveLosses,
        cooldownMinutes: metadata.risk.cooldownMinutes,
        autoPauseEnabled: metadata.risk.autoPauseEnabled,
        isTriggered: metadata.risk.isTriggered,
        triggerReason: metadata.risk.triggerReason
      },
      killSwitch: {
        enabled: metadata.killSwitch.enabled,
        mode: metadata.killSwitch.mode,
        activatedAt: metadata.killSwitch.activatedAt,
        reason: metadata.killSwitch.reason
      },
      execution: strategyControl.execution,
      system,
      account
    };
  }

  async updateExchange(
    botId: string | undefined,
    input: {
      exchange?: "BINANCE" | "BYBIT";
      mode?: "paper" | "real";
      sandbox?: boolean;
      apiKey?: string;
      apiSecret?: string;
    }
  ) {
    const bot = await resolveBot(botId);
    const metadata = normalizeRuntimeMetadata(bot.metadata);
    const secret = env.CONFIG_ENCRYPTION_SECRET ?? env.BOT_PASSWORD;

    const nextMetadata = {
      ...metadata,
      exchange: {
        ...metadata.exchange,
        exchange: input.exchange ?? metadata.exchange.exchange,
        mode: input.mode ?? metadata.exchange.mode,
        sandbox: input.sandbox ?? metadata.exchange.sandbox,
        encryptedApiKey: input.apiKey ? encryptText(input.apiKey, secret) : metadata.exchange.encryptedApiKey,
        encryptedApiSecret: input.apiSecret ? encryptText(input.apiSecret, secret) : metadata.exchange.encryptedApiSecret,
        apiKeyPreview: input.apiKey ? `${input.apiKey.slice(0, 4)}_********_${input.apiKey.slice(-4)}` : metadata.exchange.apiKeyPreview,
        updatedAt: new Date().toISOString()
      }
    };

    await prisma.bot.update({
      where: {
        id: bot.id
      },
      data: {
        mode: input.mode ?? bot.mode,
        exchangeKey: (input.exchange ?? metadata.exchange.exchange).toLowerCase(),
        metadata: toInputJsonValue(nextMetadata)
      }
    });

    return this.build(bot.id);
  }

  async updateRisk(botId: string | undefined, input: Partial<RuntimeStateResponse["risk"]>) {
    const bot = await resolveBot(botId);
    const metadata = normalizeRuntimeMetadata(bot.metadata);
    const nextMetadata = {
      ...metadata,
      risk: {
        ...metadata.risk,
        ...input
      }
    };

    await prisma.bot.update({
      where: {
        id: bot.id
      },
      data: {
        metadata: toInputJsonValue(nextMetadata)
      }
    });

    return this.build(bot.id);
  }

  async updateKillSwitch(botId: string | undefined, input: { enabled: boolean; mode: KillSwitchMode; reason?: string | null }) {
    const bot = await resolveBot(botId);
    const metadata = normalizeRuntimeMetadata(bot.metadata);
    const nextMetadata = {
      ...metadata,
      killSwitch: {
        enabled: input.enabled,
        mode: input.mode,
        reason: input.reason ?? null,
        activatedAt: input.enabled ? new Date().toISOString() : null
      }
    };

    await prisma.bot.update({
      where: {
        id: bot.id
      },
      data: {
        status: input.enabled ? "STOPPED" : "RUNNING",
        metadata: toInputJsonValue(nextMetadata)
      }
    });

    return this.build(bot.id);
  }

  async updateExecution(
    botId: string | undefined,
    input: {
      allowMultiStrategy?: boolean;
      activeStrategyIds?: string[];
      primaryStrategyId?: string | null;
      runningStrategyIds?: string[];
    }
  ) {
    const bot = await resolveBot(botId);
    const metadata = normalizeRuntimeMetadata(bot.metadata);
    const nextMetadata = {
      ...metadata,
      execution: {
        allowMultiStrategy: input.allowMultiStrategy ?? metadata.execution.allowMultiStrategy,
        activeStrategyIds: input.activeStrategyIds ?? metadata.execution.activeStrategyIds,
        primaryStrategyId: input.primaryStrategyId ?? metadata.execution.primaryStrategyId,
        runningStrategyIds: input.runningStrategyIds ?? metadata.execution.runningStrategyIds
      }
    };

    await prisma.bot.update({
      where: {
        id: bot.id
      },
      data: {
        metadata: toInputJsonValue(nextMetadata)
      }
    });

    return this.build(bot.id);
  }
}
