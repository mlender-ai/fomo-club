import { NextResponse } from "next/server";
import { withCors, kstDate } from "../../../../../lib/fomo";
import {
  collectDisclosures,
  DISCLOSURE_DEFAULT_LOOKBACK_DAYS,
  DISCLOSURE_WINDOW_DAYS,
} from "../../../../../lib/disclosure-collect";
import { readDisclosureCollection, writeDisclosureCollection } from "../../../../../lib/disclosure-store";

/**
 * WO-RESET-02 PART A — 공시 수집 크론.
 *
 * `GET /api/fomo/cron/disclosures?days=N`
 *
 * ## 왜 라우트인가
 *
 * `DART_API_KEY` 가 **GitHub 시크릿에 없고 Vercel 환경변수에만** 있다(실측 2026-08-03).
 * 워크플로에서 직접 돌리면 키가 빈 값이라 조용히 0건을 모은다. 그래서 키가 있는 런타임에서
 * 돌리고 워크플로는 이 라우트를 호출만 한다 — `holding-probe` · 팩트시트 백필과 같은 방식이다.
 *
 * ## `days`
 *
 * 이번에 새로 훑을 날 수. 기본은 증분(며칠)이고, 첫 채움이나 구멍 메우기는 크게 준다.
 * 90일을 한 번에 훑으면 시간 예산을 넘길 수 있는데, 그때는 **거기까지 모은 것을 저장하고
 * `truncated: true` 를 남긴다.** 다시 부르면 이어서 채워진다(합치기라 반복이 안전하다).
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
  const startedAt = Date.now();
  try {
    const url = new URL(request.url);
    const requested = Number(url.searchParams.get("days") ?? DISCLOSURE_DEFAULT_LOOKBACK_DAYS);
    const lookbackDays = Number.isFinite(requested)
      ? Math.max(1, Math.min(requested, DISCLOSURE_WINDOW_DAYS))
      : DISCLOSURE_DEFAULT_LOOKBACK_DAYS;

    const previous = await readDisclosureCollection();
    const collection = await collectDisclosures({ today: kstDate(), lookbackDays, previous });

    /**
     * 빈 수집으로 **기존 저장분을 덮지 않는다**(`docs/STATUS.md` §12 의 교훈).
     * 키가 없거나 전부 실패해서 0종목이 나왔는데 이전에 데이터가 있었다면, 그건 새 사실이
     * 아니라 장애다. 쓰지 않고 사유를 돌려준다.
     */
    const stocks = Object.keys(collection.byStock).length;
    const priorStocks = Object.keys(previous?.byStock ?? {}).length;
    if (stocks === 0 && priorStocks > 0) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            blocked: "수집 결과가 0종목 — 직전 저장분을 유지한다",
            keptPriorStocks: priorStocks,
            errors: collection.errors.slice(0, 5),
            ms: Date.now() - startedAt,
          },
          { status: 503 }
        )
      );
    }

    await writeDisclosureCollection(collection);
    const items = Object.values(collection.byStock).reduce((sum, list) => sum + list.length, 0);
    return withCors(
      NextResponse.json({
        ok: true,
        lookbackDays,
        stocks,
        items,
        coveredFrom: collection.coveredFrom,
        truncated: collection.truncated,
        // 조용한 결손 금지 — 실패는 개수와 함께 앞 몇 건을 그대로 낸다.
        errorCount: collection.errors.length,
        errors: collection.errors.slice(0, 5),
        ms: Date.now() - startedAt,
      })
    );
  } catch (error) {
    return withCors(
      NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error), ms: Date.now() - startedAt },
        { status: 500 }
      )
    );
  }
}
