import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tarot/auth";
import { addCredit, getCreditBalance } from "@/lib/tarot/credits";
import { prisma } from "@/lib/tarot/prisma";

export const dynamic = "force-dynamic";

function errorJson(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

interface PurchaseBody {
  productId?: string;
  purchaseToken?: string; // RevenueCat transaction ID
  idempotencyKey?: string;
}

// 상품 ID → 크레딧 매핑
const PRODUCT_CREDIT_MAP: Record<string, number> = {
  "tarot_credits_5":  5,
  "tarot_credits_15": 15,
  "tarot_credits_30": 30,
};

async function verifyRevenueCat(purchaseToken: string, productId: string): Promise<boolean> {
  const apiKey = process.env["REVENUECAT_SECRET_API_KEY"];
  if (!apiKey) throw new Error("REVENUECAT_SECRET_API_KEY not set");

  const res = await fetch(
    `https://api.revenuecat.com/v1/receipts`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Platform": "ios", // RevenueCat handles both platforms via token
      },
      body: JSON.stringify({
        fetch_token: purchaseToken,
        product_id: productId,
      }),
      signal: AbortSignal.timeout(10_000),
    }
  );

  return res.ok;
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = (await req.json().catch(() => ({}))) as PurchaseBody;
  const { productId, purchaseToken, idempotencyKey } = body;

  if (!productId) return errorJson("productId is required", "MISSING_PRODUCT_ID", 400);
  if (!purchaseToken) return errorJson("purchaseToken is required", "MISSING_PURCHASE_TOKEN", 400);
  if (!idempotencyKey) return errorJson("idempotencyKey is required", "MISSING_IDEMPOTENCY_KEY", 400);

  const creditAmount = PRODUCT_CREDIT_MAP[productId];
  if (!creditAmount) return errorJson("Unknown product", "INVALID_PRODUCT", 400);

  // 멱등성: 동일 idempotencyKey로 이미 크레딧 지급됐으면 현재 잔액만 반환
  const existing = await prisma.tarotCreditLedger.findFirst({
    where: { userId, referenceId: idempotencyKey, reason: "PURCHASE" },
  });
  if (existing) {
    const credits = await getCreditBalance(userId);
    return NextResponse.json({ credits, duplicate: true });
  }

  // RevenueCat 서버 검증
  try {
    const valid = await verifyRevenueCat(purchaseToken, productId);
    if (!valid) return errorJson("영수증 검증 실패", "RECEIPT_INVALID", 402);
  } catch {
    return errorJson("영수증 검증 서버 오류", "RECEIPT_ERROR", 502);
  }

  const credits = await addCredit(userId, creditAmount, "PURCHASE", idempotencyKey);
  return NextResponse.json({ credits, purchased: creditAmount });
}
