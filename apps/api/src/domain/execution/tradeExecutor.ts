import type { StrategySessionView, StrategySignal } from "@fomo/shared";

import { AuditLogger } from "../audit/auditLogger.js";
import type { BrokerPort } from "../broker/types.js";
import { PaperEventService } from "../events/paperEventService.js";
import type { StrategyRuntimeRecord } from "../strategy/types.js";

export class TradeExecutor {
  constructor(
    private readonly broker: BrokerPort,
    private readonly eventService: PaperEventService,
    private readonly auditLogger: AuditLogger
  ) {}

  async execute(input: {
    botId: string;
    strategy: StrategyRuntimeRecord;
    session: Pick<StrategySessionView, "id" | "name" | "runLabel">;
    signal: StrategySignal;
  }) {
    const execution = await this.broker.executeSignal({
      botId: input.botId,
      strategyId: input.strategy.id,
      sessionId: input.session.id,
      signal: input.signal,
      strategyConfig: input.strategy.config
    });

    if (!execution) {
      return null;
    }

    const eventType =
      execution.alertType === "TAKE_PROFIT"
        ? "EXIT_TAKE_PROFIT"
        : execution.alertType === "STOP_LOSS"
          ? "EXIT_STOP_LOSS"
          : "ENTRY_PLACED";
    const actionLabel = eventType === "ENTRY_PLACED" ? "진입" : execution.alertType === "TAKE_PROFIT" ? "익절" : "손절";

    await this.eventService.publish({
      botId: input.botId,
      eventType,
      symbol: input.strategy.symbol,
      strategyId: input.strategy.id,
      strategyCode: input.strategy.code ?? null,
      sessionId: input.session.id,
      message:
        eventType === "ENTRY_PLACED"
          ? `${input.strategy.symbol} ${actionLabel} 완료 · ${input.signal.reasonText}`
          : `${input.strategy.symbol} ${actionLabel} 완료 · ${input.signal.reasonText}`,
      reasonMeta: input.signal.reasonMeta,
      pnlDelta: execution.currentPnl,
      fee: execution.fee,
      notifyTelegram: true,
      timestamp: input.signal.timestamp
    });

    await this.auditLogger.logSystem({
      botId: input.botId,
      level: "INFO",
      source: "trade-executor",
      message: `${execution.action} executed for ${input.strategy.symbol}`,
      context: {
        alertType: execution.alertType,
        fee: execution.fee,
        pnl: execution.currentPnl,
        strategyId: input.strategy.id
      }
    });

    return execution;
  }
}
