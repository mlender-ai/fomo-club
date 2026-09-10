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
 * **Vercel 크론 배선: 일 1회 `50 21 * * *`(UTC) = KST 06:50, 장 마감 후**(WO-SUB-FILL PART 1-1).
 * `ledger-outcomes`(40 21) 뒤에 둔다 — 가격 무효선 판정이 그 관측을 쓰므로 순서가 중요하다.
 *
 * 종전에는 스케줄을 붙이지 않았고 근거로 AGENTS.md 블랙리스트를 들었는데, 그 블랙리스트는
 * **자율 기획 cron**(무엇을 만들지 제안하는 것)을 막는 것이고 데이터 배치 크론은 이미 여럿 있다.
 * 손으로 호출해야만 갱신되는 상태를 "만들었지만 돌지 않는다"로 판정해 배선했다.
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
