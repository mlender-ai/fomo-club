import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { withCors, kstDate } from "../../../../../lib/fomo";
import { runExpertReviewCommitteeStage, type CommitteeStage } from "../../../../../lib/expert-review-committee";
import { daily30CardCount, resolveDaily30Response } from "../../../../../lib/daily-30";
import { recordQualityForPublishedResponse, type QualityLedgerEntry } from "../../../../../lib/quality-slo-ledger";

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
    const requestedStage = new URL(request.url).searchParams.get("stage") ?? "trading";
    if (!(["trading", "financial", "editor"] as string[]).includes(requestedStage)) {
      return withCors(NextResponse.json({ ok: false, error: "stage must be trading|financial|editor" }, { status: 400 }));
    }
    const stage = requestedStage as CommitteeStage;
    const result = await runExpertReviewCommitteeStage(stage);
    let verifiedCards: number | undefined;
    let quality: QualityLedgerEntry | undefined;
    let qualityError: string | undefined;
    if (result.ok && stage === "editor") {
      revalidateTag("daily-30", { expire: 0 });
      const published = await resolveDaily30Response();
      verifiedCards = daily30CardCount(published);
      if (verifiedCards < 20) {
        throw new Error(`daily-30 post-publish verification failed: ${verifiedCards}/20 cards`);
      }
      try {
        quality = (await recordQualityForPublishedResponse(kstDate(), published)).entry;
      } catch (error) {
        qualityError = error instanceof Error ? error.message : String(error);
        console.warn("[fomo/cron/daily-30] quality ledger deferred", qualityError);
      }
    }
    return withCors(
      NextResponse.json(
        {
          ok: result.ok,
          runId: result.runId,
          stage,
          status: result.ok ? (stage === "editor" ? "published" : "ready") : "failed",
          date: kstDate(),
          calls: result.callCount,
          candidates: result.candidateCount,
          selected: result.selectedCount,
          ...(verifiedCards !== undefined ? { verifiedCards } : {}),
          ...(quality ? { quality: { passed: quality.passed, failures: quality.failures } } : {}),
          ...(qualityError ? { qualityError } : {}),
          previousRunRetained: result.previousRunRetained,
          ...(result.error ? { error: result.error } : {}),
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
