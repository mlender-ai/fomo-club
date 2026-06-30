import { callAI, isAiConfigured } from "@fomo/shared";
import {
  hasAbstractDiscoveryFiller,
  synthesizeDiscoveryInsight,
  type DiscoveryCandidate,
  type DiscoveryEvent,
  type DiscoveryInsightSynthesis,
} from "@fomo/core";
import {
  hasEnglishFragmentHeadline,
  hasExcessiveLatinHeadline,
  hasForbiddenCopy,
  isAbstractTemplate,
  isRawTitleCopy,
  neutralizeSupplyFactTerms,
} from "./copy-guards";
import { formatAxisMetric, resolvedCardAxis, type CardAxis } from "./card-axis";
import { ruleReprocessNewsHook } from "./news-reprocess";

export interface WhySynthesisResult {
  insight: DiscoveryInsightSynthesis;
  method: "ai" | "fallback";
}

interface AiWhyOutput {
  headline?: unknown;
  observations?: unknown;
  synthesis?: unknown;
  evidence?: unknown;
}

const cache = new Map<string, WhySynthesisResult>();
const ADVICE_PATTERN = new RegExp(
  [
    "목표" + "가",
    "급등\\s*임박",
    "텐" + "베거",
    "매" + "수",
    "매" + "도",
    "추" + "천",
    "사" + "야",
    "팔" + "아야",
    "오를\\s*것",
    "상승" + "할",
    "기대",
    "전망",
    "수혜",
    "유망",
    "때문에",
    "덕분에",
    "찬스",
  ].join("|"),
  "i"
);
const ABSTRACT_PATTERN = new RegExp(
  [
    "흐" + "름\\s*(?:이|도)?\\s*붙",
    "주" + "목",
    "확인되는\\s*화면",
    "눈에\\s*띄었어요",
    "한\\s*가지\\s*숫자만",
    "근거는\\s*얇",
    "이유\\s*얇",
    "공개\\s*원문도\\s*같이",
    "동종\\s*흐" + "름도",
  ].join("|")
);

const GENERIC_KOREAN_TOKENS = new Set([
  "가격",
  "거래",
  "거래량",
  "평소",
  "수급",
  "외국인",
  "기관",
  "오늘",
  "최근",
  "시총",
  "시장",
  "종목",
  "기사",
  "공시",
  "뉴스",
  "원문",
  "사건",
  "실적",
  "계약",
  "수주",
  "정부",
  "투자",
  "정책",
  "클러스터",
  "관련주",
  "신제품",
  "제품",
  "반응",
  "터진",
  "담는",
  "연속",
  "순매수",
  "순매도",
  "확정",
  "자료",
  "장마감",
  "테마",
  "섹터",
  "위치",
  "최고",
  "근처",
  "희귀성",
  "비어",
  "있어",
  "아직",
  "먼저",
  "봅니다",
  "나눠",
  "분리",
  "합니다",
  "카드",
  "이유",
]);
const KNOWN_COMPANY_NAME_PATTERN = /엔비디아|삼성전자|테슬라|애플|마이크로소프트|구글|메타|아마존|현대차|기아|SK하이닉스|NVIDIA|Tesla|Apple|Microsoft|Google|Meta|Amazon/i;

function cleanInline(text: unknown): string {
  return String(text ?? "").replace(/\s+/g, " ").replace(/[.。]+$/g, "").trim();
}

function textParts(output: Pick<DiscoveryInsightSynthesis, "headline" | "observations" | "synthesis" | "evidence">): string[] {
  return [output.headline, ...output.observations, output.synthesis, ...output.evidence].filter(Boolean);
}

function numbersIn(text: string): string[] {
  return [...text.matchAll(/[+-]?\d+(?:\.\d+)?/g)].map((match) => match[0]!.replace(/^\+/, ""));
}

function englishQuarterNumbers(text: string): string[] {
  const quarterMap: Record<string, string> = {
    first: "1",
    second: "2",
    third: "3",
    fourth: "4",
  };
  return [...text.matchAll(/\b(first|second|third|fourth)\s+quarter\b/gi)]
    .map((match) => quarterMap[match[1]!.toLowerCase()])
    .filter((value): value is string => Boolean(value));
}

function inputText(candidate: DiscoveryCandidate): string {
  return [
    candidate.ticker,
    candidate.sector,
    candidate.market,
    candidate.marketCapRank,
    candidate.asOf,
    candidate.dominantAxis,
    ...candidate.events.flatMap((event) => [
      event.label,
      event.headlineHook,
      event.sourceTitle,
      event.summary,
      event.sourceName,
      event.source,
      event.asOf,
      event.changePct,
      event.volumeRatio,
      event.flowActor,
      event.flowDays,
      event.flowAmountText,
      event.themeRank,
      event.themePeerCount,
      event.themeAverageChangePct,
      event.themeRelativeChangePct,
    ]),
  ].filter((value) => value !== undefined && value !== null).join(" ");
}

export function __debugInsightInputText(candidate: DiscoveryCandidate): string {
  return inputText(candidate);
}

function inputNumbers(candidate: DiscoveryCandidate): Set<string> {
  const input = inputText(candidate);
  const nums = [...numbersIn(input), ...englishQuarterNumbers(input)];
  const rounded = nums.flatMap(numberVariants);
  return new Set(rounded.map((num) => num.replace(/^\+/, "")));
}

function numberVariants(num: string): string[] {
    const n = Number(num);
    return Number.isFinite(n)
      ? [num, n.toFixed(0), n.toFixed(1), n.toFixed(2), Math.abs(n).toFixed(0), Math.abs(n).toFixed(1), Math.abs(n).toFixed(2)]
      : [num];
}

function koreanTokens(text: string): string[] {
  return [...text.matchAll(/[가-힣]{2,}/g)].map((match) => match[0]!);
}

function inputKoreanTokens(candidate: DiscoveryCandidate): Set<string> {
  return new Set(koreanTokens(inputText(candidate)));
}

function latinTokens(text: string): string[] {
  return [...text.matchAll(/[A-Za-z][A-Za-z0-9.&-]{1,}/g)].map((match) => match[0]!.toLowerCase());
}

function inputLatinTokens(candidate: DiscoveryCandidate): Set<string> {
  return new Set(latinTokens(inputText(candidate)));
}

function hasConcreteWhy(headline: string, candidate: DiscoveryCandidate): boolean {
  const knownKo = inputKoreanTokens(candidate);
  const knownLatin = inputLatinTokens(candidate);
  return (
    koreanTokens(headline).some((token) => knownKo.has(token)) ||
    latinTokens(headline).some((token) => knownLatin.has(token)) ||
    translatedProperNounIsBacked(headline, candidate)
  );
}

function hasSourceLeak(text: string, candidate: DiscoveryCandidate): boolean {
  return candidate.events.some((event) => {
    const source = cleanInline(event.sourceName ?? event.source);
    return source.length >= 3 && text.includes(source);
  });
}

function hasAddedNumber(text: string, candidate: DiscoveryCandidate): boolean {
  const allowed = inputNumbers(candidate);
  return numbersIn(text).some((num) => numberVariants(num).every((variant) => !allowed.has(variant.replace(/^\+/, ""))));
}

function hasAddedProperNoun(text: string, candidate: DiscoveryCandidate): boolean {
  const knownLatin = inputLatinTokens(candidate);
  const allowedLatin = new Set([
    "ai",
    "aidr",
    "gpu",
    "cpu",
    "sec",
    "krx",
    "dart",
    "kospi",
    "kosdaq",
    "nyse",
    "nasdaq",
    "etf",
    "ipo",
    "ess",
    "fda",
    "sk",
    "8-k",
    "10-q",
    "10-k",
  ]);
  const badLatin = latinTokens(text).some((token) => !knownLatin.has(token) && !allowedLatin.has(token));
  if (badLatin) return true;
  const input = inputText(candidate);
  const addedKnownCompany = text.match(KNOWN_COMPANY_NAME_PATTERN)?.[0];
  return !!addedKnownCompany && !input.includes(addedKnownCompany) && !translatedProperNounIsBacked(text, candidate);
}

const TRANSLATED_PROPER_NOUNS: Array<[RegExp, RegExp]> = [
  [/엔비디아/i, /\bNVIDIA\b/i],
  [/테슬라/i, /\bTesla\b/i],
  [/스텔란티스/i, /\bStellantis\b/i],
  [/항공우주/i, /\bAerospace\b/i],
  [/음성\s*커머스\s*플랫폼/i, /\bvoice\s+commerce\s+platform\b/i],
  [/매출/i, /\brevenue\b/i],
  [/가이던스/i, /\bguidance\b/i],
  [/성장/i, /\bgrowth\b/i],
  [/상향/i, /\brais(?:e|es|ed|ing)\b/i],
  [/아이온큐|클라비스/i, /\bIonQ\b|\bClavis\b/i],
  [/로켓랩|이리듐|위성통신|IoT\s*사업/i, /\bRocket\s+Lab\b|\bIridium\b|\bsatellite\s+communications?\b|\bIoT\b/i],
  [/뉴스케일|파라곤/i, /\bNuScale\b|\bParagon\b/i],
  [/업스타트|노이버거|소비자대출/i, /\bUpstart\b|\bNeuberger\b|\bconsumer\s+loans?\b/i],
  [/어펌|백컨트리/i, /\bAffirm\b|\bBackcountry\b/i],
  [/스노우플레이크|언리미테일|리테일\s*미디어\s*데이터/i, /\bSnowflake\b|\bUnlimitail\b|\bretail\s+media\s+data\b/i],
  [/액손/i, /\bAxon\b/i],
  [/코어위브|메타|마이크로소프트|오픈AI/i, /\bCoreWeave\b|\bMeta\b|\bMicrosoft\b|\bOpenAI\b/i],
  [/로빈후드/i, /\bRobinhood\b/i],
  [/마이크로스트래티지|비트코인\s*매각/i, /\bMicroStrategy\b|\bStrategy\b|\bBitcoin\s+sales?\b/i],
  [/도어대시|지상\s*이미지/i, /\bDoorDash\b|\bground\s+level\s+images?\b/i],
  [/크라우드스트라이크|팔콘/i, /\bCrowdStrike\b|\bFalcon\b/i],
  [/마벨|트레이니움/i, /\bMarvell\b|\bTrainium\b/i],
  [/아이비엠|서브\s*1나노/i, /\bIBM\b|\bsub[-\s]?1nm\b/i],
  [/오라클|AI\s*공급망\s*앱/i, /\bOracle\b|\bAI\s+supply\s+chain\s+apps?\b/i],
  [/웨이모/i, /\bWaymo\b/i],
];

function translatedProperNounIsBacked(text: string, candidate: DiscoveryCandidate): boolean {
  const input = inputText(candidate);
  return TRANSLATED_PROPER_NOUNS.some(([ko, source]) => ko.test(text) && source.test(input));
}

function metricForAxis(candidate: DiscoveryCandidate, axis: CardAxis): string | undefined {
  if (axis === "price" || axis === "supply") return formatAxisMetric(candidate, axis);
  return undefined;
}

function materialPhrase(event: DiscoveryEvent | undefined): string | undefined {
  const candidates = [event?.headlineHook, event?.label, event?.sourceTitle]
    .map(cleanInline)
    .filter(Boolean)
    .filter((text) => !hasEnglishFragmentHeadline(text))
    .filter((text) => !hasForbiddenCopy(text) && !isAbstractTemplate(text))
    .filter((text) => !/^(?:뉴스|소식|공시|재료|계약|수주)(?:이|가)?\s*(?:나왔|확인)/.test(text));
  return candidates[0];
}

function materialEvent(candidate: DiscoveryCandidate): DiscoveryEvent | undefined {
  return candidate.events.find((event) => event.kind === "news_mention" || event.kind === "disclosure");
}

function ruleMaterialPhrase(candidate: DiscoveryCandidate, event: DiscoveryEvent | undefined): string | undefined {
  if (!event) return undefined;
  const title = cleanInline(event.sourceTitle ?? event.headlineHook ?? event.label);
  if (!title) return undefined;
  return ruleReprocessNewsHook({
    stock: candidate.ticker,
    sector: candidate.sector,
    title,
    summary: event.summary,
    source: event.sourceName ?? event.source,
    changePct: event.changePct,
    asOf: event.publishedAt ?? event.asOf ?? candidate.asOf,
  });
}

function hasMetricContext(headline: string): boolean {
  return /[+\-]\d+(?:\.\d+)?%|거래량\s*\d+(?:\.\d+)?배|외국인|기관|순매수|순매도|동종 평균보다|억|조|달러/.test(headline);
}

function hasAxisContext(headline: string, candidate: DiscoveryCandidate): boolean {
  const axis = resolvedCardAxis(candidate);
  if (axis === "price") return /[+\-]\d+(?:\.\d+)?%/.test(headline);
  if (axis === "supply") return /(?:외국인|기관|개인|수급).{0,16}(?:\d+일|연속|순매수)|순매수/.test(headline);
  return true;
}

function hasMaterialContext(headline: string, candidate: DiscoveryCandidate): boolean {
  const event = materialEvent(candidate);
  if (!event) return false;
  if (hasConcreteWhy(headline, candidate)) return true;
  return /특허|공시|계약|수주|제휴|협력|파트너십|실적|매출|가이던스|인도량|공급|선정|투자|증자|자사주|인수전|클러스터|임상|승인|허가|제품|개발|확보|체결|발표|8-K|10-Q|SEC|리테일|고객|우선협상자|관리운영|급여|출시|치료|서비스|상한가|신탁|상업화|권리|할증|렌탈|지원|종료|공개|항공우주|플랫폼|협업|판매|데이터|분기|준수율|내부통제|파업|전환|발행|처분|사업|위탁|공장|신규|후보물질|배터리|반도체|AI|FDA|조달|매각|인수|합병|계열사|자회사/.test(
    headline
  );
}

function hasSoWhatHeadline(headline: string, candidate: DiscoveryCandidate): boolean {
  const axis = resolvedCardAxis(candidate);
  if (axis === "material") return hasMaterialContext(headline, candidate);
  return hasMaterialContext(headline, candidate) && hasMetricContext(headline) && hasAxisContext(headline, candidate);
}

function hasBrokenEnding(headline: string): boolean {
  return (
    /\s[가-힣]$/.test(headline) ||
    /(?:특허\s*확|계약\s*체|수주\s*확|우선협상자\s*선|제휴\s*발|협력\s*소|공시\s*확)$/.test(headline)
  );
}

function isRawCopyFromAnySource(headline: string, candidate: DiscoveryCandidate): boolean {
  return candidate.events.some((event) => event.sourceTitle && isRawTitleCopy(headline, event.sourceTitle));
}

function buildSoWhatFallback(candidate: DiscoveryCandidate, fallback: DiscoveryInsightSynthesis): DiscoveryInsightSynthesis | undefined {
  const event = materialEvent(candidate);
  const axis = resolvedCardAxis(candidate);
  const phrase =
    axis === "price"
      ? ruleMaterialPhrase(candidate, event) ?? materialPhrase(event)
      : materialPhrase(event) ?? ruleMaterialPhrase(candidate, event)?.replace(/\s*에\s*[+\-]?\d+(?:\.\d+)?%$/, "");
  const metric = metricForAxis(candidate, axis);
  if (!event || !phrase) return undefined;
  if (axis !== "material" && !metric) return undefined;
  const headline = cleanInline(axis === "material" || hasMetricContext(phrase) ? phrase : `${phrase}에 ${metric}`);
  const evidence = [
    [event.sourceTitle ?? event.label, event.sourceName ?? event.source, event.asOf].map(cleanInline).filter(Boolean).join(" · "),
  ].filter(Boolean);
  const insight: DiscoveryInsightSynthesis = {
    ...fallback,
    primary: event,
    headline,
    observations: axis === "material" ? [`재료: ${phrase}`] : [`재료: ${phrase}`, `축: ${axis}`, `지표: ${metric}`],
    synthesis:
      axis === "supply"
        ? "공개된 사건과 기관·외국인 수급 흐름을 같은 날 나눠 보는 카드예요."
        : axis === "price"
          ? "공개된 사건과 당일 가격 반응을 같은 날 나눠 보는 카드예요."
          : "공개된 사건 자체를 먼저 보는 카드예요.",
    evidence: evidence.length > 0 ? evidence : fallback.evidence,
  };
  return whyInsightRejectionReasons(insight, candidate).length === 0 ? insight : undefined;
}

export function blockOverlapRatio(a: string, b: string): number {
  const tokensA = new Set([...koreanTokens(a), ...latinTokens(a), ...numbersIn(a)]);
  const tokensB = new Set([...koreanTokens(b), ...latinTokens(b), ...numbersIn(b)]);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const shared = [...tokensA].filter((token) => tokensB.has(token)).length;
  return shared / Math.min(tokensA.size, tokensB.size);
}

function blocksAreSeparated(insight: Pick<DiscoveryInsightSynthesis, "observations" | "synthesis" | "evidence">): boolean {
  const obs = insight.observations.join(" ");
  const evidence = insight.evidence.join(" ");
  return blockOverlapRatio(obs, insight.synthesis) < 0.7 && blockOverlapRatio(insight.synthesis, evidence) < 0.7;
}

function normalizeOutput(output: AiWhyOutput, fallback: DiscoveryInsightSynthesis): DiscoveryInsightSynthesis {
  const observations = Array.isArray(output.observations)
    ? output.observations.map(cleanInline).filter(Boolean).slice(0, 3)
    : fallback.observations;
  const evidence = Array.isArray(output.evidence)
    ? output.evidence.map(cleanInline).filter(Boolean).slice(0, 3)
    : fallback.evidence;
  return {
    ...fallback,
    headline: cleanInline(output.headline) || fallback.headline,
    observations: observations.length > 0 ? observations : fallback.observations,
    synthesis: cleanInline(output.synthesis) || fallback.synthesis,
    evidence: evidence.length > 0 ? evidence : fallback.evidence,
  };
}

export function validateWhyInsightOutput(
  output: AiWhyOutput | undefined,
  candidate: DiscoveryCandidate,
  fallback = synthesizeDiscoveryInsight(candidate)
): DiscoveryInsightSynthesis | undefined {
  if (!output) return undefined;
  const insight = normalizeOutput(output, fallback);
  return whyInsightRejectionReasons(insight, candidate).length === 0 ? insight : undefined;
}

export function whyInsightRejectionReasons(
  insight: DiscoveryInsightSynthesis,
  candidate: DiscoveryCandidate
): string[] {
  const reasons: string[] = [];
  const fullText = textParts(insight).join(" ");
  if (!insight.headline || insight.headline.length > 64) reasons.push("headline-length");
  if (!hasMaterialContext(insight.headline, candidate)) reasons.push("no-concrete-why");
  if (hasExcessiveLatinHeadline(insight.headline) || hasEnglishFragmentHeadline(insight.headline)) reasons.push("latin-headline");
  if (hasForbiddenCopy(insight.headline) || isAbstractTemplate(insight.headline)) reasons.push("headline-guard");
  if (isRawCopyFromAnySource(insight.headline, candidate)) reasons.push("raw-copy");
  if (hasBrokenEnding(insight.headline)) reasons.push("broken-ending");
  if (!hasSoWhatHeadline(insight.headline, candidate)) reasons.push("no-so-what");
  if (ADVICE_PATTERN.test(neutralizeSupplyFactTerms(fullText))) reasons.push("advice");
  if (ABSTRACT_PATTERN.test(fullText) || hasAbstractDiscoveryFiller(fullText)) reasons.push("abstract");
  if (hasSourceLeak(insight.headline, candidate)) reasons.push("source-leak");
  if (hasAddedNumber(fullText, candidate)) reasons.push("added-number");
  if (hasAddedProperNoun(insight.headline, candidate)) reasons.push("added-proper-noun");
  if (!blocksAreSeparated(insight)) reasons.push("overlap");
  return reasons;
}

function parseAiJson(content: string): AiWhyOutput | undefined {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[0]) as AiWhyOutput;
  } catch {
    return undefined;
  }
}

function cacheKey(candidate: DiscoveryCandidate): string {
  return JSON.stringify({
    ticker: candidate.ticker,
    sector: candidate.sector,
    market: candidate.market,
    marketCapRank: candidate.marketCapRank,
    asOf: candidate.asOf.slice(0, 10),
    dominantAxis: resolvedCardAxis(candidate),
    events: candidate.events.map((event) => ({
      kind: event.kind,
      label: event.label,
      hook: event.headlineHook,
      sourceTitle: event.sourceTitle,
      summary: event.summary,
      asOf: event.asOf,
      changePct: event.changePct,
      volumeRatio: event.volumeRatio,
      flowActor: event.flowActor,
      flowDays: event.flowDays,
      flowAmountText: event.flowAmountText,
      themeRank: event.themeRank,
      themePeerCount: event.themePeerCount,
      themeAverageChangePct: event.themeAverageChangePct,
      themeRelativeChangePct: event.themeRelativeChangePct,
    })),
  });
}

function systemPrompt(): string {
  const banned = [
    "흐" + "름이 붙었다",
    "주" + "목",
    "확인되는 화면",
    "눈에 띄었어요",
    "한 가지 숫자만",
    "매" + "수/매" + "도",
    "목표" + "가",
    "예측",
    "기사 제목 복붙",
    "매체명 노출",
  ];
  return [
    "너는 주식 발견 카드의 Why 문장 엔진이다.",
    "출력 헤드라인은 100% 한국어다. 영어 단어를 한국어 조사에 섞지 마라('Aerospace 고객과', 'its NVIDIA와' 금지).",
    "회사명은 한국어 표기로 쓴다(NVIDIA→엔비디아, Tesla→테슬라). 한국어 표기가 없는 소형주는 회사명을 생략하고 사건만 쓴다.",
    "영문 약어·관사('its', 'the', 'with', 'and', 'HpO')를 그대로 남기지 마라.",
    "입력 JSON의 dominantAxis는 코드가 결정론으로 고른 축이다. 축을 바꾸거나 섞지 마라.",
    "dominantAxis=price이면 헤드라인 = [재료: 무엇이 일어났나] + [당일 등락률]을 동시성으로 결합한 한 줄이다.",
    "dominantAxis=supply이면 헤드라인 = [재료: 무엇이 일어났나] + [기관/외국인 N일 연속 순매수]를 동시성으로 결합한 한 줄이다. 등락률은 쓰지 마라.",
    "dominantAxis=material이면 헤드라인 = [재료: 무엇이 일어났나]만 쓴다. 약한 가격·수급 지표를 억지로 붙이지 마라.",
    "동시성 표현('~에', '~당일', '~소식에')만 쓴다. 인과어('때문에', '덕분에') 금지.",
    "제목을 자르거나 복붙하지 마라. 입력에 없는 숫자·고유명사 금지. 글자를 어절 중간에서 끊지 마라('특허 확' 금지).",
    "예측·기대·전망·수혜·유망 등 미래 단정 금지. 사실과 해석까지만 쓴다.",
    "좋은 예(price): '엔비디아와 제품 협력 소식에 +34%', '심근세포 정제 특허 확보 당일 +16%'.",
    "좋은 예(supply): '심근세포 정제 특허 확보에 기관 5일 연속 순매수', '공급계약 발표에 외국인 32만주 순매수'.",
    "좋은 예(material): '유럽 리테일 파트너십 공시'.",
    "나쁜 예: 'its NVIDIA와 제품 협력', 'Aerospace 고객과 제휴 발표', '특허 확', '제휴 소식이 나왔어요', '수혜 기대'.",
    `${banned.join(", ")} 금지.`,
    "투자 조언과 방향 예측 금지. 사실과 해석까지만 쓴다.",
    "출력은 JSON {\"headline\":\"...\",\"observations\":[\"...\"],\"synthesis\":\"...\",\"evidence\":[\"...\"]}.",
  ].join(" ");
}

async function aiSynthesize(candidate: DiscoveryCandidate, fallback: DiscoveryInsightSynthesis): Promise<DiscoveryInsightSynthesis | undefined> {
  if (!isAiConfigured()) return undefined;
  const res = await callAI({
    trace: "discovery-why-synthesis",
    temperature: 0,
    timeoutMs: 9_000,
    metadata: {
      ticker: candidate.ticker,
      sector: candidate.sector,
      market: candidate.market,
      asOf: candidate.asOf.slice(0, 10),
    },
    messages: [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: JSON.stringify({
          stock: candidate.ticker,
          sector: candidate.sector,
          market: candidate.market,
          marketCapRank: candidate.marketCapRank,
          asOf: candidate.asOf,
          dominantAxis: resolvedCardAxis(candidate),
          events: candidate.events.map((event) => ({
            kind: event.kind,
            label: event.label,
            stockPerspectiveHook: event.headlineHook,
            sourceTitle: event.sourceTitle,
            summary: event.summary,
            sourceKind: event.kind === "news_mention" ? "news" : event.kind === "disclosure" ? "official" : "market",
            asOf: event.asOf,
            changePct: event.changePct,
            volumeRatio: event.volumeRatio,
            flowActor: event.flowActor,
            flowDays: event.flowDays,
            flowAmountText: event.flowAmountText,
            themeRank: event.themeRank,
            themePeerCount: event.themePeerCount,
            themeAverageChangePct: event.themeAverageChangePct,
            themeRelativeChangePct: event.themeRelativeChangePct,
          })),
          fallback,
        }),
      },
    ],
  });
  if (!res.ok) return undefined;
  return validateWhyInsightOutput(parseAiJson(res.content), candidate, fallback);
}

export async function synthesizeWhyDrivenInsight(candidate: DiscoveryCandidate): Promise<WhySynthesisResult> {
  const key = cacheKey(candidate);
  const hit = cache.get(key);
  if (hit) return hit;
  const fallback = synthesizeDiscoveryInsight(candidate);
  const ai = await aiSynthesize(candidate, fallback);
  const rule = ai ? undefined : buildSoWhatFallback(candidate, fallback);
  const result: WhySynthesisResult = ai
    ? { insight: ai, method: "ai" }
    : rule
      ? { insight: rule, method: "fallback" }
      : { insight: fallback, method: "fallback" };
  cache.set(key, result);
  return result;
}
