import {
  buildInterpretationPrompt,
  buildInterpretationPromptV1_1,
  buildInterpretationPromptV2_0,
  buildInterpretationPromptV2_1,
  buildInterpretationPromptV2_2,
  buildInterpretationPromptV2_6,
  checkSafety,
  getFallbackInterpretation,
  REQUIRED_DISCLAIMER,
  type DrawnCard,
  type FinancialContext,
  type MarketSnapshot,
  type TarotInterpretation,
  type TarotSpreadType,
} from "@taro/core";

const AI_API_URL = process.env["AI_API_URL"] ?? "";
const AI_API_KEY = process.env["AI_API_KEY"] ?? "";
const AI_MODEL = process.env["AI_MODEL"] ?? "openai/gpt-4.1-mini";
const AI_TEMPERATURE = parseFloat(process.env["AI_TEMPERATURE"] ?? "0.7");

interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LlmResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

async function callLlm(prompt: string): Promise<string> {
  if (!AI_API_URL || !AI_API_KEY) throw new Error("AI not configured");

  const body: { model: string; messages: LlmMessage[]; temperature: number } = {
    model: AI_MODEL,
    temperature: AI_TEMPERATURE,
    messages: [{ role: "user", content: prompt }],
  };

  const res = await fetch(AI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) throw new Error(`LLM ${res.status}`);

  const data = (await res.json()) as LlmResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM empty response");
  return content;
}

interface ParsedInterpretation {
  headline: string;
  summary: string;
  detail: string;
}

function parseLlmJson(raw: string): ParsedInterpretation {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as Partial<ParsedInterpretation>;
  if (!parsed.headline || !parsed.summary || !parsed.detail) {
    throw new Error("LLM response missing fields");
  }
  return { headline: parsed.headline, summary: parsed.summary, detail: parsed.detail };
}

// in-memory 캐시 (서버 프로세스 수명 동안 유지)
const interpretationCache = new Map<string, { data: ParsedInterpretation; expiresAt: number }>();

export async function generateInterpretation(
  drawId: string,
  market: MarketSnapshot,
  cards: DrawnCard[],
  spread: TarotSpreadType,
  cacheKey: string,
  cacheTtlMs: number,
  preloaded?: ParsedInterpretation,
  financialCtx?: FinancialContext
): Promise<TarotInterpretation> {
  const now = Date.now();

  // 1차: DB에서 넘어온 사전 캐시 (LLM 비용 0, 응답 즉시)
  if (preloaded) {
    interpretationCache.set(cacheKey, { data: preloaded, expiresAt: now + cacheTtlMs });
    return buildResult(drawId, market, cards, spread, preloaded, "cache");
  }

  // 2차: in-memory 캐시 히트
  const cached = interpretationCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return buildResult(drawId, market, cards, spread, cached.data, "cache");
  }

  // 3차: LLM 호출
  try {
    const prompt = buildInterpretationPromptV2_6(market, cards, financialCtx);
    const raw = await callLlm(prompt);
    const parsed = parseLlmJson(raw);

    // 금칙어 검사
    const safetyResult = checkSafety(`${parsed.headline} ${parsed.summary} ${parsed.detail}`);
    if (safetyResult.result === "BLOCKED") {
      console.warn("[tarot/interpret] LLM output BLOCKED:", safetyResult.matchedTerms);
      throw new Error("safety_blocked");
    }

    interpretationCache.set(cacheKey, { data: parsed, expiresAt: now + cacheTtlMs });
    return buildResult(drawId, market, cards, spread, parsed, "llm");
  } catch (err) {
    // 4차: 프리빌트 폴백 (사용자에게 폴백 여부 노출 안 함)
    console.warn("[tarot/interpret] falling back:", err instanceof Error ? err.message : err);
    const primaryCard = cards[0];
    if (!primaryCard) throw new Error("No cards drawn");
    const fallback = getFallbackInterpretation(primaryCard.card.id, primaryCard.orientation);
    return buildResult(drawId, market, cards, spread, fallback, "fallback");
  }
}

function buildResult(
  drawId: string,
  market: MarketSnapshot,
  cards: DrawnCard[],
  spread: TarotSpreadType,
  parsed: ParsedInterpretation,
  source: TarotInterpretation["source"]
): TarotInterpretation {
  return {
    drawId,
    ticker: market.ticker,
    spread,
    cards,
    headline: parsed.headline,
    summary: parsed.summary,
    detail: parsed.detail,
    disclaimer: REQUIRED_DISCLAIMER,
    source,
    createdAt: new Date().toISOString(),
  };
}
