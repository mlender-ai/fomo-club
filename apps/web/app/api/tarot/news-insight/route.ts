import { NextRequest, NextResponse } from "next/server";
import { drawCards, getFallbackInterpretation, buildInterpretationPromptV2_6, checkSafety, generateFallbackInsight, type FinancialContext } from "@taro/core";
import { fetchMarketSnapshot } from "@/lib/tarot/market";
import type { StockQuote } from "@trading/shared/src/stockTypes";

export const dynamic = "force-dynamic";

// 캐시 TTL: 15분 (뉴스 인사이트는 인증 없이 조회하므로 캐시를 넉넉히)
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { data: InsightResponse; expiresAt: number }>();

const AI_API_URL = process.env["AI_API_URL"] ?? "";
const AI_API_KEY = process.env["AI_API_KEY"] ?? "";
const AI_MODEL = process.env["AI_MODEL"] ?? "openai/gpt-4.1-mini";

const INTERNAL_BASE = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:3000";

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

function buildFinancialContext(quote: StockQuote): FinancialContext | undefined {
  const ctx: FinancialContext = {
    grossMargins: quote.grossMargins ?? null,
    profitMargins: quote.operatingMargins ?? null,
    revenueGrowth: quote.revenueGrowth ?? null,
    returnOnEquity: quote.returnOnEquity ?? null,
    debtToEquity: quote.debtToEquity ?? null,
  };
  // 의미 있는 값이 하나라도 있어야 컨텍스트를 쓸 가치가 있음
  const hasAny = Object.values(ctx).some((v) => v !== null && v !== undefined);
  return hasAny ? ctx : undefined;
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

    // 시장 스냅샷 + 종목 재무 데이터를 병렬로 조회 — 재무 데이터는 프롬프트 컨텍스트 강화용
    const [snapshot, quoteResult] = await Promise.allSettled([
      fetchMarketSnapshot(symbol, market),
      fetch(`${INTERNAL_BASE}/api/tarot/quote?symbol=${encodeURIComponent(symbol)}`, {
        signal: AbortSignal.timeout(8_000),
      }).then((r) => (r.ok ? (r.json() as Promise<StockQuote>) : null)).catch(() => null),
    ]);

    if (snapshot.status === "rejected") {
      throw snapshot.reason as Error;
    }

    const marketSnapshot = snapshot.value;
    const quoteData = quoteResult.status === "fulfilled" ? quoteResult.value : null;
    const financialCtx = quoteData ? buildFinancialContext(quoteData) : undefined;

    const [drawn] = drawCards("single", marketSnapshot.condition);
    if (!drawn) {
      return NextResponse.json({ error: "Card draw failed" }, { status: 500 });
    }

    let headline: string;
    let summary: string;

    try {
      // v2.3.0: 단일 카드는 v2.2.0과 동일. 3장 스프레드에서 슬롯별 심리 지형 강화.
      const prompt = buildInterpretationPromptV2_6(marketSnapshot, [drawn], financialCtx);
      const result = await callLlmForInsight(prompt);

      const safetyResult = checkSafety(`${result.headline} ${result.summary}`);
      if (safetyResult.result === "BLOCKED") throw new Error("safety_blocked");

      headline = result.headline;
      summary = result.summary;
    } catch {
      const fallback = getFallbackInterpretation(drawn.card.id, drawn.orientation);
      headline = fallback.headline;

      summary = generateFallbackInsight({
        cardId: drawn.card.id,
        orientation: drawn.orientation,
        snapshot: marketSnapshot,
      });
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
