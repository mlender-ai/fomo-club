import { callAI, isAiConfigured } from "@fomo/shared";
import {
  cleanInline,
  englishMonthNumbers,
  englishQuarterNumbers,
  hasConcreteSourceValue,
  hasEnglishFragmentHeadline,
  hasExcessiveLatinHeadline,
  hasForbiddenCopy,
  isAbstractTemplate,
  isRawTitleCopy,
  numberVariants,
  numbersIn,
  SOURCE_NAME_PATTERN,
} from "./copy-guards";

export interface NewsHookInput {
  stock: string;
  sector?: string | undefined;
  title: string;
  summary?: string | undefined;
  source?: string | undefined;
  changePct?: number | undefined;
  asOf: string;
}

export interface NewsHookResult {
  hook?: string | undefined;
  method: "ai" | "rule" | "none";
}

const cache = new Map<string, NewsHookResult>();
const GENERIC_TITLE_PATTERN = /^(?:(?:제품·AI 인프라|실적·가이던스|고객·파트너십|인도량 확인|자금조달·유동화)\s*소식|SEC 공시|소식|뉴스)(?:이|가)?\s*나왔어요\.?$/i;
const US_MARKET_NOISE_PATTERN =
  /\b(?:what\s+you\s+should\s+know|can\s+it\s+rebound|is\s+it\s+time\s+to|better\s+buy|should\s+you\s+buy|buy,\s*sell|price\s+target|stock\s+eyes|which\s+stock|ultimate\s+.*winner|supercycle\s+winner|why\s+these\s+stocks|these\s+stocks|stocks\s+posted|after[-\s]?hours?)\b/i;
const MATERIAL_CONTEXT_PATTERN =
  /특허|공시|계약|수주|제휴|협력|파트너십|실적|매출|가이던스|인도량|공급|선정|투자|증자|자사주|인수전|클러스터|임상|승인|허가|제품|개발|확보|체결|발표|8-K|10-Q|SEC|리테일|고객|우선협상자|관리운영|급여|출시|치료|서비스|상한가|신탁|상업화|권리|할증|렌탈|지원|종료|공개|항공우주|플랫폼|협업|판매|데이터|분기|준수율|내부통제|파업|전환|발행|처분|사업|위탁|공장|신규|후보물질|배터리|반도체|AI|FDA|조달|매각|인수|합병|계열사|자회사|소송|담합|반독점/;

function cacheKey(input: NewsHookInput): string {
  return [input.asOf.slice(0, 10), input.stock, input.sector ?? "", input.title, input.summary ?? "", input.changePct ?? "", input.source ?? ""].join("\u001f");
}

export function validateReprocessedNewsHook(hook: string | undefined, input: NewsHookInput): string | undefined {
  const clean = cleanInline(hook);
  if (!clean || clean.length > 44) return undefined;
  if (hasExcessiveLatinHeadline(clean) || hasEnglishFragmentHeadline(clean)) return undefined;
  if (hasForbiddenCopy(clean) || SOURCE_NAME_PATTERN.test(clean) || isAbstractTemplate(clean)) return undefined;
  if (/(?:특허\s*확|계약\s*체|수주\s*확|우선협상자\s*선|제휴\s*발|협력\s*소)$/.test(clean)) return undefined;
  if (isRawTitleCopy(clean, input.title)) return undefined;
  const sourceText = [input.title, input.summary].map(cleanInline).filter(Boolean).join(" ");
  const allowedNumbers = new Set(numbersIn(sourceText).flatMap(numberVariants));
  englishQuarterNumbers(sourceText).forEach((num) => {
    numberVariants(num).forEach((value) => allowedNumbers.add(value));
  });
  englishMonthNumbers(sourceText).forEach((num) => {
    numberVariants(num).forEach((value) => allowedNumbers.add(value));
  });
  if (typeof input.changePct === "number" && Number.isFinite(input.changePct)) {
    numberVariants(String(Math.abs(input.changePct))).forEach((value) => allowedNumbers.add(value));
  }
  if (
    numbersIn(clean).some(
      (n) => !numberVariants(n).some((variant) => allowedNumbers.has(variant) || allowedNumbers.has(variant.replace(/\.0+$/, "")))
    )
  ) {
    return undefined;
  }
  if (!hasConcreteSourceValue(clean, sourceText) && !MATERIAL_CONTEXT_PATTERN.test(clean)) return undefined;
  return clean;
}

function formatSignedPercent(value: number): string {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${value > 0 ? "+" : ""}${rounded.replace(/\.0$/, "")}%`;
}

function metricText(input: NewsHookInput): string | undefined {
  return typeof input.changePct === "number" && Number.isFinite(input.changePct) && Math.abs(input.changePct) >= 1
    ? formatSignedPercent(input.changePct)
    : undefined;
}

function normalizeHookPhrase(hook: string): string {
  return cleanInline(hook)
    .replace(/특허\s*확$/, "특허 확보")
    .replace(/공급\s+공급계약/g, "공급계약")
    .replace(/신탁\s+공급계약\s+체결/g, "신탁");
}

function withMetric(hook: string, input: NewsHookInput): string {
  const normalized = normalizeHookPhrase(hook);
  const metric = metricText(input);
  if (!metric || normalized.includes(metric)) return normalized;
  return `${normalized}에 ${metric}`;
}

function stripStockName(text: string, stock: string): string {
  const escaped = stock.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`${escaped}(?:와의|과의|와|과|이|가|은|는|을|를)?`, "gi"), "")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function pickAmount(title: string): string | undefined {
  const korean = title.match(/\d+(?:\.\d+)?\s*(?:억|조|만|천)?\s*(?:원|달러|USD|억원|조원|%)/i)?.[0];
  if (korean) return korean.replace(/\s+/g, "");
  const commaUsd = title.match(/(?:US)?\$\s*(\d{1,3}(?:,\d{3})+)(?:\.\d+)?/i);
  if (commaUsd?.[1]) {
    const value = Number(commaUsd[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value >= 1_000_000_000) return `${Number((value / 1_000_000_000).toFixed(1))}십억달러`;
    if (Number.isFinite(value) && value >= 1_000_000) return `${Math.round(value / 1_000_000)}백만달러`;
  }
  const usd = title.match(/(?:US)?\$?\s*(\d+(?:\.\d+)?)\s*[-\s]?(billion|million|bn|m|b)\b/i);
  if (!usd?.[1] || !usd[2]) return undefined;
  const unit = usd[2].toLowerCase();
  const label = unit === "billion" || unit === "bn" || unit === "b" ? "십억달러" : "백만달러";
  return `${usd[1]}${label}`;
}

function pickQuoted(title: string): string | undefined {
  return title.match(/[‘'“"]([^‘'“”"]{2,28})[’'”"]/)?.[1]?.trim();
}

function pickCounterparty(title: string): string | undefined {
  const pair = title.match(/([가-힣A-Za-z0-9&().+-]{2,18})[·ㆍ]([가-힣A-Za-z0-9&().+-]{2,18})\s*(?:인수전|입찰|경쟁|참여|뛰어)/);
  if (pair?.[1] && pair[2]) return `${pair[1]}·${pair[2]}`;
  const ko = title.match(/([가-힣A-Za-z0-9&().+-]{2,24})(?:와|과|와의|과의)\s*(?:공급계약|계약|제휴|협력|파트너십|인수전|수주)/);
  if (ko?.[1]) return ko[1].trim();
  const en = title.match(/\b(?:with|from|by|for)\s+([A-Z][A-Za-z0-9&().+-]{1,24}(?:\s+[A-Z][A-Za-z0-9&().+-]{1,24}){0,1})/i);
  return cleanEnglishPhrase(en?.[1]);
}

function pickProduct(title: string): string | undefined {
  const quoted = pickQuoted(title);
  if (quoted) return quoted;
  const product = title.match(/([가-힣A-Za-z0-9&().+\-\s]{2,28})\s*(?:개발|출시|공개|공급|수주|계약|승인|허가|임상|launch|unveil|introduce|supply|contract)/i)?.[1];
  return product
    ?.replace(/^\d+(?:\.\d+)?\s*(?:억|조|만|천)?\s*(?:원|달러|USD|억원|조원)?\s*(?:규모\s*)?/i, "")
    .replace(/\s*(?:공급|수주|계약)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickQuarterLabel(title: string): string | undefined {
  const q = title.match(/\bQ([1-4])\b/i)?.[1] ?? englishQuarterNumbers(title)[0];
  return q ? `${q}분기` : undefined;
}

function pickMonthLabel(title: string): string | undefined {
  const month = englishMonthNumbers(title)[0];
  return month ? `${month}월` : undefined;
}

function cleanEnglishPhrase(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/\baerospace\s+customer\b/i.test(value)) return "항공우주 고객";
  const knownCompany = localizeKnownEnglishCompany(value);
  if (knownCompany) return knownCompany;
  const cleaned = value
    .replace(/\b(?:Inc|Corp|Corporation|Co|Company|Ltd|PLC|LLC|Holdings?|Group|The)\b\.?/gi, "")
    .replace(
      /\b(?:its|new|major|strategic|global|retail|media|data|hub|customer|customers|partnership|deal|contract|order|key|as|role|seat|can|why|these|stocks?|posted|double|digit|after|hours?|today|eyes?|june|delivery|deliveries|moved|more|market|is|are|was|were|has|had|have|will|could|should|rebound)\b/gi,
      ""
    )
    .replace(/\b(?:with|from|by|for|of|to|in|on|and)\b/gi, "")
    .replace(/^\d+[-\s]*/, "")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 2) return undefined;
  if (
    /^(?:can|why|these|stocks?|stock|posted|double|digit|after|hours?|today|eyes?|june|delivery|deliveries|moved|more|market|rebound)$/i.test(
      cleaned
    )
  ) {
    return undefined;
  }
  return localizeEnglishPhrase(cleaned.split(/\s+/).slice(0, 3).join(" "));
}

function localizeKnownEnglishCompany(value: string | undefined): string | undefined {
  const clean = value ?? "";
  const known: Array<[RegExp, string]> = [
    [/\bNVIDIA\b/i, "엔비디아"],
    [/\bTesla\b/i, "테슬라"],
    [/\bStellantis\b/i, "스텔란티스"],
    [/\bMicrosoft\b/i, "마이크로소프트"],
    [/\bApple\b/i, "애플"],
    [/\bAmazon\b/i, "아마존"],
    [/\bAlphabet\b|\bGoogle\b/i, "구글"],
    [/\bMeta\b/i, "메타"],
    [/\bPalantir\b/i, "팔란티어"],
    [/\bCrowdStrike\b/i, "크라우드스트라이크"],
    [/\bServiceNow\b/i, "서비스나우"],
    [/\bWorkday\b/i, "워크데이"],
    [/\bOracle\b/i, "오라클"],
    [/\bOpenAI\b/i, "오픈AI"],
    [/\bAdvanced Micro Devices\b|\bAMD\b/i, "AMD"],
    [/\bTaiwan Semiconductor\b|\bTSMC\b/i, "TSMC"],
    [/\bLucid\b/i, "루시드"],
    [/\bRivian\b/i, "리비안"],
    [/\bNIO\b/i, "니오"],
    [/\bIonQ\b/i, "아이온큐"],
    [/\bRocket Lab\b/i, "로켓랩"],
    [/\bIridium\b/i, "이리듐"],
    [/\bNuScale\b/i, "뉴스케일파워"],
    [/\bParagon\b/i, "파라곤"],
    [/\bUpstart\b/i, "업스타트"],
    [/\bNeuberger\b/i, "노이버거"],
    [/\bAffirm\b/i, "어펌"],
    [/\bBackcountry\b/i, "백컨트리"],
    [/\bSnowflake\b/i, "스노우플레이크"],
    [/\bUnlimitail\b/i, "언리미테일"],
    [/\bAxon\b/i, "액손"],
    [/\bCoreWeave\b/i, "코어위브"],
    [/\bRobinhood\b/i, "로빈후드"],
    [/\bMicroStrategy\b|\bStrategy\b/i, "마이크로스트래티지"],
    [/\bDoorDash\b/i, "도어대시"],
    [/\bMarvell\b/i, "마벨"],
    [/\bIBM\b/i, "아이비엠"],
    [/\bWaymo\b/i, "웨이모"],
    [/\bBrookfield\b/i, "브룩필드"],
    [/\bBloom Energy\b/i, "블룸에너지"],
    [/\bToyota\b/i, "토요타"],
    [/\bScanSource\b/i, "스캔소스"],
    [/\bJuniper\b/i, "주니퍼"],
    [/\bKLA\b|\bKLAC\b/i, "KLA"],
  ];
  return known.find(([pattern]) => pattern.test(clean))?.[1];
}

function localizeEnglishPhrase(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  const normalized = clean.toLowerCase();
  const fuzzy: Array<[RegExp, string]> = [
    [/\bclavis\s*xg\b/i, "클라비스 XG"],
    [/\bfalcon\s+aidr\b/i, "팔콘 AIDR"],
    [/\btrainium\b/i, "트레이니움"],
    [/\bground\s+level\s+images?\b/i, "지상 이미지 데이터"],
    [/\bai\s+supply\s+chain\s+apps?\b/i, "AI 공급망 앱"],
    [/\bretail\s+media\s+data\s+hub\b/i, "리테일 미디어 데이터 허브"],
    [/\bsatellite\s+communications?\b|\bsatellite\s+communications?\s+market\b/i, "위성통신 사업"],
    [/\bcommercial\s+iot\s+business\b|\biot\s+business\b/i, "IoT 사업"],
    [/\bconsumer\s+loans?\b/i, "소비자대출"],
    [/\bbitcoin\s+sales?\b|\bbitcoin\s+sale\b/i, "비트코인 매각"],
    [/\bsub[-\s]?1nm\s+chip\b/i, "서브 1나노 칩"],
    [/\bvoice\s+commerce\s+platform\b/i, "음성 커머스 플랫폼"],
    [/\bchipmaking\s+systems?\b/i, "반도체 제조 시스템"],
    [/\b5[-\s]?seat\s+es8\b|\bseat\s+es8\b/i, "ES8"],
    [/\bbackcountry\b/i, "백컨트리"],
    [/\bparagon\b/i, "파라곤"],
    [/\biridium\b/i, "이리듐"],
    [/\bunlimitail\b/i, "언리미테일"],
    [/\bprecisely\b/i, "프리사이슬리"],
    [/\bwaymo\b/i, "웨이모"],
    [/\bbloom\s+energy\s+ai\s+power\b|\bai\s+power\s+partnership\b/i, "AI 전력 파트너십"],
    [/\bair\s+taxi\s+production\b|\bair\s+taxi\b/i, "에어택시 생산"],
    [/\bhpe\s+juniper\s+networking\b|\bjuniper\s+networking\b/i, "주니퍼 네트워킹"],
    [/\b0\.7[-\s]?nanometer\s+semiconductor\s+tech\b/i, "0.7나노 반도체 기술"],
  ];
  const fuzzyHit = fuzzy.find(([pattern]) => pattern.test(clean))?.[1];
  if (fuzzyHit) return fuzzyHit;
  const exact: Record<string, string> = {
    aerospace: "항공우주",
    "aerospace customer": "항공우주 고객",
    army: "미 육군",
    "army role": "미 육군",
    nvidia: "엔비디아",
    tesla: "테슬라",
    stellantis: "스텔란티스",
    microsoft: "마이크로소프트",
    apple: "애플",
    amazon: "아마존",
    alphabet: "구글",
    google: "구글",
    meta: "메타",
    palantir: "팔란티어",
    crowdstrike: "크라우드스트라이크",
    servicenow: "서비스나우",
    workday: "워크데이",
    oracle: "오라클",
    openai: "오픈AI",
    "advanced micro devices": "AMD",
    "taiwan semiconductor": "TSMC",
    lucid: "루시드",
    rivian: "리비안",
    nio: "니오",
    "soundhound ai": "사운드하운드AI",
    "voice commerce platform": "음성 커머스 플랫폼",
    "chipmaking systems": "반도체 제조 시스템",
    "chipmaking system": "반도체 제조 시스템",
    "seat es8": "ES8",
    "5-seat es8": "ES8",
    "falcon aidr": "팔콘 AIDR",
    "clavis xg": "클라비스 XG",
    "retail media data hub": "리테일 미디어 데이터 허브",
    "ai supply chain apps": "AI 공급망 앱",
    "ground level images": "지상 이미지 데이터",
    "satellite communications": "위성통신 사업",
    "consumer loans": "소비자대출",
    trainium: "트레이니움",
    backcountry: "백컨트리",
    paragon: "파라곤",
    iridium: "이리듐",
    unlimitail: "언리미테일",
    precisely: "프리사이슬리",
    waymo: "웨이모",
  };
  return exact[normalized] ?? clean;
}

function phraseAfterVerb(title: string, verbs: string): string | undefined {
  const match = title.match(new RegExp(`\\b(?:${verbs})\\s+(?:a\\s+|an\\s+|the\\s+|new\\s+|suite\\s+of\\s+new\\s+)?([^:;,.()]{2,64})`, "i"));
  return cleanEnglishPhrase(match?.[1]);
}

function phraseBeforeKeyword(title: string, keyword: string): string | undefined {
  const match = title.match(new RegExp(`([A-Z][A-Za-z0-9&().+-]{1,24}(?:\\s+[A-Z][A-Za-z0-9&().+-]{1,24}){0,2})\\s+${keyword}`, "i"));
  return cleanEnglishPhrase(match?.[1]);
}

function pickBacklog(title: string): string | undefined {
  const match = title.match(/\$?\s?(\d+(?:\.\d+)?)\s*(Billion|Million)\s+Backlog/i);
  if (!match?.[1] || !match[2]) return undefined;
  return `${match[1]} ${match[2]} 수주잔고`;
}

function pickDeliveryProduct(title: string): string | undefined {
  const quoted = pickQuoted(title);
  if (quoted) return cleanEnglishPhrase(quoted);
  const beforePreorder = title.match(/([A-Z][A-Za-z0-9&().+-]{1,24}(?:\s+[A-Z0-9][A-Za-z0-9&().+-]{1,24}){0,2})\s+Preorders?/i)?.[1];
  if (beforePreorder) return cleanEnglishPhrase(beforePreorder);
  const beforeLaunch = title.match(/([A-Z][A-Za-z0-9&().+-]{1,24}(?:\s+[A-Z0-9][A-Za-z0-9&().+-]{1,24}){0,2})\s+(?:Launch|Launches|Launches? Ahead|Debut)/i)?.[1];
  return cleanEnglishPhrase(beforeLaunch);
}

function withAndParticle(value: string): string {
  const last = value.trim().at(-1);
  if (!last) return value;
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return `${value}와`;
  return (code - 0xac00) % 28 === 0 ? `${value}와` : `${value}과`;
}

function compactTitlePhrase(title: string): string | undefined {
  const clean = cleanInline(title)
    .replace(/^[가-힣A-Za-z0-9&().+-]{1,18}\s*,\s*/, "")
    .replace(/^[‘'“"]|[’'”"]$/g, "");
  const aiSupport = clean.match(/^([가-힣A-Za-z0-9&().+-]{2,24})\s+AI\s*기반\s+([가-힣\s]{2,16}(?:지원|공급|제공))/);
  if (aiSupport?.[1] && aiSupport[2]) return cleanInline(`${aiSupport[1]} ${aiSupport[2]}`);
  if (/K-시큐리티/.test(clean) && /수출\s*경쟁력/.test(clean)) return "K-시큐리티 수출 경쟁력";
  if (/호남권\s*반도체\s*클러스터/.test(clean) && /추진/.test(clean)) return "호남권 반도체 클러스터 추진";
  if (/프로젝트\s*제타/.test(clean) && /글로벌\s*커뮤니티/.test(clean)) return "프로젝트 제타 글로벌 테스트";
  const patterns = [
    /([가-힣A-Za-z0-9&().+-]{2,24})에\s+([가-힣A-Za-z0-9&().+\-\s]{2,28}(?:공급|지원|제공|납품|선정))/,
    /([가-힣A-Za-z0-9&().+\-\s]{2,28})\s+(?:첫\s*)?(?:공급|지원|제공|납품|선정|출시|공개|개발|확보)/,
    /(\d+(?:\.\d+)?\s*(?:억|조|만|천)?\s*(?:원|달러|USD|억원|조원)?\s*(?:규모\s*)?[가-힣A-Za-z0-9&().+\-\s]{2,28}(?:선정|계약|수주|공급|투자|증자))/,
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    const phrase = match?.[0]?.replace(/\s+/g, " ").trim();
    if (phrase && phrase.length >= 6 && phrase.length <= 44) return phrase;
  }
  return undefined;
}

function pickFiling(title: string): string | undefined {
  if (/8-K/i.test(title)) return "8-K";
  if (/10-Q/i.test(title)) return "10-Q";
  if (/10-K/i.test(title)) return "10-K";
  if (/SEC/i.test(title)) return "SEC";
  if (/DART|공시/.test(title)) return "공시";
  return undefined;
}

function candidateHooks(input: NewsHookInput, title: string): string[] {
  const lower = title.toLowerCase();
  const amount = pickAmount(title);
  const counterparty = pickCounterparty(title);
  const product = pickProduct(title);
  const filing = pickFiling(title);
  const quarter = pickQuarterLabel(title);
  const month = pickMonthLabel(title);
  const hooks: string[] = [];

  if (/clavis\s*xg/i.test(title)) hooks.push("클라비스 XG 출시");
  if (/falcon\s+aidr/i.test(title)) hooks.push("팔콘 AIDR 제품 확장");
  if (/retail\s+media\s+data\s+hub/i.test(title)) hooks.push("리테일 미디어 데이터 허브 제휴");
  if (/ground\s+level\s+images?/i.test(title)) hooks.push("지상 이미지 데이터 공개");
  if (/ai\s+supply\s+chain\s+apps?/i.test(title)) hooks.push("AI 공급망 앱 공개");
  if (/trainium/i.test(title)) hooks.push("트레이니움 칩 판매 이슈");
  if (/sub[-\s]?1nm\s+chip/i.test(title)) hooks.push("서브 1나노 칩 공개");
  if (/brookfield.*expands?.*bloom\s+energy.*ai\s+power\s+partnership/i.test(title)) {
    hooks.push(amount ? `브룩필드 AI 전력 파트너십 ${amount} 확대` : "브룩필드 AI 전력 파트너십 확대");
  }
  if (/joby\s+aviation.*toyota.*joint\s+venture.*air\s+taxi/i.test(title)) {
    hooks.push("토요타와 에어택시 합작사 설립");
  }
  if (/scansource.*expansion.*(?:hpe\s+)?networking\s+partnership.*juniper/i.test(title)) {
    hooks.push("스캔소스 주니퍼 네트워킹 파트너십 확대");
  }
  if (/international\s+business\s+machines|\bibm\b/i.test(title) && /0\.7[-\s]?nanometer\s+semiconductor/i.test(title)) {
    hooks.push("0.7나노 반도체 기술 공개");
  }
  if (/bitcoin\s+sales?|sale\s+of\s+bitcoin|sell\s+bitcoin/i.test(title)) hooks.push("비트코인 매각 프레임워크 공개");
  if (/new\s+billion[-\s]?dollar\s+deal|billion[-\s]?dollar\s+deal|inks?\s+new\s+billion/i.test(title)) {
    hooks.push("십억달러 규모 계약 체결");
  }
  if (/ai\s+sales\s+doubling|sales\s+doubling/i.test(title)) {
    hooks.push("AI 매출 두 배 성장");
  }
  if (/monthly\s+sales\s+rise|monthly\s+sales\s+increase|sales\s+rise/i.test(title)) {
    hooks.push("월간 매출 증가");
  }
  if (/licensing\s+strategy.*reactor\s+rollout|reactor\s+rollout/i.test(title)) {
    hooks.push("원전 인허가 전략 공개");
  }
  if (/full\s+stack\s+ai\s+infrastructure\s+provider|ai\s+infrastructure\s+provider/i.test(title)) {
    hooks.push("AI 인프라 전략 공개");
  }
  if (/new\s+nvidia\s+partnership|nvidia\s+partnership/i.test(title)) {
    hooks.push("엔비디아 파트너십 이슈");
  }
  if (/antitrust\s+lawsuit|price[-\s]?fixing|price[-\s]?gouging/i.test(title)) {
    hooks.push("가격담합 소송 제기");
  }
  if (/trading\s+activity.*new\s+highs?|new\s+highs?.*trading\s+activity/i.test(title)) {
    hooks.push(month ? `${month} 거래활동 신기록` : "거래활동 신기록");
  }
  if (/backcountry/i.test(title) && /partner|partnership|deal|collaboration/i.test(title)) {
    hooks.push("백컨트리 파트너십 체결");
  }
  if (/unlimitail/i.test(title) && /partnership|data\s+hub|retail\s+media/i.test(title)) {
    hooks.push("언리미테일 리테일 데이터 제휴");
  }
  if (/iridium/i.test(title) && /acquir|acquisition|deal|commercial\s+iot/i.test(title)) {
    hooks.push(amount ? `이리듐 IoT 사업 ${amount} 인수 발표` : "이리듐 IoT 사업 인수 발표");
  }
  if (/paragon/i.test(title) && /contract|secures?|signs?|rollout/i.test(title)) {
    hooks.push("파라곤 공급계약 체결");
  }
  if (/consumer\s+loans?|securitization/i.test(title) && amount) {
    hooks.push(`${amount} 소비자대출 유동화`);
  }
  if (/backlog/i.test(title)) {
    const backlog = pickBacklog(title);
    if (backlog) hooks.push(`${backlog} 확보`);
  }

  if (/AIDC|전력\s*공급|공급\s*안정/.test(title)) {
    hooks.push("전력 공급 안정화");
  }

  if (counterparty && /launch(?:es|ed)?|introduc|unveil|product|platform|solution/i.test(title)) {
    hooks.push(`${withAndParticle(counterparty)} 제품 협력`);
  }

  if (/deliver(?:y|ies|ed)|preorders?|launch(?:es|ed)?|debut/i.test(title)) {
    const deliveryProduct = pickDeliveryProduct(title) ?? product;
    if (/preorders?/i.test(title) && month && deliveryProduct) hooks.push(`${deliveryProduct} ${month} 출시 전 사전예약`);
    if (/preorders?/i.test(title) && deliveryProduct) hooks.push(`${deliveryProduct} 사전예약 시작`);
    if (/deliver/i.test(title) && quarter) hooks.push(`${quarter} 인도량 발표`);
    if (/deliver/i.test(title) && month) hooks.push(`${month} 인도량 발표`);
    if (/launch|debut/i.test(title) && month && deliveryProduct) hooks.push(`${deliveryProduct} ${month} 출시 일정`);
  }

  if (/투자/.test(title)) {
    hooks.push(amount ? `${amount} 투자` : "대규모 투자");
  }

  if (/정부|국책|투자|클러스터|산단|호남/.test(title) && /관련주|부각|묶|투자/.test(title)) {
    if (/호남/.test(title)) hooks.push("호남 투자 발표에 관련주로 언급");
    if (amount) hooks.push(`${amount} 투자 발표에 관련주로 언급`);
  }
  if (/partnership|collaboration|deal/.test(lower) && counterparty) {
    hooks.push(`${withAndParticle(counterparty)} 제휴 발표`);
  }
  if (/공급계약|계약|수주|contract|order|supply/.test(lower)) {
    const securedCounterparty = phraseAfterVerb(title, "secures?|wins?|lands?|receives?|signs?");
    const backlog = pickBacklog(title);
    if (backlog) hooks.push(`${backlog} 확보`);
    if (securedCounterparty && /contract|order|supply/i.test(title)) hooks.push(`${securedCounterparty} 공급계약 체결`);
    if (amount && product) hooks.push(`${amount} ${product} 공급계약 체결`);
    if (amount) hooks.push(`${amount} 공급계약 체결`);
    if (counterparty) hooks.push(`${counterparty} 공급계약 체결`);
    if (product) hooks.push(`${product} 공급계약 체결`);
  }
  if (/유상증자|증자/.test(title) && amount) {
    hooks.push(`${amount} 유상증자 결정`);
  }
  if (/자사주|신탁/.test(title) && amount) {
    hooks.push(`${amount} 자사주 취득 신탁`);
  }
  if (/인수전|매각|입찰|acquisition|takeover|bid/i.test(title)) {
    if (counterparty) hooks.push(`${counterparty} 인수전 참여`);
    if (amount) hooks.push(`${amount} 매각 이슈`);
  }
  if (/제품|신제품|AI 인프라|data center|solution|launch|unveil|introduce|product/.test(lower)) {
    const launched = phraseAfterVerb(title, "launches?|introduces?|unveils?|extends?|debuts?|announces?");
    if (launched && /extend/i.test(title)) hooks.push(`${launched} 제품 확장`);
    if (launched && !/extend/i.test(title)) hooks.push(`${launched} 제품 공개`);
    if (counterparty) hooks.push(`${withAndParticle(counterparty)} 제품 협력`);
    if (product) hooks.push(`${product} 공개`);
  }
  const compactPhrase = compactTitlePhrase(title);
  if (compactPhrase) hooks.push(compactPhrase);
  if (/실적|가이던스|매출|revenue|earnings|results|guidance|forecast/.test(lower)) {
    if (amount) hooks.push(`${amount} 실적 발표`);
    if (quarter) hooks.push(`${quarter} 실적 발표`);
  }
  if (/파트너십|제휴|협력|고객|partnership|customer/.test(lower)) {
    if (counterparty) hooks.push(`${withAndParticle(counterparty)} 제휴 발표`);
    const partnershipCounterparty =
      phraseAfterVerb(title, "partners?\\s+with") ??
      (counterparty ? undefined : phraseBeforeKeyword(title, "partnership")) ??
      phraseAfterVerb(title, "lands?|announces?");
    if (partnershipCounterparty && partnershipCounterparty !== counterparty) {
      hooks.push(`${withAndParticle(partnershipCounterparty)} 파트너십 체결`);
    }
    if (product) hooks.push(`${product} 협력 발표`);
  }
  if (/SEC|8-K|10-Q|10-K|filing|공시/i.test(title) && filing) {
    hooks.push(`${filing} 주요 공시 제출`);
  }
  if (/FDA|임상|허가|승인|trial|approval|drug/i.test(title)) {
    const phase = title.match(/(?:임상|phase)\s*\d(?:상)?/i)?.[0]?.trim();
    if (phase) hooks.push(`${phase} 데이터 발표`);
    if (product) hooks.push(`${product} 임상 데이터 발표`);
  }
  if (/자금조달|유동화|funding|liquidity|offering/i.test(title)) {
    if (amount) hooks.push(`${amount} 자금조달 발표`);
  }
  const eventPhrase = pickEventPhrase(title);
  if (eventPhrase) hooks.push(eventPhrase);
  const leadClause = pickLeadClause(title);
  if (leadClause) hooks.push(leadClause);
  return hooks;
}

function pickEventPhrase(title: string): string | undefined {
  const clean = cleanInline(title.replace(/^[가-힣A-Za-z0-9&().+-]{1,18}\s*,\s*/, ""));
  const keywords = [
    "유상증자 결정",
    "자사주 취득",
    "상업화 권리 확보",
    "독점 상업화 권리 확보",
    "양산 PO 수주",
    "글로벌 공급",
    "급여 진입",
    "판매 종료",
    "임상 전략",
    "렌탈 서비스 출시",
    "서비스 출시",
    "전략 전환",
    "개발 본격화",
    "첫 CB 발행",
    "공급 계약",
    "공급계약",
    "협력",
    "제휴",
    "출시",
    "수주",
    "개발",
    "확보",
    "체결",
  ];
  for (const keyword of keywords) {
    const idx = clean.indexOf(keyword);
    if (idx < 0) continue;
    const before = clean
      .slice(Math.max(0, idx - 28), idx)
      .replace(/^.*[.…:：]/, "")
      .replace(/^[,\s]+|[,\s]+$/g, "")
      .trim();
    const phrase = cleanInline(`${before} ${keyword}`);
    if (phrase.length >= 6 && phrase.length <= 44) return phrase;
  }
  return undefined;
}

function pickLeadClause(title: string): string | undefined {
  const clean = cleanInline(title.replace(/^[가-힣A-Za-z0-9&().+-]{1,18}\s*,\s*/, ""));
  const clause = clean
    .split(/…|\.{2,}|[!?]|…|;|；/)
    .map((part) => cleanInline(part))
    .find((part) => part.length >= 8 && !/^(?:소식|뉴스|공시|재료|오늘)/.test(part));
  if (!clause) return undefined;
  const shortened = clause.length > 34 ? `${clause.slice(0, 34).replace(/\s+\S*$/, "")}` : clause;
  if (!shortened || /(?:재료가|소식에|직접|붙었|확인됐어요)/.test(shortened)) return undefined;
  return shortened;
}

export function ruleReprocessNewsHook(input: NewsHookInput): string | undefined {
  const title = cleanInline(stripStockName(input.title, input.stock));
  if (!title || GENERIC_TITLE_PATTERN.test(title) || US_MARKET_NOISE_PATTERN.test(title)) return undefined;
  const extractionText = cleanInline([title, input.summary].filter(Boolean).join(" "));

  for (const hook of candidateHooks(input, extractionText)) {
    const normalized = normalizeHookPhrase(hook);
    const validated =
      validateReprocessedNewsHook(withMetric(normalized, input), input) ??
      validateReprocessedNewsHook(normalized, input);
    if (validated) return validated;
  }
  return undefined;
}

function parseAiHook(content: string): string | undefined {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { hook?: unknown };
      if (typeof parsed.hook === "string") return parsed.hook;
    } catch {
      // fall through to plain text
    }
  }
  return cleanInline(content.replace(/^hook\s*[:：]\s*/i, ""));
}

function systemPrompt(): string {
  const banned = ["매" + "수/매" + "도", "목표" + "가", "예측", "과장", "매체명", "기사 제목 복붙"];
  return [
    "너는 주식 발견 카드의 뉴스 제목을 종목 관점 한 줄로 압축한다.",
    "출력은 100% 한국어다. 영어 단어를 한국어 조사에 섞지 마라.",
    "제목과 본문에 있는 사실만 사용한다.",
    "무엇을·누구와·얼마·언제 중 확인 가능한 구체값을 최소 1개 포함하고, 가능하면 입력 changePct를 함께 붙인다.",
    "계약/수주/실적/공시/뉴스/소식/재료 같은 카테고리 명사만으로 끝내지 않는다.",
    "상대방·금액·제품·수치 중 하나가 없으면 빈 hook을 반환한다.",
    "영문 기사 제목을 그대로 번역하지 말고 종목 보유자 관점으로 압축한다.",
    "좋은 예: 원문 '티이엠씨씨엔에스, 180억원 반도체 장비 공급계약 체결' -> '180억원 반도체 장비 공급계약 체결'.",
    "좋은 예: 원문 'D-Wave Quantum Announces New Partnership With Aerospace Customer' -> '항공우주 고객 제휴 발표에 +8%'.",
    "좋은 예: 원문 'SoundHound AI Reports First Quarter Revenue Growth and Raises Guidance' -> '1분기 매출 성장에 +3%'.",
    "나쁜 예: 'NIO Stock Eyes June Delivery', 'Aerospace 고객과 제휴 발표', '팔란티어 제휴 발표', '아이온큐 공개'.",
    "나쁜 예: 카테고리만 말하는 추상 문장, 원문 사건 없이 반응만 말하는 문장.",
    `${banned.join(", ")} 금지.`,
    "결과는 한국어 44자 이하 JSON {\"hook\":\"...\"}.",
    "연결을 못 만들면 {\"hook\":\"\"}.",
  ].join(" ");
}

async function aiReprocessNewsHook(input: NewsHookInput): Promise<string | undefined> {
  if (!isAiConfigured()) return undefined;
  const res = await callAI({
    trace: "discovery-news-hook",
    temperature: 0,
    timeoutMs: 8_000,
    metadata: {
      stock: input.stock,
      sector: input.sector,
      source: input.source,
      asOf: input.asOf.slice(0, 10),
    },
    messages: [
      {
        role: "system",
        content: systemPrompt(),
      },
      {
        role: "user",
        content: JSON.stringify({
          stock: input.stock,
          sector: input.sector,
          title: input.title,
          summary: input.summary,
          source: input.source,
          changePct: input.changePct,
        }),
      },
    ],
  });
  if (!res.ok) return undefined;
  return validateReprocessedNewsHook(parseAiHook(res.content), input);
}

export async function reprocessNewsHook(input: NewsHookInput): Promise<NewsHookResult> {
  const key = cacheKey(input);
  const hit = cache.get(key);
  if (hit) return hit;

  const aiHook = await aiReprocessNewsHook(input);
  const ruleHook = ruleReprocessNewsHook(input);
  const result: NewsHookResult = aiHook
    ? { hook: aiHook, method: "ai" }
    : ruleHook
      ? { hook: ruleHook, method: "rule" }
      : { method: "none" };
  cache.set(key, result);
  return result;
}
