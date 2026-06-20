import { BollingerBands, RSI } from "technicalindicators";
import type { CandleDto, IndicatorSnapshot, StrategyConfig } from "@fomo/shared";

export interface IndicatorState {
  previous: IndicatorSnapshot;
  latest: IndicatorSnapshot;
}

function pick<T>(values: T[], offset = 0): T | null {
  return values.at(values.length - 1 - offset) ?? null;
}

function createSnapshot(
  close: number,
  rsi: number | null,
  bbUpper: number | null,
  bbMiddle: number | null,
  bbLower: number | null,
  bandWidthPct: number | null
): IndicatorSnapshot {
  return {
    close,
    rsi,
    bbUpper,
    bbMiddle,
    bbLower,
    bandWidthPct
  };
}

export class IndicatorEngine {
  calculate(candles: CandleDto[], config: StrategyConfig): IndicatorState {
    const closes = candles.map((candle) => candle.close);
    const rsiPeriod = config.rsiPeriod;
    const bbPeriod = config.bbPeriod;
    const bbStdDev = config.bbStdDev;
    const rsiSeries = RSI.calculate({ period: rsiPeriod, values: closes });
    const bbSeries = BollingerBands.calculate({
      values: closes,
      period: bbPeriod,
      stdDev: bbStdDev
    });

    const latestClose = closes.at(-1) ?? 0;
    const previousClose = closes.at(-2) ?? latestClose;
    const previousBb = pick(bbSeries, 1);
    const latestBb = pick(bbSeries);

    return {
      previous: createSnapshot(
        previousClose,
        pick(rsiSeries, 1),
        previousBb?.upper ?? null,
        previousBb?.middle ?? null,
        previousBb?.lower ?? null,
        previousBb?.middle
          ? Number((((previousBb.upper - previousBb.lower) / previousBb.middle) * 100).toFixed(4))
          : null
      ),
      latest: createSnapshot(
        latestClose,
        pick(rsiSeries),
        latestBb?.upper ?? null,
        latestBb?.middle ?? null,
        latestBb?.lower ?? null,
        latestBb?.middle ? Number((((latestBb.upper - latestBb.lower) / latestBb.middle) * 100).toFixed(4)) : null
      )
    };
  }
}
