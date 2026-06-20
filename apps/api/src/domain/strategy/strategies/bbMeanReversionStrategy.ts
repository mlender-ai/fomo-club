import type { BbMeanReversionConfig, SignalReason, StrategySignal } from "@fomo/shared";

import type { StrategyDefinition } from "../types.js";

function holdSignal(price: number, timestamp: string, indicators: StrategySignal["indicators"], symbol: string): StrategySignal {
  return {
    type: "HOLD",
    action: "CLOSE",
    symbol,
    price,
    timestamp,
    indicators,
    reasons: [
      {
        code: "NO_ACTION",
        message: "Price is within the reversion band.",
        meta: {}
      }
    ],
    reasonText: `${symbol} stayed inside the Bollinger range, so the strategy left the position unchanged.`,
    reasonMeta: {
      setup: "bb-mean-reversion"
    }
  };
}

export const bbMeanReversionStrategy: StrategyDefinition<BbMeanReversionConfig> = {
  key: "bb-mean-reversion",
  evaluate({ candles, indicatorState, hasOpenPosition, config }) {
    const timestamp = candles.at(-1)?.closeTime ?? new Date().toISOString();
    const price = indicatorState.latest.close;
    const latestRsi = indicatorState.latest.rsi;
    const bbLower = indicatorState.latest.bbLower;
    const bbMiddle = indicatorState.latest.bbMiddle;
    const bandWidthPct = indicatorState.latest.bandWidthPct;

    if (latestRsi === null || bbLower === null || bbMiddle === null) {
      return holdSignal(price, timestamp, indicatorState.latest, config.symbol);
    }

    if (!hasOpenPosition && price <= bbLower && latestRsi <= config.entryRsiFloor) {
      const lowerBandDeviationPct = Number((((bbLower - price) / bbLower) * 100).toFixed(4));
      const expectedReboundPct = Number((((bbMiddle - price) / price) * 100).toFixed(4));
      const reasons: SignalReason[] = [
        {
          code: "LOWER_BAND_TOUCH",
          message: "Price closed below the lower Bollinger Band.",
          meta: {
            price,
            bbLower,
            lowerBandDeviationPct
          }
        },
        {
          code: "RSI_OVERSOLD",
          message: "RSI moved into the oversold zone.",
          meta: {
            rsi: latestRsi,
            threshold: config.entryRsiFloor
          }
        }
      ];

      return {
        type: "ENTER",
        action: "BUY",
        symbol: config.symbol,
        price,
        timestamp,
        indicators: indicatorState.latest,
        reasons,
        reasonText: `${config.symbol} entered on ${config.timeframe} because price closed ${lowerBandDeviationPct.toFixed(
          2
        )}% below the lower Bollinger band while RSI cooled to ${latestRsi.toFixed(
          1
        )}. A move back to the mid band implies about ${expectedReboundPct.toFixed(2)}% gross upside.`,
        reasonMeta: {
          setup: "bb-mean-reversion",
          lowerBandDeviationPct,
          expectedReboundPct,
          bandWidthPct,
          rsi: latestRsi,
          bbLower,
          bbMiddle
        }
      };
    }

    if (hasOpenPosition && (price >= bbMiddle || latestRsi >= config.exitRsiCeiling)) {
      const reasons: SignalReason[] = [];

      if (price >= bbMiddle) {
        reasons.push({
          code: "MEAN_REVERSION_COMPLETE",
          message: "Price reverted back toward the Bollinger mid line.",
          meta: {
            price,
            bbMiddle
          }
        });
      }

      if (latestRsi >= config.exitRsiCeiling) {
        reasons.push({
          code: "RSI_RECOVERY",
          message: "RSI recovered above the exit threshold.",
          meta: {
            rsi: latestRsi,
            threshold: config.exitRsiCeiling
          }
        });
      }

      return {
        type: "EXIT",
        action: "CLOSE",
        symbol: config.symbol,
        price,
        timestamp,
        indicators: indicatorState.latest,
        reasons,
        reasonText: `${config.symbol} closed on ${config.timeframe} because price reverted toward the Bollinger mid band${
          price >= bbMiddle ? "" : " and"
        } RSI recovered to ${latestRsi.toFixed(1)}.`,
        reasonMeta: {
          setup: "bb-mean-reversion",
          bandWidthPct,
          rsi: latestRsi,
          bbMiddle,
          price
        }
      };
    }

    return holdSignal(price, timestamp, indicatorState.latest, config.symbol);
  }
};
