import {
  synthesizeDiscoveryInsight,
  type DiscoveryCandidate,
  type DiscoveryEvent,
  type DiscoveryInsightSynthesis,
} from "@fomo/core";
import {
  cleanInline,
  hasConcreteSourceValue,
  hasExcessiveLatinHeadline,
  hasForbiddenCopy,
  isAbstractTemplate,
  isRawTitleCopy,
} from "./copy-guards";
import { synthesizeWhyDrivenInsight } from "./insight-synthesis";
import { ruleReprocessNewsHook } from "./news-reprocess";

export type CardHeadlineProvenance = "synthesis" | "rule" | "suppressed";
export type CardHeadlineMethod = "ai" | "rule" | "none";

export interface CardHeadline {
  text: string;
  provenance: CardHeadlineProvenance;
  method: CardHeadlineMethod;
  eventRef?: {
    kind: DiscoveryEvent["kind"];
    source?: string;
    asOf?: string;
    title?: string;
    url?: string;
  };
}

export interface ResolveCardHeadlineInput {
  candidate: DiscoveryCandidate;
  synthesis?: DiscoveryInsightSynthesis;
  synthesisMethod?: CardHeadlineMethod;
  reason?: string;
  sourceLabel?: string;
}

const DISCOVERY_REASON_JOINER = " — ";

const EMPTY_PATTERN = /아직\s*공개된\s*계기\s*없음|뚜렷한\s*이유는\s*아직|더\s*살펴볼|더\s*확인할|발견\s*풀/;
const WHAT_ONLY_PATTERN =
  /거래가|거래량|평소\s*\d|변동성|상대강도|시장\s*위치|종목\s+중|시총\s*\d|오늘\s*[+-]?\d|움직였|강했|셌|\d+\s*\/\s*\d+/;

function splitReasonDetail(text: string | undefined): { state?: string; detail?: string } {
  const clean = cleanInline(text);
  if (!clean || !clean.includes(DISCOVERY_REASON_JOINER)) return {};
  const [rawState, ...rest] = clean.split(DISCOVERY_REASON_JOINER);
  const state = rawState?.trim();
  const detail = rest.join(DISCOVERY_REASON_JOINER).trim();
  if (!state || state.length > 24) return {};
  return {
    state,
    ...(detail ? { detail } : {}),
  };
}

function sourceTitleFromLabel(sourceLabel: string | undefined): string | undefined {
  const clean = cleanInline(sourceLabel);
  if (!clean) return undefined;
  return clean.split(/\s+·\s+/)[0]?.trim();
}

function eventRefFrom(event: DiscoveryEvent | undefined): CardHeadline["eventRef"] | undefined {
  if (!event) return undefined;
  const ref: NonNullable<CardHeadline["eventRef"]> = {
    kind: event.kind,
  };
  const source = event.sourceName ?? event.source;
  const asOf = event.publishedAt ?? event.asOf;
  const title = event.sourceTitle ?? event.label;
  if (source) ref.source = source;
  if (asOf) ref.asOf = asOf;
  if (title) ref.title = title;
  if (event.sourceUrl) ref.url = event.sourceUrl;
  return ref;
}

function eventSourceTitle(event: DiscoveryEvent | undefined): string | undefined {
  const sourceTitle = cleanInline(event?.sourceTitle);
  if (sourceTitle && !isAbstractTemplate(sourceTitle)) return sourceTitle;
  const headlineHook = cleanInline(event?.headlineHook);
  if (headlineHook && !isAbstractTemplate(headlineHook)) return headlineHook;
  const label = cleanInline(event?.label);
  if (label && !isAbstractTemplate(label)) return label;
  return undefined;
}

function isUsableHeadline(text: string | undefined, sourceTitle: string | undefined): text is string {
  const clean = cleanInline(text);
  if (!clean || EMPTY_PATTERN.test(clean)) return false;
  if (hasExcessiveLatinHeadline(clean)) return false;
  if (hasForbiddenCopy(clean) || isAbstractTemplate(clean)) return false;
  if (isRawTitleCopy(clean, sourceTitle)) return false;
  if (sourceTitle && !hasConcreteSourceValue(clean, sourceTitle)) return false;
  return true;
}

function isMaterialEvent(event: DiscoveryEvent | undefined): boolean {
  return event?.kind === "news_mention" || event?.kind === "disclosure";
}

function materialEventFrom(candidate: DiscoveryCandidate, primary: DiscoveryEvent | undefined): DiscoveryEvent | undefined {
  if (isMaterialEvent(primary)) return primary;
  return candidate.events.find(isMaterialEvent);
}

function ruleHeadlineFromMaterial(
  candidate: DiscoveryCandidate,
  primary: DiscoveryEvent | undefined,
  sourceTitle: string | undefined
): string | undefined {
  if (!isMaterialEvent(primary)) return undefined;
  const title = sourceTitle ?? eventSourceTitle(primary);
  if (!title) return undefined;
  return ruleReprocessNewsHook({
    stock: candidate.ticker,
    sector: candidate.sector,
    title,
    source: primary?.sourceName ?? primary?.source,
    changePct: primary?.changePct,
    asOf: primary?.publishedAt ?? primary?.asOf ?? candidate.asOf,
  });
}

async function resolveSynthesis(input: ResolveCardHeadlineInput): Promise<{
  synthesis: DiscoveryInsightSynthesis;
  method: CardHeadlineMethod;
}> {
  if (input.synthesis) {
    return { synthesis: input.synthesis, method: input.synthesisMethod ?? "rule" };
  }
  const result = await synthesizeWhyDrivenInsight(input.candidate);
  if (result.insight) {
    return {
      synthesis: result.insight,
      method: result.method === "ai" ? "ai" : "rule",
    };
  }
  return {
    synthesis: synthesizeDiscoveryInsight(input.candidate),
    method: "rule",
  };
}

export async function resolveCardHeadline(input: ResolveCardHeadlineInput): Promise<CardHeadline> {
  const { synthesis, method } = await resolveSynthesis(input);
  const primary = synthesis.primary;
  const materialEvent = materialEventFrom(input.candidate, primary);
  const sourceTitle =
    eventSourceTitle(materialEvent) ?? eventSourceTitle(primary) ?? sourceTitleFromLabel(input.sourceLabel);
  const reasonParts = splitReasonDetail(input.reason);
  const reasonDetail = reasonParts.detail ?? input.reason;

  if (isUsableHeadline(synthesis.headline, sourceTitle)) {
    const eventRef = eventRefFrom(primary ?? materialEvent);
    return {
      text: cleanInline(synthesis.headline),
      provenance: "synthesis",
      method,
      ...(eventRef ? { eventRef } : {}),
    };
  }

  const materialHeadline = ruleHeadlineFromMaterial(input.candidate, materialEvent, sourceTitle);
  if (isUsableHeadline(materialHeadline, sourceTitle)) {
    const eventRef = eventRefFrom(materialEvent ?? primary);
    return {
      text: cleanInline(materialHeadline),
      provenance: "rule",
      method: "rule",
      ...(eventRef ? { eventRef } : {}),
    };
  }

  if (isUsableHeadline(reasonDetail, sourceTitle) && !WHAT_ONLY_PATTERN.test(reasonDetail ?? "")) {
    const eventRef = eventRefFrom(primary ?? materialEvent);
    return {
      text: cleanInline(reasonDetail),
      provenance: "rule",
      method: "rule",
      ...(eventRef ? { eventRef } : {}),
    };
  }

  const eventRef = eventRefFrom(primary ?? materialEvent);
  return {
    text: "",
    provenance: "suppressed",
    method: "none",
    ...(eventRef ? { eventRef } : {}),
  };
}
