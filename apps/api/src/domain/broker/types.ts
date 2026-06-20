import type { AlertType, StrategyConfig, StrategySignal } from "@fomo/shared";

export interface BrokerExecutionResult {
  alertType: AlertType;
  action: "BUY" | "CLOSE";
  fee: number;
  grossPnl: number;
  currentPnl: number;
  positionId: string;
}

export interface BrokerPort {
  executeSignal(input: {
    botId: string;
    strategyId: string;
    sessionId: string;
    signal: StrategySignal;
    strategyConfig: StrategyConfig;
  }): Promise<BrokerExecutionResult | null>;
}
