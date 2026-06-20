import type { OrderRole } from "@fomo/shared";

export interface FeeModelInput {
  makerFeeRate: number;
  takerFeeRate: number;
  entryOrderRole: OrderRole;
  exitOrderRole: OrderRole;
  slippageBps: number;
}

export function resolveFeeRate(model: Pick<FeeModelInput, "makerFeeRate" | "takerFeeRate">, role: OrderRole): number {
  return role === "MAKER" ? model.makerFeeRate : model.takerFeeRate;
}

export function estimateRoundTripCostPct(model: FeeModelInput): number {
  const feePct = (resolveFeeRate(model, model.entryOrderRole) + resolveFeeRate(model, model.exitOrderRole)) * 100;
  const slippagePct = ((model.slippageBps * 2) / 10_000) * 100;

  return Number((feePct + slippagePct).toFixed(4));
}

export function applyExecutionPrice(price: number, side: "BUY" | "SELL", slippageBps: number): number {
  const slippageMultiplier = side === "BUY" ? 1 + slippageBps / 10_000 : 1 - slippageBps / 10_000;

  return Number((price * slippageMultiplier).toFixed(2));
}
