/**
 * `GET /api/lab/cron/morning` — 아침 리포트 (OPS-03 B). `pg_cron` 이 07:30 KST 에 부른다.
 *
 * 하루 한 번만 나간다(`LabNotice` morning · 그날). 다시 보내기(`?force=1`)와 미리보기(`?preview=1`)는 토큰이 있어야 한다.
 */
import { NextResponse } from "next/server";

import { authorized } from "../../../../../lib/lab/auth";
import { runResearchLoop } from "../../../../../lib/lab/experiments-run";
import { buildMorning, runMorning } from "../../../../../lib/lab/watch-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const privileged = authorized(request);
  try {
    if (url.searchParams.get("preview") === "1") {
      if (!privileged) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      return NextResponse.json({ text: await buildMorning(new Date()) });
    }
    const force = url.searchParams.get("force") === "1" && privileged;
    // ENG-02 B — 매일 한 번 관측 → 가설 → 등록(규칙을 지키는 것만). 아침 리포트와 같은 시각 · 같은 호출.
    const loop = await runResearchLoop(new Date()).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
    return NextResponse.json({ ...(await runMorning(new Date(), force)), researchLoop: loop }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 300) : "morning failed" }, { status: 500 });
  }
}
