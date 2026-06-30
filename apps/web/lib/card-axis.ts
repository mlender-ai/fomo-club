import type { DiscoveryCandidate, DiscoveryEvent } from "@fomo/core";

export type CardAxis = "price" | "supply" | "material";

export const CARD_AXIS_PRICE_TOP_PCT = 15;
export const CARD_AXIS_PRICE_MIN_PCT = 7;
export const CARD_AXIS_SUPPLY_MIN_DAYS = 3;
export const CARD_AXIS_SUPPLY_TOP_DAYS = 5;
export const CARD_AXIS_SUPPLY_AMOUNT_BONUS = 0.2;

export interface CardAxisStrength {
  price: number;
  supply: number;
  material: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function eventChangePct(event: DiscoveryEvent): number {
  return typeof event.changePct === "number" && Number.isFinite(event.changePct) ? event.changePct : 0;
}

export function strongestChangePct(candidate: DiscoveryCandidate): number | undefined {
  const values = candidate.events
    .map((event) => eventChangePct(event))
    .filter((value) => value !== 0)
    .sort((a, b) => Math.abs(b) - Math.abs(a));
  return values[0];
}

export function strongestFlowEvent(candidate: DiscoveryCandidate): DiscoveryEvent | undefined {
  return candidate.events
    .filter((event) => event.kind === "flow_entry" && typeof event.flowDays === "number" && event.flowDays > 0)
    .sort((a, b) => {
      const days = (b.flowDays ?? 0) - (a.flowDays ?? 0);
      if (days !== 0) return days;
      const bAmount = b.flowAmountText ? 1 : 0;
      const aAmount = a.flowAmountText ? 1 : 0;
      return bAmount - aAmount;
    })[0];
}

export function axisStrength(candidate: DiscoveryCandidate): CardAxisStrength {
  const maxAbsChange = Math.abs(strongestChangePct(candidate) ?? 0);
  const flow = strongestFlowEvent(candidate);
  const flowDays = flow?.flowDays ?? 0;
  const material = Math.max(
    0,
    ...candidate.events
      .filter((event) => event.kind === "news_mention" || event.kind === "disclosure")
      .map((event) => (Number.isFinite(event.strength) ? event.strength : 0))
  );
  return {
    price: clamp01(maxAbsChange / CARD_AXIS_PRICE_TOP_PCT),
    supply: clamp01(flowDays / CARD_AXIS_SUPPLY_TOP_DAYS + (flow?.flowAmountText ? CARD_AXIS_SUPPLY_AMOUNT_BONUS : 0)),
    material: clamp01(material),
  };
}

export function selectDominantAxis(candidate: DiscoveryCandidate): CardAxis {
  const strength = axisStrength(candidate);
  const maxAbsChange = Math.abs(strongestChangePct(candidate) ?? 0);
  const flowDays = strongestFlowEvent(candidate)?.flowDays ?? 0;

  if (flowDays >= CARD_AXIS_SUPPLY_MIN_DAYS && strength.supply >= strength.price) {
    return "supply";
  }
  if (maxAbsChange >= CARD_AXIS_PRICE_MIN_PCT && strength.price >= strength.supply) {
    return "price";
  }
  return "material";
}

export function resolvedCardAxis(candidate: DiscoveryCandidate): CardAxis {
  return candidate.dominantAxis ?? selectDominantAxis(candidate);
}

function flowActorLabel(actor: DiscoveryEvent["flowActor"]): string {
  if (actor === "foreign") return "외국인";
  if (actor === "institution") return "기관";
  return "수급";
}

export function formatAxisMetric(candidate: DiscoveryCandidate, axis: CardAxis): string | undefined {
  if (axis === "price") {
    const change = strongestChangePct(candidate);
    if (typeof change !== "number") return undefined;
    const rounded = Math.abs(change) >= 10 ? change.toFixed(0) : change.toFixed(1);
    return `${change > 0 ? "+" : ""}${rounded.replace(/\.0$/, "")}%`;
  }

  if (axis === "supply") {
    const flow = strongestFlowEvent(candidate);
    if (!flow || !flow.flowDays || flow.flowDays < CARD_AXIS_SUPPLY_MIN_DAYS) return undefined;
    const actor = flowActorLabel(flow.flowActor);
    const amount = flow.flowAmountText ? ` ${flow.flowAmountText}` : "";
    return `${actor} ${flow.flowDays}일 연속 순매수${amount}`;
  }

  return undefined;
}
