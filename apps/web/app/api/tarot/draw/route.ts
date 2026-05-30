import { NextRequest, NextResponse } from "next/server";
import { drawCards, DRAW_COST, buildCacheKey, getCacheTtlMs, getCardNarrative, type TarotSpreadType, type FinancialContext } from "@taro/core";
import { fetchMarketSnapshot } from "@/lib/tarot/market";
import { generateInterpretation } from "@/lib/tarot/interpret";
import { requireAuth } from "@/lib/tarot/auth";
import { deductCredit } from "@/lib/tarot/credits";
import { prisma } from "@/lib/tarot/prisma";

const INTERNAL_BASE = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:3000";

async function fetchFinancialContext(ticker: string): Promise<FinancialContext | undefined> {
  try {
    const res = await fetch(`${INTERNAL_BASE}/api/tarot/financials?symbol=${encodeURIComponent(ticker)}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      keyMetrics?: {
        profitMargins?: number | null;
        grossMargins?: number | null;
        revenueGrowth?: number | null;
        returnOnEquity?: number | null;
        returnOnAssets?: number | null;
        debtToEquity?: number | null;
        currentRatio?: number | null;
        freeCashflow?: number | null;
      };
    };
    if (!data.keyMetrics) return undefined;
    const km = data.keyMetrics;
    return {
      profitMargins: km.profitMargins ?? null,
      grossMargins: km.grossMargins ?? null,
      revenueGrowth: km.revenueGrowth ?? null,
      returnOnEquity: km.returnOnEquity ?? null,
      returnOnAssets: km.returnOnAssets ?? null,
      debtToEquity: km.debtToEquity ?? null,
      currentRatio: km.currentRatio ?? null,
      freeCashflow: km.freeCashflow ?? null,
    };
  } catch {
    return undefined;
  }
}

export const dynamic = "force-dynamic";

interface DrawRequestBody {
  ticker?: string;
  market?: string;
  spread?: string;
  idempotencyKey?: string;
}

function isSpread(v: string): v is TarotSpreadType {
  return v === "single" || v === "three-card";
}

function errorJson(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(req: NextRequest) {
  // 인증
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = (await req.json().catch(() => ({}))) as DrawRequestBody;
  const ticker = body.ticker?.trim().toUpperCase();
  const market = body.market === "KR" ? "KR" : "US";
  const spread: TarotSpreadType = isSpread(body.spread ?? "") ? (body.spread as TarotSpreadType) : "single";
  const idempotencyKey = body.idempotencyKey?.trim();

  if (!ticker) return errorJson("ticker is required", "MISSING_TICKER", 400);
  if (!idempotencyKey) return errorJson("idempotencyKey is required", "MISSING_IDEMPOTENCY_KEY", 400);

  // idempotency — 이미 처리된 요청이면 기존 결과 반환
  const existing = await prisma.tarotDrawHistory.findUnique({
    where: { idempotencyKey },
    include: { cards: { include: { card: true }, orderBy: { position: "asc" } } },
  });
  if (existing) {
    return NextResponse.json({ drawId: existing.id, cached: true, headline: existing.headline });
  }

  const creditCost = DRAW_COST[spread];

  // 크레딧 차감 (서버 사이드 트랜잭션)
  const spreadReason = spread === "single" ? "DRAW_SINGLE" : "DRAW_THREE";
  const { ok, balance } = await deductCredit(userId, creditCost, spreadReason, idempotencyKey);
  if (!ok) {
    return errorJson("크레딧이 부족합니다", "INSUFFICIENT_CREDITS", 402);
  }

  // 시장 데이터 + 재무 컨텍스트 병렬 조회
  let marketSnapshot;
  let financialCtx: FinancialContext | undefined;
  try {
    [marketSnapshot, financialCtx] = await Promise.all([
      fetchMarketSnapshot(ticker, market),
      fetchFinancialContext(ticker),
    ]);
  } catch {
    // 크레딧 환불
    await deductCredit(userId, -creditCost, "REFUND" as const, idempotencyKey);
    return errorJson("Failed to fetch market data", "MARKET_DATA_ERROR", 502);
  }

  // 카드 뽑기
  const drawnCards = drawCards(spread, marketSnapshot.condition);

  // AI 해석 (4단 폴백) — DB 캐시 → in-memory 캐시 → LLM → 프리빌트 폴백
  const cacheKey = buildCacheKey(ticker, spread, drawnCards, marketSnapshot.condition);
  const cacheTtlMs = getCacheTtlMs(marketSnapshot.condition);

  // DB 캐시: 동일 cacheKey의 최근 결과 재사용 (LLM 호출 생략, 응답 시간 대폭 단축)
  const dbCached = await prisma.tarotDrawHistory.findFirst({
    where: { cacheKey, createdAt: { gte: new Date(Date.now() - cacheTtlMs) } },
    orderBy: { createdAt: "desc" },
    select: { headline: true, summary: true, detail: true },
  });

  const interpretation = await generateInterpretation(
    idempotencyKey,
    marketSnapshot,
    drawnCards,
    spread,
    cacheKey,
    cacheTtlMs,
    dbCached
      ? { headline: dbCached.headline, summary: dbCached.summary, detail: dbCached.detail ?? "" }
      : undefined,
    financialCtx
  );

  // DB 저장
  const dbSpread = spread === "single" ? "SINGLE" : "THREE_CARD";
  const dbMarket = market === "KR" ? "KR" : "US";
  const sourceMap = { llm: "LLM", cache: "CACHE", fallback: "FALLBACK" } as const;

  const saved = await prisma.tarotDrawHistory.create({
    data: {
      userId,
      ticker,
      market: dbMarket,
      spread: dbSpread,
      headline: interpretation.headline,
      summary: interpretation.summary,
      detail: interpretation.detail,
      source: sourceMap[interpretation.source],
      idempotencyKey,
      creditCost,
      cacheKey,
      cards: {
        create: drawnCards.map((dc, i) => ({
          cardId: dc.card.id,
          orientation: dc.orientation,
          slot: dc.slot ?? null,
          position: i,
        })),
      },
    },
  });

  // 카드 컬렉션 자동 기록 (fire-and-forget)
  void Promise.all(
    drawnCards.map((dc) =>
      prisma.tarotCardCollection.upsert({
        where: { userId_cardId: { userId, cardId: dc.card.id } },
        create: { userId, cardId: dc.card.id },
        update: { drawCount: { increment: 1 } },
      })
    )
  );

  return NextResponse.json({
    drawId: saved.id,
    ticker,
    market,
    spread,
    creditCost,
    creditsRemaining: balance,
    marketSnapshot: {
      price: marketSnapshot.price,
      changePercent: marketSnapshot.changePercent,
      condition: marketSnapshot.condition,
      summary: marketSnapshot.summary,
    },
    interpretation: {
      headline: interpretation.headline,
      summary: interpretation.summary,
      detail: interpretation.detail,
      disclaimer: interpretation.disclaimer,
      cards: drawnCards.map((dc) => ({
        id: dc.card.id,
        nameKo: dc.card.nameKo,
        orientation: dc.orientation,
        slot: dc.slot ?? null,
        imageUrl: dc.card.imageUrl,
        narrative: getCardNarrative(dc.card.id, dc.orientation),
      })),
    },
  });
}
