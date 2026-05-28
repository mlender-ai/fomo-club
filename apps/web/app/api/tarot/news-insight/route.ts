import { NextRequest, NextResponse } from "next/server";
import { drawCards, getFallbackInterpretation } from "@taro/core";
import { fetchMarketSnapshot } from "@/lib/tarot/market";
import { buildInterpretationPromptV2_1, checkSafety } from "@taro/core";

export const dynamic = "force-dynamic";

// 캐시 TTL: 15분 (뉴스 인사이트는 인증 없이 조회하므로 캐시를 넉넉히)
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { data: InsightResponse; expiresAt: number }>();

const AI_API_URL = process.env["AI_API_URL"] ?? "";
const AI_API_KEY = process.env["AI_API_KEY"] ?? "";
const AI_MODEL = process.env["AI_MODEL"] ?? "openai/gpt-4.1-mini";

interface InsightResponse {
  headline: string;
  summary: string;
  cardName: string;
  orientation: "upright" | "reversed";
}

interface LlmResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

async function callLlmForInsight(prompt: string): Promise<{ headline: string; summary: string }> {
  if (!AI_API_URL || !AI_API_KEY) throw new Error("AI not configured");

  const res = await fetch(AI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`LLM ${res.status}`);

  const data = (await res.json()) as LlmResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM empty response");

  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as Partial<{ headline: string; summary: string }>;
  if (!parsed.headline || !parsed.summary) throw new Error("LLM response missing fields");

  return { headline: parsed.headline, summary: parsed.summary };
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const now = Date.now();
  const hit = cache.get(symbol);
  if (hit && hit.expiresAt > now) {
    return NextResponse.json(hit.data);
  }

  try {
    const market = symbol.includes(".KS") || symbol.includes(".KQ") ? "KR" : "US";
    const snapshot = await fetchMarketSnapshot(symbol, market);

    const [drawn] = drawCards("single", snapshot.condition);
    if (!drawn) {
      return NextResponse.json({ error: "Card draw failed" }, { status: 500 });
    }

    let headline: string;
    let summary: string;

    try {
      const prompt = buildInterpretationPromptV2_1(snapshot, [drawn]);
      const result = await callLlmForInsight(prompt);

      const safetyResult = checkSafety(`${result.headline} ${result.summary}`);
      if (safetyResult.result === "BLOCKED") throw new Error("safety_blocked");

      headline = result.headline;
      summary = result.summary;
    } catch {
      const fallback = getFallbackInterpretation(drawn.card.id, drawn.orientation);
      headline = fallback.headline;
      summary = fallback.summary;
    }

    const data: InsightResponse = {
      headline,
      summary,
      cardName: drawn.card.nameKo,
      orientation: drawn.orientation,
    };

    cache.set(symbol, { data, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn("[news-insight] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
