import { NextResponse } from "next/server";
import { withCors } from "../../../../../lib/fomo";
import { probeHoldingCompanyAxis } from "../../../../../lib/archetype/holding-probe";

/**
 * WO-SUB-02R B1 지주회사 식별 축 프로브 — 실측 라우트.
 *
 * GET /api/fomo/cron/holding-probe
 *
 * **왜 라우트인가**: `DART_API_KEY` 가 GitHub 시크릿에 없고 Vercel 환경변수에만 있다.
 * 워크플로에서 직접 돌리면 키가 빈 값이라 실패한다(실측). 키가 있는 런타임에서 돈다 —
 * 팩트시트 백필이 같은 이유로 같은 방식이다.
 *
 * **인증은 크론 라우트와 동일하다**(`CRON_SECRET` Bearer). 진단 경로를 인증 없이 늘리면
 * 방금 제거한 문제를 되살리는 일이다.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return !secret || request.headers.get("authorization") === `Bearer ${secret}`;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  try {
    const result = await probeHoldingCompanyAxis();
    return withCors(NextResponse.json({ ok: true, ...result }));
  } catch (error) {
    return withCors(
      NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
    );
  }
}
