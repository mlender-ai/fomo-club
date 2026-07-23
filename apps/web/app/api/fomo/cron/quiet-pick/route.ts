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
