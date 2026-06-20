import { IndicatorEngine } from "../indicators/indicatorEngine.js";
import { bbMeanReversionStrategy } from "./strategies/bbMeanReversionStrategy.js";
import type { StrategyDefinition, StrategyRuntimeRecord } from "./types.js";
import type { CandleDto, StrategySignal } from "@fomo/shared";

const registry = {
  "bb-mean-reversion": bbMeanReversionStrategy
} as const;

export class StrategyEvaluator {
  constructor(private readonly indicatorEngine = new IndicatorEngine()) {}

  evaluate(strategy: StrategyRuntimeRecord, candles: CandleDto[], hasOpenPosition: boolean): StrategySignal {
    const definition = registry[strategy.config.key] as StrategyDefinition;

    if (!definition) {
      throw new Error(`Strategy ${strategy.key} is not implemented.`);
    }

    const indicatorState = this.indicatorEngine.calculate(candles, strategy.config);

    return definition.evaluate({
      config: strategy.config,
      candles,
      indicatorState,
      hasOpenPosition
    });
  }
}
