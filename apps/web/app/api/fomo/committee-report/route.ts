import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withCors } from "../../../../lib/fomo";
import { readCommitteeRunReports, readPublishedCommitteeSnapshot } from "../../../../lib/expert-review-store";

export const dynamic = "force-dynamic";

async function isAuthorized(request: Request): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  // CRON_SECRET 미설정 시 관대 — cron/prewarm·quality-slo 라우트와 동일 규약. 설정되면 Bearer 강제.
  // (미설정 상태로 두면 Quality SLO Monitor 등 CRON_SECRET 없는 워크플로우가 401 로 하드 실패했었다.)
  if (!cronSecret) return true;
  if (request.headers.get("authorization") === `Bearer ${cronSecret}`) return true;
  const password = process.env.DASHBOARD_PASSWORD;
  return Boolean(password) && (await cookies()).get("dashboard_session")?.value === password;
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? "7");
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(30, Math.round(requested))) : 7;
  const [active, runs] = await Promise.all([
    readPublishedCommitteeSnapshot(),
    readCommitteeRunReports(limit),
  ]);
  return withCors(NextResponse.json({ ok: true, active: active?.report ?? null, runs }, {
    headers: { "Cache-Control": "no-store" },
  }));
}
