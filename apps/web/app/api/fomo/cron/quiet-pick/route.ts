import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { readFeedContent, writeFeedContent } from "../../../../../lib/feed-content-store";
import { appendJudgmentLedger } from "../../../../../lib/judgment-ledger";
import {
  buildQuietPickResponse,
  quietPickLedgerEntries,
  quietPickPriorState,
  type QuietPickResponse,
} from "../../../../../lib/quiet-pick";
import { buildQuietPickStamps, type PublicationStamp } from "../../../../../lib/publication-stamp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACTIVE_ID = "quiet-pick:active";
const dateId = (date: string) => `quiet-pick:${date}`;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  const startedAt = Date.now();
  try {
    const date = kstDate();
    // 신선도 — 어제 픽과 같은 종목·같은 신호 시작이면 제외(신호 갱신 시만 재편입).
    const prior = await readFeedContent<QuietPickResponse>(ACTIVE_ID).catch(() => null);
    const priorPicks = prior && prior.date !== date ? quietPickPriorState(prior) : new Map();

    const response = await buildQuietPickResponse({ date, priorPicks });

    // WO-P1 자가검증 — 발행 픽 전원 캔들 ≥200일. 게이트가 이미 걸렀으므로 여기서 걸리면 게이트 회귀다.
    const thin = response.picks.filter((pick) => pick.dataQuality.candles < 200);
    if (thin.length > 0) {
      const detail = thin.map((pick) => `${pick.subject.canonical}:${pick.dataQuality.candles}`).join(", ");
      console.error("[fomo/cron/quiet-pick] data completeness gate regression", detail);
      return withCors(
        NextResponse.json(
          { ok: false, error: `데이터 미완결 픽 발행 시도: ${detail}`, date },
          { status: 500 }
        )
      );
    }

    await writeFeedContent(dateId(date), response);
    await writeFeedContent(ACTIVE_ID, response);

    // 발행 즉시 원장 append(성적표 채점 원료 — G1-C). 원장 실패가 픽 발행을 막지 않는다.
    //
    // 발행 시점 스탬프(WO-SUB-07 [F])를 같이 싣는다. **소급 불가** — 이 순간을 놓치면 아키타입·
    // 팩트시트 해시·무효선을 나중에 복원할 수 없다. 저장 레코드만 읽으므로 외부 소스 장애와 무관하고,
    // 스탬프 조립이 실패해도 스탬프 없이 원장은 쓴다(기록 자체가 늦는 쪽이 더 큰 손실).
    let ledgerAppended = 0;
    let stamps = new Map<string, PublicationStamp>();
    try {
      stamps = await buildQuietPickStamps(response);
    } catch (error) {
      // 스탬프 실패가 원장 기록을 막지 않는다 — 스탬프 없는 행이라도 발행 사실은 남아야 한다.
      console.warn("[fomo/cron/quiet-pick] publication stamp skipped", error instanceof Error ? error.message : error);
    }
    try {
      ledgerAppended = await appendJudgmentLedger(quietPickLedgerEntries(response, stamps));
    } catch (error) {
      console.warn("[fomo/cron/quiet-pick] ledger append deferred", error instanceof Error ? error.message : error);
    }

    revalidateTag("quiet-pick", { expire: 0 });
    return withCors(
      NextResponse.json({
        ok: true,
        date,
        published: response.picks.length,
        ledgerAppended,
        // 스탬프 확보 현황(WO-SUB-07 [F]) — 몇 장이 발행 시점 기록을 갖췄고 무엇이 비었는지.
        // 소급 불가라 여기서 0 이 보이면 그날 기록은 영구 결손이다. 크론 응답에 그대로 노출한다.
        stamped: stamps.size,
        stampMissing: Object.entries(
          [...stamps.values()].reduce<Record<string, number>>((acc, stamp) => {
            for (const field of stamp.missing) acc[field] = (acc[field] ?? 0) + 1;
            return acc;
          }, {})
        ).map(([field, count]) => ({ field, count })),
        qualification: response.qualification,
        // 픽별 데이터 완결성 로그(WO-P1 수용 기준 — 하이드레이션 로그 첨부용).
        dataQuality: response.picks.map((pick) => ({
          stock: pick.subject.canonical,
          ...pick.dataQuality,
          tickerValue: pick.subject.symbol ?? null,
          identityValue: pick.subject.identity ?? null,
        })),
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

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}
