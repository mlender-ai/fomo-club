import { NextResponse } from "next/server";
import { withCors } from "../../../../lib/fomo";
import { readRequestsForDevice } from "../../../../lib/symbol-index";

/**
 * 무로그인 대기함 (WO 검색 요청→다음날 카드) — 익명 deviceId 의 요청 상태 조회.
 * 재방문 시 클라가 호출: ready(fulfilled)면 덱 맨 앞 "요청하신 카드" 고정,
 * not-found 면 1회 안내. 푸시 아님 — 재방문 노출이 무로그인 원칙에 맞는 알림 대체.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(req: Request) {
  const deviceId = new URL(req.url).searchParams.get("deviceId")?.trim() ?? "";
  if (!deviceId) {
    return withCors(NextResponse.json({ requests: [] }, { headers: { "Cache-Control": "no-store" } }));
  }
  try {
    const rows = await readRequestsForDevice(deviceId, 20);
    return withCors(
      NextResponse.json(
        {
          requests: rows.map((row) => ({
            query: row.query,
            status: row.status,
            requestedAt: row.requestedAt,
            ...(row.processedAt ? { processedAt: row.processedAt } : {}),
            ...(row.resolved
              ? {
                  resolved: {
                    canonical: row.resolved.canonical,
                    symbol: row.resolved.symbol,
                    market: row.resolved.market,
                    country: row.resolved.country,
                    ...(row.resolved.naverCode ? { naverCode: row.resolved.naverCode } : {}),
                    ...(row.resolved.sector ? { sector: row.resolved.sector } : {}),
                  },
                }
              : {}),
          })),
        },
        { headers: { "Cache-Control": "no-store" } }
      )
    );
  } catch (err) {
    console.warn("[fomo/my-requests] failed", (err as Error)?.message);
    return withCors(NextResponse.json({ requests: [] }, { status: 200 }));
  }
}
