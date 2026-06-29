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

  if (state?.includes("수급")) {
    if (/외국인/.test(detail)) return "외국인 수급이 먼저 들어왔어요";
    if (/기관/.test(detail)) return "기관 수급이 먼저 들어왔어요";
    return "수급이 먼저 들어온 종목이에요";
  }

  if (state?.includes("거래") || state?.includes("새 가격대")) return undefined;

  const normalized = normalizeSurfaceCopy(detail);
  if (isSurfaceMaterial(normalized) && !/뉴스|공시|소식|계약|수주/.test(clean)) return clipped(normalized, 44);

  return undefined;
}
