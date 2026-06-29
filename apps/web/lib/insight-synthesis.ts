import { callAI, isAiConfigured } from "@fomo/shared";
import {
  hasAbstractDiscoveryFiller,
  synthesizeDiscoveryInsight,
  type DiscoveryCandidate,
  type DiscoveryEvent,
  type DiscoveryInsightSynthesis,
} from "@fomo/core";
import { hasExcessiveLatinHeadline, hasForbiddenCopy, isAbstractTemplate } from "./copy-guards";

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
    ...candidate.events.flatMap((event) => [
      event.label,
      event.headlineHook,
      event.sourceTitle,
      event.sourceName,
      event.source,
      event.asOf,
      event.changePct,
      event.volumeRatio,
      event.flowDays,
      event.flowAmountText,
      event.themeRank,
      event.themePeerCount,
      event.themeAverageChangePct,
      event.themeRelativeChangePct,
    ]),
  ].filter((value) => value !== undefined && value !== null).join(" ");
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
  if (numbersIn(headline).length > 0) return true;
  const knownKo = inputKoreanTokens(candidate);
  const knownLatin = inputLatinTokens(candidate);
  return koreanTokens(headline).some((token) => knownKo.has(token)) || latinTokens(headline).some((token) => knownLatin.has(token));
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
  const badLatin = latinTokens(text).some((token) => !knownLatin.has(token) && !["ai", "sec", "krx"].includes(token));
  if (badLatin) return true;
  const input = inputText(candidate);
  const addedKnownCompany = text.match(KNOWN_COMPANY_NAME_PATTERN)?.[0];
  return !!addedKnownCompany && !input.includes(addedKnownCompany);
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
  if (!hasConcreteWhy(insight.headline, candidate)) reasons.push("no-concrete-why");
  if (hasExcessiveLatinHeadline(insight.headline)) reasons.push("latin-headline");
  if (hasForbiddenCopy(insight.headline) || isAbstractTemplate(insight.headline)) reasons.push("headline-guard");
  if (ADVICE_PATTERN.test(fullText)) reasons.push("advice");
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
    events: candidate.events.map((event) => ({
      kind: event.kind,
      label: event.label,
      hook: event.headlineHook,
      sourceTitle: event.sourceTitle,
      asOf: event.asOf,
      changePct: event.changePct,
      volumeRatio: event.volumeRatio,
      flowActor: event.flowActor,
      flowDays: event.flowDays,
      flowAmountText: event.flowAmountText,
      themeRank: event.themeRank,
      themePeerCount: event.themePeerCount,
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
    "입력이 영어 미국 종목 뉴스/공시여도 출력 헤드라인은 반드시 한국어로 쓴다.",
    "헤드라인은 [주체/규모가 박힌 사건 또는 숫자] + [이 종목에 일어난 일] 한 줄이다.",
    "원문에서 무엇을·누구와·얼마·언제 중 확인 가능한 구체값을 최소 1개 포함한다.",
    "반드시 입력 JSON에 있는 숫자 또는 고유명사만 쓴다. 입력에 없으면 쓰지 않는다.",
    "영문 기사 제목을 그대로 번역하거나 복붙하지 말고, 종목 보유자 관점의 한국어 한 줄로 압축한다.",
    "좋은 예: '1분기 매출 성장·가이던스 상향', 'Aerospace 고객과 제휴 발표', '8-K 중요계약 공시 확인'.",
    "나쁜 예: 'partnership news announced', '제휴 소식이 나왔어요', 'D-Wave Quantum Announces New Partnership With Aerospace Customer'.",
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
          events: candidate.events.map((event) => ({
            kind: event.kind,
            label: event.label,
            stockPerspectiveHook: event.headlineHook,
            sourceTitle: event.sourceTitle,
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
  const result: WhySynthesisResult = ai ? { insight: ai, method: "ai" } : { insight: fallback, method: "fallback" };
  cache.set(key, result);
  return result;
}
