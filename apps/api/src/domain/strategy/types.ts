import type { CandleDto, StrategyCode, StrategyConfig, StrategySignal } from "@fomo/shared";
import type { IndicatorState } from "../indicators/indicatorEngine.js";

export interface StrategyRuntimeRecord {
  id: string;
  key: string;
  code?: StrategyCode;
  name: string;
  symbol: string;
  timeframe: string;
  config: StrategyConfig;
}

export interface StrategyContext {
  candles: CandleDto[];
  indicatorState: IndicatorState;
  hasOpenPosition: boolean;
}

export interface StrategyDefinition<TConfig extends StrategyConfig = StrategyConfig> {
  key: TConfig["key"];
  evaluate(input: StrategyContext & { config: TConfig }): StrategySignal;
}
