import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { judgeBusinessInvalidations } from "../../../../../lib/ledger/business-invalidation-judge";

/**
 * 사업 무효 조건 자동 판정 크론 — WO-SUB-07 §6-4.
 *
 * GET /api/fomo/cron/business-invalidation[?limit=200]
 *   · 발행 1건당 1회만 판정한다(멱등 키). 두 번 돌려도 같은 결과다(완료 조건 4).
 *   · 저장된 팩트시트만 읽는다 — 외부 소스·LLM 없음.
 *
 * cron 스케줄은 붙이지 않는다(AGENTS.md 블랙리스트). 팩트시트 크론 뒤에 수동 또는
 * 기존 일일 파이프라인에서 호출한다.
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
  const limit = Number.parseInt(new URL(request.url).searchParams.get("limit") ?? "", 10);
  const startedAt = Date.now();
  try {
    const result = await judgeBusinessInvalidations({ ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}) });
    return withCors(
      NextResponse.json({ ok: true, elapsedMs: Date.now() - startedAt, ...result }, { headers: { "Cache-Control": "no-store" } })
    );
  } catch (error) {
    console.warn("[fomo/cron/business-invalidation] failed", (error as Error)?.message);
    return withCors(
      NextResponse.json({ ok: false, date: kstDate(), error: (error as Error)?.message ?? "judge failed" }, { status: 500 })
    );
  }
}
