import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { readFeedContent, writeFeedContent } from "../../../../../lib/feed-content-store";
import { appendJudgmentLedger } from "../../../../../lib/judgment-ledger";
import {
  buildQuietPickResponse,
  quietPickLedgerEntries,
  quietPickFreshnessKeys,
  type QuietPickResponse,
} from "../../../../../lib/quiet-pick";

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
    const priorPickKeys = prior && prior.date !== date ? quietPickFreshnessKeys(prior) : new Set<string>();

    const response = await buildQuietPickResponse({ date, priorPickKeys });

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
    let ledgerAppended = 0;
    try {
      ledgerAppended = await appendJudgmentLedger(quietPickLedgerEntries(response));
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
