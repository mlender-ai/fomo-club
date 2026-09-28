/**
 * `GET /api/lab/cron/watch` — 맥 밖 감시 한 바퀴 (OPS-03 A · C · D). Supabase `pg_cron` 이 5분마다 부른다.
 *
 * 멱등이다 — 알림은 상태가 바뀔 때만 나간다. 누가 더 불러도 같은 알림이 두 번 가지 않는다.
 */
import { NextResponse } from "next/server";

import { runWatch } from "../../../../../lib/lab/watch-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  try {
    const result = await runWatch(new Date());
    return NextResponse.json({ ...result, ms: Date.now() - started }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 300) : "watch failed" }, { status: 500 });
  }
}
