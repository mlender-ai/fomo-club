const DISCOVERY_REASON_JOINER = " — ";

export interface DiscoveryHeadlineInput {
  reason?: string | undefined;
  sector?: string | undefined;
  ticker?: string | undefined;
  marketCapRank?: number | undefined;
}

interface ReasonParts {
  state?: string;
  detail?: string;
}

function cleanInline(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

export function splitDiscoveryReason(text: string | undefined): ReasonParts {
  const clean = cleanInline(text);
  if (!clean || !clean.includes(DISCOVERY_REASON_JOINER)) return {};
  const [rawState, ...rest] = clean.split(DISCOVERY_REASON_JOINER);
  const state = rawState?.trim();
  const detail = rest.join(DISCOVERY_REASON_JOINER).trim();
  if (!state || state.length > 16) return {};
  return {
    state,
    ...(detail ? { detail } : {}),
  };
}

function stripSourceAndTime(text: string): string {
  return text
    .replace(/^(?:오늘|최근)\s+/, "")
    .replace(/\s*·\s*[^.。]+[.。]?$/g, "")
    .replace(/[.。]+$/g, "")
    .trim();
}

const BAD_SURFACE_COPY_PATTERN =
  /혼자\s*튄|무명주|흐름\s+흐름|흐름\s*안에서|흐름보다\s*먼저\s*반응|먼저\s*반응|눈에\s*띄|원문\s*근거|근거는\s*아직|더\s*살펴볼|더\s*확인할|보는\s*종목/;

function normalizeSurfaceCopy(text: string, sector?: string, ticker?: string): string {
  const displaySector = cleanInline(sector) || "동종";
  const displayTicker = cleanInline(ticker);
  return stripSourceAndTime(
    text
      .replace(/뒤를\s*받칠\s*수급·거래·뉴스는\s*아직\s*안\s*보여요\.?/g, "")
      .replace(/원문·수급\s*근거는\s*아직\s*더\s*확인해야\s*해요\.?/g, "")
      .replace(/뉴스·공시·수급\s*근거는\s*아직\s*확인되지\s*않았어요\.?/g, "")
      .replace(/\s*·\s*(?:뉴시스|연합뉴스|한국경제|매일경제|Reuters|Bloomberg|CNBC|Yahoo Finance|SEC|DART|공시)[^.。]*[.。]?/gi, ".")
  )
    .replace(/^혼자\s*튄\s*무명주\s*[—-]\s*/g, "")
    .replace(/시총\s*\d+위권인데\s*/g, "")
    .replace(/시총\s*상위권인데\s*/g, "")
    .replace(/흐름\s+흐름/g, "흐름")
    .replace(/([가-힣A-Za-z0-9]+)\s*흐름\s*안에서\s*가장\s*먼저\s*눈에\s*띄었어요\.?/g, "같은 $1 종목들 중 오늘 변동성이 가장 컸어요")
    .replace(/([가-힣A-Za-z0-9]+)\s*흐름\s*안에서\s*상위권으로\s*눈에\s*띄었어요\.?/g, "같은 $1 종목들 중 오늘 변동성이 상위권이에요")
    .replace(/([가-힣A-Za-z0-9]+)\s*흐름보다\s*먼저\s*반응했어요\.?/g, "같은 $1 종목들보다 오늘 변동성이 더 컸어요")
    .replace(/([가-힣A-Za-z0-9]+)\s*안에서\s*변동성이\s*크게\s*잡혔어요\.?/g, "$1 종목 중 오늘 변동성이 크게 잡혔어요")
    .replace(/같은\s+(.+?)\s+종목들\s+중\s+오늘\s+제일\s+셌어요/g, "같은 $1 종목들 중 오늘 변동성이 가장 컸어요")
    .replace(/같은\s+(.+?)\s+종목들\s+중\s+오늘\s+가장\s+셌어요/g, "같은 $1 종목들 중 오늘 변동성이 가장 컸어요")
    .replace(/상대강도/g, "동종 비교")
    .replace(/시장\s*위치/g, "시장 안 비교")
    .replace(/테마\s*동종 비교/g, "동종 비교")
    .replace(/^\s*[—-]\s*/g, "")
    .replace(/[.。]+$/g, "")
    .replace(/\s+/g, " ")
    .trim() || (displayTicker ? `${displayTicker}에서 오늘 확인할 변화가 잡혔어요` : `같은 ${displaySector} 종목들과 다른 변동성이 잡혔어요`);
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

function sectorFromDetail(detail: string, fallback?: string): string {
  const sameSector = detail.match(/같은\s+(.+?)\s+종목들/);
  if (sameSector?.[1]) return sameSector[1].trim();
  const inSector = detail.match(/([가-힣A-Za-z0-9]+)\s+안에서/);
  if (inSector?.[1]) return inSector[1].trim();
  return fallback?.trim() || "섹터";
}

function clipped(text: string, max = 34): string {
  const clean = cleanInline(text);
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function compactDiscoveryCardHeadline({
  reason,
  sector,
  ticker,
}: DiscoveryHeadlineInput): string | undefined {
  const clean = cleanInline(reason);
  if (!clean) return undefined;

  const parts = splitDiscoveryReason(clean);
  const state = parts.state;
  const detail = parts.detail ?? clean;

  if (state === "혼자 튄 무명주") {
    return clipped(normalizeSurfaceCopy(detail, sectorFromDetail(detail, sector), ticker), 42);
  }

  if (state === "이유 얇은 섹터선두") {
    return clipped(normalizeSurfaceCopy(detail, sectorFromDetail(detail, sector), ticker), 42);
  }

  if (state === "뉴스 재료 붙은 종목" || state === "공시 먼저 뜬 종목" || (!state && /뉴스|공시|소식|계약|수주/.test(clean))) {
    const material = normalizeSurfaceCopy(detail, sector, ticker);
    if (material && !BAD_SURFACE_COPY_PATTERN.test(material) && material.length > 8) return clipped(material, 44);
    const topic = topicFromMaterial(detail);
    const support = supportFromDetail(detail);
    return topic === "뉴스" ? support : `${topic}에 ${support}`;
  }

  if (state?.includes("수급")) {
    if (/외국인/.test(detail)) return "외국인 수급이 먼저 들어왔어요";
    if (/기관/.test(detail)) return "기관 수급이 먼저 들어왔어요";
    return "수급이 먼저 들어온 종목이에요";
  }

  if (state?.includes("거래")) return "거래가 먼저 커진 종목이에요";
  if (state?.includes("새 가격대")) return "새 가격대까지 밟은 종목이에요";

  const normalized = normalizeSurfaceCopy(detail, sector, ticker);
  if (normalized && !BAD_SURFACE_COPY_PATTERN.test(normalized)) return clipped(normalized, 44);

  return undefined;
}
