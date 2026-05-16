import { NextRequest, NextResponse } from "next/server";
import { drawCards, DRAW_COST, buildCacheKey, getCacheTtlMs, type TarotSpreadType } from "@taro/core";
import { fetchMarketSnapshot } from "@/lib/tarot/market";
import { generateInterpretation } from "@/lib/tarot/interpret";

export const dynamic = "force-dynamic";

interface DrawRequestBody {
  ticker?: string;
  market?: string;
  spread?: string;
  userId?: string;
  idempotencyKey?: string;
}

function isSpread(v: string): v is TarotSpreadType {
  return v === "single" || v === "three-card";
}

function errorJson(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as DrawRequestBody;

  const ticker = body.ticker?.trim().toUpperCase();
  const market = body.market === "KR" ? "KR" : "US";
  const spread: TarotSpreadType = isSpread(body.spread ?? "") ? (body.spread as TarotSpreadType) : "single";
  const userId = body.userId?.trim();
  const idempotencyKey = body.idempotencyKey?.trim();

  if (!ticker) return errorJson("ticker is required", "MISSING_TICKER", 400);
  if (!userId) return errorJson("userId is required", "MISSING_USER", 400);
  if (!idempotencyKey) return errorJson("idempotencyKey is required", "MISSING_IDEMPOTENCY_KEY", 400);

  const creditCost = DRAW_COST[spread];

  // 시장 데이터 조회
  let marketSnapshot;
  try {
    marketSnapshot = await fetchMarketSnapshot(ticker, market);
  } catch {
    return errorJson("Failed to fetch market data", "MARKET_DATA_ERROR", 502);
  }

  // 카드 뽑기
  const drawnCards = drawCards(spread, marketSnapshot.condition);

  // 캐시 키 생성
  const cacheKey = buildCacheKey(ticker, spread, drawnCards, marketSnapshot.condition);
  const cacheTtlMs = getCacheTtlMs(marketSnapshot.condition);

  // AI 해석 생성 (3단 폴백 내부 처리)
  const drawId = idempotencyKey;
  const interpretation = await generateInterpretation(
    drawId,
    marketSnapshot,
    drawnCards,
    spread,
    cacheKey,
    cacheTtlMs
  );

  return NextResponse.json({
    drawId,
    ticker,
    market,
    spread,
    creditCost,
    marketSnapshot: {
      price: marketSnapshot.price,
      changePercent: marketSnapshot.changePercent,
      condition: marketSnapshot.condition,
      summary: marketSnapshot.summary,
    },
    interpretation,
  });
}
