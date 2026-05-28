import { NextRequest, NextResponse } from "next/server";

/**
 * stock-bundle: quote + financials를 단일 요청으로 병렬 조회.
 * 클라이언트 N+1 제거 — 기존에는 quote, financials 각각 호출했으나
 * 이 엔드포인트 하나로 두 데이터를 동시에 받는다.
 * chart는 range별로 달라지므로 별도 호출 유지.
 */
export const dynamic = "force-dynamic";

const INTERNAL_BASE = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const authHeader = req.headers.get("Authorization");
  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader) forwardHeaders["Authorization"] = authHeader;

  const encoded = encodeURIComponent(symbol);

  const [quoteRes, financialsRes] = await Promise.allSettled([
    fetch(`${INTERNAL_BASE}/api/tarot/quote?symbol=${encoded}`, {
      headers: forwardHeaders,
      signal: AbortSignal.timeout(12_000),
    }),
    fetch(`${INTERNAL_BASE}/api/tarot/financials?symbol=${encoded}`, {
      headers: forwardHeaders,
      signal: AbortSignal.timeout(12_000),
    }),
  ]);

  const quote =
    quoteRes.status === "fulfilled" && quoteRes.value.ok
      ? await quoteRes.value.json()
      : null;

  const financials =
    financialsRes.status === "fulfilled" && financialsRes.value.ok
      ? await financialsRes.value.json()
      : null;

  if (!quote) {
    return NextResponse.json({ error: "quote fetch failed" }, { status: 502 });
  }

  return NextResponse.json({ quote, financials });
}
