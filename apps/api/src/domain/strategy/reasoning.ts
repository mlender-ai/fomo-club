import type { SignalReason, StrategySignal } from "@fomo/shared";

const fallbackReason: SignalReason = {
  code: "UNSPECIFIED",
  message: "No explicit reason was attached to this decision.",
  meta: {}
};

export function getPrimaryReason(reasons: SignalReason[]): SignalReason {
  return reasons[0] ?? fallbackReason;
}

export function buildSignalReasonPayload(signal: StrategySignal): Record<string, unknown> {
  return {
    reasons: signal.reasons,
    indicators: signal.indicators,
    reasonText: signal.reasonText,
    ...signal.reasonMeta
  };
}

