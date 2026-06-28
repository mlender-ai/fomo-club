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

function topicFromMaterial(detail: string): string {
  const title = stripSourceAndTime(detail);
  const lower = title.toLowerCase();
  if (/해외\s*수주/.test(title)) return "해외 수주";
  if (/공급계약|계약|contract|deal|order/.test(lower)) return "계약";
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
  if (/동종|섹터|흐름|종목들 중/.test(detail)) return "동종 흐름도 붙었어요";
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

const SECTOR_THESIS: Array<{ pattern: RegExp; subject: string }> = [
  { pattern: /전기차|자동차|모빌리티/, subject: "전기차 수요를 보는 종목" },
  { pattern: /클라우드|데이터|소프트웨어|AI/, subject: "AI·데이터 인프라를 보는 종목" },
  { pattern: /반도체|기판|장비|소재/, subject: "반도체 장비·소재 흐름을 보는 종목" },
  { pattern: /바이오|제약|헬스케어/, subject: "임상·신약 모멘텀을 보는 종목" },
  { pattern: /화장품|뷰티/, subject: "K뷰티 수요를 보는 종목" },
  { pattern: /유통|백화점|소비/, subject: "소비 회복 흐름을 보는 종목" },
  { pattern: /금융|보험|증권|은행/, subject: "금리·금융 업황을 보는 종목" },
  { pattern: /에너지|전력|원전|태양광|풍력/, subject: "전력·에너지 투자 흐름을 보는 종목" },
  { pattern: /건설|건자재/, subject: "수주·정책 흐름을 보는 종목" },
  { pattern: /게임/, subject: "게임 신작·운영 흐름을 보는 종목" },
  { pattern: /방산|우주|항공/, subject: "국방·우주 수요를 보는 종목" },
  { pattern: /조선|해양/, subject: "선박 발주 흐름을 보는 종목" },
];

const STOCK_THESIS: Array<{ pattern: RegExp; subject: string }> = [
  { pattern: /루시드|Lucid/i, subject: "프리미엄 전기차 수요를 보는 루시드" },
  { pattern: /몽고|Mongo/i, subject: "AI 앱 데이터 수요를 보는 몽고DB" },
  { pattern: /사운드하운드|SoundHound/i, subject: "음성 AI 상용화를 보는 사운드하운드AI" },
  { pattern: /광주신세계/, subject: "호남 소비 흐름을 보는 광주신세계" },
  { pattern: /롯데손해보험/, subject: "보험 업황을 보는 롯데손해보험" },
];

function thesisSubject(ticker: string | undefined, sector: string): string {
  const stockName = cleanInline(ticker);
  const stockMatch = STOCK_THESIS.find((entry) => entry.pattern.test(stockName));
  if (stockMatch) return stockMatch.subject;
  const sectorMatch = SECTOR_THESIS.find((entry) => entry.pattern.test(sector));
  return sectorMatch?.subject ?? `${sector} 흐름을 보는 종목`;
}

function contextHeadline(ticker: string | undefined, sector: string, detail: string): string {
  const subject = thesisSubject(ticker, sector);
  if (/원문|근거는 아직|수급·거래·뉴스/.test(detail)) {
    return `${subject}, 원문 근거는 아직 얇아요`;
  }
  if (/제일|가장|먼저|상위권|눈에 띄/.test(detail)) {
    return `${subject}에 먼저 반응이 붙었어요`;
  }
  return `${subject}에 새 움직임이 붙었어요`;
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
    const displaySector = sectorFromDetail(detail, sector);
    return clipped(contextHeadline(ticker, displaySector, detail), 42);
  }

  if (state === "이유 얇은 섹터선두") {
    const displaySector = sectorFromDetail(detail, sector);
    return clipped(contextHeadline(ticker, displaySector, detail), 42);
  }

  if (state === "뉴스 재료 붙은 종목" || state === "공시 먼저 뜬 종목" || (!state && /뉴스|공시|소식|계약|수주/.test(clean))) {
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

  return undefined;
}
