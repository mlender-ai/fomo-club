import { NextResponse } from "next/server";
import { withCors } from "../../../../../lib/fomo";
import { readSearchRequests, saveSearchRequest } from "../../../../../lib/symbol-index";

/**
 * 검색 알림 신청 큐 (WO 검색 ③ 분기) — 무로그인이라 푸시 대신 재방문 시 피드 노출.
 * POST {query} → 큐 저장. GET → 최근 요청 상태(클라가 localStorage 의 자기 요청과 대조).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { query?: string; deviceId?: string };
    const query = body.query?.replace(/\s+/g, " ").trim();
    if (!query || query.length < 1 || query.length > 60) {
      return withCors(NextResponse.json({ ok: false, error: "query required (1~60자)" }, { status: 400 }));
    }
    // deviceId = 익명 기기 ID(무로그인 대기함) — 재방문 시 "내 요청" 매칭용. 로그인·개인정보 아님.
    const row = await saveSearchRequest(query, body.deviceId);
    return withCors(NextResponse.json({ ok: true, request: row }, { headers: { "Cache-Control": "no-store" } }));
  } catch (err) {
    console.warn("[fomo/search/request] failed", (err as Error)?.message);
    return withCors(NextResponse.json({ ok: false, error: "저장에 실패했어요" }, { status: 500 }));
  }
}

export async function GET() {
  try {
    const requests = await readSearchRequests(30);
    return withCors(NextResponse.json({ requests }, { headers: { "Cache-Control": "no-store" } }));
  } catch {
    return withCors(NextResponse.json({ requests: [] }));
  }
}
