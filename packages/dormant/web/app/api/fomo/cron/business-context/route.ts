import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { refreshBusinessContextChunk } from "../../../../../lib/business-context/refresh";

/**
 * 사업 실체 합성 크론 — WO-SUB-03 §5.
 *
 * GET /api/fomo/cron/business-context[?limit=8][&reset=1][&only=CLBK][&force=1]
 *   · 커서 기반 청크. `done: true` 까지 반복 호출한다(팩트시트 크론과 같은 패턴).
 *   · 재합성이 필요 없는 종목은 **LLM 을 부르지 않고** 슬롯 3 만 갱신한다.
 *   · `force=1` 은 전량 재합성 — **비용이 발생하므로 의도적으로만** 쓴다(§5 비용 관리).
 *
 * 외부 소스(SEC·네이버·FRED)와 LLM 호출이 필요해 Vercel 런타임에서만 제대로 돈다.
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
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const only = (url.searchParams.get("only") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const startedAt = Date.now();

  try {
    const result = await refreshBusinessContextChunk({
      ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      reset: url.searchParams.get("reset") === "1",
      force: url.searchParams.get("force") === "1",
      ...(only.length > 0 ? { only } : {}),
    });
    return withCors(
      NextResponse.json({ ok: true, elapsedMs: Date.now() - startedAt, ...result }, { headers: { "Cache-Control": "no-store" } })
    );
  } catch (error) {
    console.warn("[fomo/cron/business-context] failed", (error as Error)?.message);
    return withCors(
      NextResponse.json(
        { ok: false, date: kstDate(), error: (error as Error)?.message ?? "business-context refresh failed" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
