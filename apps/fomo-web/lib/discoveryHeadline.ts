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

const WHAT_ONLY_SURFACE_COPY_PATTERN =
  /거래가|거래량|평소\s*\d|변동성|동종\s*비교|상대강도|시장\s*위치|테마\s*상대|종목\s+중|시총\s*\d|오늘\s*[+-]?\d|움직였|강했|셌|신호가\s*잡혔|확인된\s*종목|확인하는\s*종목|\d+\s*\/\s*\d+/;

function normalizeSurfaceCopy(text: string): string {
  return stripSourceAndTime(text)
    .replace(/^\s*[—-]\s*/g, "")
    .replace(/[.。]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function clipped(text: string, max = 34): string {
  const clean = cleanInline(text);
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function isSurfaceMaterial(text: string): boolean {
  return !BAD_SURFACE_COPY_PATTERN.test(text) && !WHAT_ONLY_SURFACE_COPY_PATTERN.test(text) && text.length > 8;
}

export function compactDiscoveryCardHeadline({
  reason,
}: DiscoveryHeadlineInput): string | undefined {
  const clean = cleanInline(reason);
  if (!clean) return undefined;

  const parts = splitDiscoveryReason(clean);
  const state = parts.state;
  const detail = parts.detail ?? clean;

  if (state === "뉴스 재료 붙은 종목" || state === "공시 먼저 뜬 종목" || (!state && /뉴스|공시|소식|계약|수주/.test(clean))) {
    const material = normalizeSurfaceCopy(detail);
    if (isSurfaceMaterial(material)) return clipped(material, 44);
    const topic = topicFromMaterial(detail);
    const support = supportFromDetail(detail);
    return topic === "뉴스" ? support : `${topic}에 ${support}`;
  }

  if (state?.includes("수급")) {
    if (/외국인/.test(detail)) return "외국인 수급이 먼저 들어왔어요";
    if (/기관/.test(detail)) return "기관 수급이 먼저 들어왔어요";
    return "수급이 먼저 들어온 종목이에요";
  }

  if (state?.includes("거래") || state?.includes("새 가격대")) return undefined;

  const normalized = normalizeSurfaceCopy(detail);
  if (isSurfaceMaterial(normalized)) return clipped(normalized, 44);

  return undefined;
}
