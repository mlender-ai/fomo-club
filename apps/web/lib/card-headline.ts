import {
  synthesizeDiscoveryInsight,
  type DiscoveryCandidate,
  type DiscoveryEvent,
  type DiscoveryInsightSynthesis,
} from "@fomo/core";

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
  reason?: string;
  sourceLabel?: string;
}

const FALLBACK_TEXT = "아직 공개된 계기 없음";
const DISCOVERY_REASON_JOINER = " — ";

const EMPTY_PATTERN = /아직\s*공개된\s*계기\s*없음|뚜렷한\s*이유는\s*아직|더\s*살펴볼|더\s*확인할|발견\s*풀/;
const ABSTRACT_MATERIAL_PATTERN =
  /^(?:뉴스|공시|계약|수주|실적|제품|파트너십|공급계약|해외 수주)(?:에)?\s*(?:직접\s*)?(?:재료|수급|거래|동종 종목 비교)?(?:도)?\s*(?:붙었|확인됐|나왔)어요\.?$/;
const WHAT_ONLY_PATTERN =
  /거래가|거래량|평소\s*\d|변동성|상대강도|시장\s*위치|종목\s+중|시총\s*\d|오늘\s*[+-]?\d|움직였|강했|셌|\d+\s*\/\s*\d+/;

function cleanInline(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function stripSourceAndTime(text: string): string {
  return text
    .replace(/^(?:오늘|최근)\s+/, "")
    .replace(/\s*·\s*[^.。]+[.。]?$/g, "")
    .replace(/[.。]+$/g, "")
    .trim();
}

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

function normalizeComparable(text: string | undefined): string {
  return cleanInline(text)
    .replace(/[.。"'“”‘’]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function isRawTitleLike(text: string | undefined, sourceTitle: string | undefined): boolean {
  const headline = normalizeComparable(text);
  const title = normalizeComparable(sourceTitle);
  if (!headline || !title || headline.length < 8 || title.length < 8) return false;
  return title.includes(headline) || headline.includes(title.slice(0, Math.min(24, title.length)));
}

function topicFromMaterial(detail: string): string {
  const title = stripSourceAndTime(detail);
  const lower = title.toLowerCase();
  if (/해외\s*수주/.test(title)) return "해외 수주";
  if (/공급계약/.test(title)) return "공급계약";
  if (/계약|contract|deal|order/.test(lower)) return "계약";
  if (/수주/.test(title)) return "수주";
  if (/실적|가이던스|매출|earnings|revenue|guidance|results/.test(lower)) return "실적";
  if (/sec|공시|filing|8-k|10-q/.test(lower)) return "공시";
  if (/파트너십|제휴|partnership|customer/.test(lower)) return "파트너십";
  if (/제품|출시|인프라|launch|product|infrastructure/.test(lower)) return "제품";
  const compact = title
    .replace(/['"“”‘’]/g, "")
    .split(/[,，:：\-–—]/)[0]
    ?.trim();
  return compact && compact.length <= 10 ? compact : "뉴스";
}

function supportFromDetail(detail: string): string {
  if (/수급|외국인|기관|순매수|사는 중/.test(detail)) return "수급도 붙었어요";
  if (/거래량|거래가|거래도/.test(detail)) return "거래도 붙었어요";
  if (/동종|섹터|종목들 중/.test(detail)) return "동종 종목 비교도 붙었어요";
  return "직접 재료가 붙었어요";
}

function compactMaterialHeadline(detail: string): string | undefined {
  const clean = stripSourceAndTime(detail);
  if (!clean) return undefined;
  const topic = topicFromMaterial(clean);
  const support = supportFromDetail(clean);
  return topic === "뉴스" ? support : `${topic}에 ${support}`;
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

function isUsableSynthesis(text: string | undefined, sourceTitle: string | undefined): text is string {
  const clean = cleanInline(text);
  if (!clean || EMPTY_PATTERN.test(clean)) return false;
  if (ABSTRACT_MATERIAL_PATTERN.test(clean)) return false;
  if (isRawTitleLike(clean, sourceTitle)) return false;
  return true;
}

function isMaterialEvent(event: DiscoveryEvent | undefined): boolean {
  return event?.kind === "news_mention" || event?.kind === "disclosure";
}

export function resolveCardHeadline(input: ResolveCardHeadlineInput): CardHeadline {
  const synthesis = input.synthesis ?? synthesizeDiscoveryInsight(input.candidate);
  const primary = synthesis.primary;
  const sourceTitle = primary?.sourceTitle?.trim() ?? sourceTitleFromLabel(input.sourceLabel);
  const reasonParts = splitReasonDetail(input.reason);
  const reasonDetail = reasonParts.detail ?? input.reason;

  if (isUsableSynthesis(synthesis.headline, sourceTitle)) {
    const eventRef = eventRefFrom(primary);
    return {
      text: cleanInline(synthesis.headline),
      provenance: "synthesis",
      method: input.candidate.synthesizedInsight ? "ai" : "rule",
      ...(eventRef ? { eventRef } : {}),
    };
  }

  if (isMaterialEvent(primary)) {
    const materialSeed = sourceTitle ?? primary?.headlineHook ?? primary?.label ?? reasonDetail;
    const materialHeadline = materialSeed ? compactMaterialHeadline(materialSeed) : undefined;
    if (materialHeadline && !ABSTRACT_MATERIAL_PATTERN.test(materialHeadline)) {
      const eventRef = eventRefFrom(primary);
      return {
        text: materialHeadline,
        provenance: "rule",
        method: "rule",
        ...(eventRef ? { eventRef } : {}),
      };
    }
  }

  if (isUsableSynthesis(reasonDetail, sourceTitle) && !WHAT_ONLY_PATTERN.test(reasonDetail ?? "")) {
    const eventRef = eventRefFrom(primary);
    return {
      text: cleanInline(reasonDetail),
      provenance: "rule",
      method: "rule",
      ...(eventRef ? { eventRef } : {}),
    };
  }

  const eventRef = eventRefFrom(primary);
  return {
    text: FALLBACK_TEXT,
    provenance: "suppressed",
    method: "none",
    ...(eventRef ? { eventRef } : {}),
  };
}
