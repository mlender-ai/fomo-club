import {
  synthesizeDiscoveryInsight,
  type DiscoveryCandidate,
  type DiscoveryEvent,
  type DiscoveryInsightSynthesis,
} from "@fomo/core";
import {
  cleanInline,
  hasConcreteSourceValue,
  hasEnglishFragmentHeadline,
  hasExcessiveLatinHeadline,
  hasForbiddenCopy,
  isAbstractTemplate,
  isRawTitleCopy,
} from "./copy-guards";
import { synthesizeWhyDrivenInsight } from "./insight-synthesis";
import { ruleReprocessNewsHook } from "./news-reprocess";
import { resolvedCardAxis, type CardAxis } from "./card-axis";

export type CardHeadlineProvenance = "synthesis" | "rule" | "suppressed";
export type CardHeadlineMethod = "ai" | "rule" | "none";

export interface CardHeadline {
  text: string;
  provenance: CardHeadlineProvenance;
  method: CardHeadlineMethod;
  axis?: CardAxis;
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
const SURFACE_METRIC_PATTERN =
  /[+\-]\d+(?:\.\d+)?%|거래량\s*\d+(?:\.\d+)?배|외국인|기관|순매수|순매도|동종 평균보다|억|조|달러/;
const MATERIAL_CONTEXT_PATTERN =
  /특허|공시|계약|수주|제휴|협력|파트너십|실적|매출|가이던스|인도량|공급|선정|투자|증자|자사주|인수전|클러스터|임상|승인|허가|제품|개발|확보|체결|발표|8-K|10-Q|SEC|리테일|고객|우선협상자|관리운영|급여|출시|치료|서비스|상한가|신탁|상업화|권리|할증|렌탈|지원|종료|공개|항공우주|플랫폼|협업|판매|데이터|분기|준수율|내부통제|파업|전환|발행|처분|사업|위탁|공장|신규|후보물질|배터리|반도체|AI|FDA|조달|매각|인수|합병|계열사|자회사|소송|담합|반독점/;

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

function eventSourceText(event: DiscoveryEvent | undefined): string | undefined {
  const parts = [event?.sourceTitle, event?.summary, event?.headlineHook, event?.label]
    .map(cleanInline)
    .filter(Boolean)
    .filter((text) => !isAbstractTemplate(text));
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function isUsableHeadline(
  text: string | undefined,
  sourceText: string | undefined,
  rawTitle: string | undefined,
  axis: CardAxis
): text is string {
  const clean = cleanInline(text);
  if (!clean || EMPTY_PATTERN.test(clean)) return false;
  if (hasExcessiveLatinHeadline(clean) || hasEnglishFragmentHeadline(clean)) return false;
  if (hasForbiddenCopy(clean) || isAbstractTemplate(clean)) return false;
  if (isRawTitleCopy(clean, rawTitle ?? sourceText)) return false;
  if (axis === "price" && !/[+\-]\d+(?:\.\d+)?%/.test(clean)) return false;
  if (axis === "supply" && !/(?:외국인|기관|개인|수급).{0,16}(?:\d+일|연속|순매수)|순매수/.test(clean)) return false;
  if (axis !== "material" && !SURFACE_METRIC_PATTERN.test(clean)) return false;
  const hasSourceConcrete = sourceText ? hasConcreteSourceValue(clean, sourceText) : false;
  if (!hasSourceConcrete && !MATERIAL_CONTEXT_PATTERN.test(clean)) return false;
  return true;
}

function isMaterialEvent(event: DiscoveryEvent | undefined): boolean {
  return event?.kind === "news_mention" || event?.kind === "disclosure";
}

function materialEventFrom(candidate: DiscoveryCandidate, primary: DiscoveryEvent | undefined): DiscoveryEvent | undefined {
  if (isMaterialEvent(primary)) return primary;
  return candidate.events.find(isMaterialEvent);
}

function strongestChangePct(candidate: DiscoveryCandidate): number | undefined {
  return candidate.events
    .map((event) => event.changePct)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => Math.abs(b) - Math.abs(a))[0];
}

function ruleHeadlineFromMaterial(
  candidate: DiscoveryCandidate,
  primary: DiscoveryEvent | undefined,
  sourceTitle: string | undefined
): string | undefined {
  if (!isMaterialEvent(primary)) return undefined;
  if (resolvedCardAxis(candidate) !== "price") return undefined;
  const title = sourceTitle ?? eventSourceTitle(primary);
  if (!title) return undefined;
  return ruleReprocessNewsHook({
    stock: candidate.ticker,
    sector: candidate.sector,
    title,
    summary: primary?.summary,
    source: primary?.sourceName ?? primary?.source,
    changePct: primary?.changePct ?? strongestChangePct(candidate),
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
  const axis = resolvedCardAxis(input.candidate);
  const primary = synthesis.primary;
  const materialEvent = materialEventFrom(input.candidate, primary);
  const rawTitle =
    eventSourceTitle(materialEvent) ?? eventSourceTitle(primary) ?? sourceTitleFromLabel(input.sourceLabel);
  const sourceText =
    eventSourceText(materialEvent) ?? eventSourceText(primary) ?? sourceTitleFromLabel(input.sourceLabel);
  const reasonParts = splitReasonDetail(input.reason);
  const reasonDetail = reasonParts.detail ?? input.reason;

  if (isUsableHeadline(synthesis.headline, sourceText, rawTitle, axis)) {
    const eventRef = eventRefFrom(primary ?? materialEvent);
    return {
      text: cleanInline(synthesis.headline),
      provenance: "synthesis",
      method,
      axis,
      ...(eventRef ? { eventRef } : {}),
    };
  }

  const materialHeadline = ruleHeadlineFromMaterial(input.candidate, materialEvent, rawTitle);
  if (isUsableHeadline(materialHeadline, sourceText, rawTitle, axis)) {
    const eventRef = eventRefFrom(materialEvent ?? primary);
    return {
      text: cleanInline(materialHeadline),
      provenance: "rule",
      method: "rule",
      axis,
      ...(eventRef ? { eventRef } : {}),
    };
  }

  if (isUsableHeadline(reasonDetail, sourceText, rawTitle, axis) && !WHAT_ONLY_PATTERN.test(reasonDetail ?? "")) {
    const eventRef = eventRefFrom(primary ?? materialEvent);
    return {
      text: cleanInline(reasonDetail),
      provenance: "rule",
      method: "rule",
      axis,
      ...(eventRef ? { eventRef } : {}),
    };
  }

  const eventRef = eventRefFrom(primary ?? materialEvent);
  return {
    text: "",
    provenance: "suppressed",
    method: "none",
    axis,
    ...(eventRef ? { eventRef } : {}),
  };
}
