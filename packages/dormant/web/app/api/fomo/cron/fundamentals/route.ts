import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { refreshFactSheetsChunk } from "../../../../../lib/fundamentals/refresh";

/**
 * 펀더멘털 팩트시트 배치 크론 — WO-SUB-01 §7-2.
 *
 * GET /api/fomo/cron/fundamentals[?limit=12][&reset=1][&only=CLBK,종근당]
 *   · 커서 기반 청크. 한 라운드(전 유니버스)가 끝나면 `done: true` 를 준다.
 *   · 워크플로/스케줄러가 `done` 까지 반복 호출한다(signal-stats 크론과 같은 패턴).
 *
 * 외부 소스(SEC·Nasdaq·네이버) 호출이 필요해 **Vercel 런타임에서만** 제대로 돈다.
 * 개발 샌드박스·GH Actions 러너는 egress 가 없거나 막힌 경우가 있다.
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
    const result = await refreshFactSheetsChunk({
      ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      reset: url.searchParams.get("reset") === "1",
      ...(only.length > 0 ? { only } : {}),
    });
    return withCors(
      NextResponse.json(
        { ok: true, elapsedMs: Date.now() - startedAt, ...result },
        { headers: { "Cache-Control": "no-store" } }
      )
    );
  } catch (error) {
    console.warn("[fomo/cron/fundamentals] failed", (error as Error)?.message);
    return withCors(
      NextResponse.json(
        { ok: false, date: kstDate(), error: (error as Error)?.message ?? "fundamentals refresh failed" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
