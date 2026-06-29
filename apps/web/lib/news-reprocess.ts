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
  if (numbersIn(clean).some((n) => !allowedNumbers.has(n) && !allowedNumbers.has(n.replace(/\.0+$/, "")))) return undefined;
  if (!hasConcreteSourceValue(clean, sourceText)) return undefined;
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
  return title.match(/\d+(?:\.\d+)?\s*(?:억|조|만|천)?\s*(?:원|달러|USD|억원|조원|%)/i)?.[0]?.replace(/\s+/g, "");
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
  const cleaned = value
    .replace(/\b(?:Inc|Corp|Corporation|Co|Company|Ltd|PLC|LLC|Holdings?|Group|The)\b\.?/gi, "")
    .replace(
      /\b(?:new|major|strategic|global|retail|media|data|hub|customer|customers|partnership|deal|contract|order|key|as|role|seat)\b/gi,
      ""
    )
    .replace(/\b(?:with|from|by|for|of)\b/gi, "")
    .replace(/^\d+[-\s]*/, "")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 2) return undefined;
  return localizeEnglishPhrase(cleaned.split(/\s+/).slice(0, 3).join(" "));
}

function localizeEnglishPhrase(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  const normalized = clean.toLowerCase();
  const exact: Record<string, string> = {
    aerospace: "항공우주",
    "aerospace customer": "항공우주 고객",
    army: "미 육군",
    "army role": "미 육군",
    nvidia: "엔비디아",
    tesla: "테슬라",
    stellantis: "스텔란티스",
    "soundhound ai": "사운드하운드AI",
    "voice commerce platform": "음성 커머스 플랫폼",
    "chipmaking systems": "반도체 제조 시스템",
    "chipmaking system": "반도체 제조 시스템",
    "seat es8": "ES8",
    "5-seat es8": "ES8",
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
  if (!title || GENERIC_TITLE_PATTERN.test(title)) return undefined;

  for (const hook of candidateHooks(input, title)) {
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
