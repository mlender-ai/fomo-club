import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { refreshSymbolRiskChunk } from "../../../../../lib/risk/refresh";

/**
 * 종목 고유 리스크 합성 크론 — WO-SUB-06 §5-2 / 06.5.
 *
 * GET /api/fomo/cron/symbol-risk[?limit=6][&reset=1][&only=CLBK][&force=1]
 *   · 커서 기반 청크. `done: true` 까지 반복 호출한다(팩트시트·사업실체 크론과 같은 패턴).
 *   · 재합성이 필요 없는 종목은 **LLM 을 부르지 않고** 건너뛴다(`skipped`). 위험요소는 연 1회
 *     바뀌는 문서라 매일 다시 합성할 이유가 없다.
 *   · `force=1` 은 전량 재합성 — 비용이 발생하므로 의도적으로만 쓴다.
 *
 * **배선: `symbol-risk-backfill.yml` 일일 스케줄**(WO-SUB-FILL PART 2). 비용 사용이 승인됐고,
 * 수동 실행에만 의존한 결과 **한 번도 돌지 않아 레코드가 1건**이었다 — 만든 것이 돌지 않으면
 * 만들지 않은 것과 같다. Vercel 크론이 아니라 워크플로인 이유: 한 번의 함수 호출로는 청크
 * 하나(6종목)밖에 못 돌아 400종목에 67일이 걸린다. 워크플로는 라운드를 이어 돌린다.
 *
 * 외부 소스(SEC·DART)와 LLM 호출이 필요해 Vercel 런타임에서만 제대로 돈다.
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
    const result = await refreshSymbolRiskChunk({
      ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
      reset: url.searchParams.get("reset") === "1",
      force: url.searchParams.get("force") === "1",
      ...(only.length > 0 ? { only } : {}),
    });
    return withCors(
      NextResponse.json({ ok: true, elapsedMs: Date.now() - startedAt, ...result }, { headers: { "Cache-Control": "no-store" } })
    );
  } catch (error) {
    console.warn("[fomo/cron/symbol-risk] failed", (error as Error)?.message);
    return withCors(
      NextResponse.json(
        { ok: false, date: kstDate(), error: (error as Error)?.message ?? "symbol-risk refresh failed" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
