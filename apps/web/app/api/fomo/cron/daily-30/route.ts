import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { runExpertReviewCommittee } from "../../../../../lib/expert-review-committee";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    const result = await runExpertReviewCommittee();
    if (result.ok) revalidateTag("daily-30", { expire: 0 });
    return withCors(
      NextResponse.json(
        {
          ok: result.ok,
          runId: result.report.runId,
          status: result.report.status,
          date: kstDate(),
          model: result.report.model,
          calls: result.report.callCount,
          candidates: result.report.candidateCount,
          selected: result.report.selectedCount,
          assetCounts: result.report.assetCounts,
          previousRunRetained: result.previousRunRetained,
          ...(result.report.error ? { error: result.report.error } : {}),
          elapsedMs: Date.now() - startedAt,
        },
        { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
      )
    );
  } catch (err) {
    console.warn("[fomo/cron/daily-30] failed", (err as Error)?.message);
    return withCors(
      NextResponse.json(
        { ok: false, date: kstDate(), error: (err as Error)?.message ?? "daily-30 failed" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      )
    );
  }
}
