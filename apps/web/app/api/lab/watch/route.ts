/**
 * `GET /api/lab/watch` — 감시 상태 읽기 (OPS-03). 지금 울리는 것 · 최근 알림 30개 · 어제 · 오늘 유효일.
 *
 * 알림을 걸어만 두고 안 온 적이 있다 — **무엇이 언제 나갔나(못 나갔나)** 를 누구나 볼 수 있게 한다.
 * 알림 글에는 비밀이 없다(무엇이 · 얼마나 · 해 볼 명령).
 */
import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import { kstDay } from "../../../../lib/lab/watch";
import { coverageOfDays, readHeartbeat } from "../../../../lib/lab/watch-run";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const now = new Date();
  const [alerts, notices, heartbeat, coverage] = await Promise.all([
    prisma.labAlert.findMany({ orderBy: { key: "asc" } }),
    prisma.labNotice.findMany({ orderBy: { at: "desc" }, take: 30 }),
    readHeartbeat(),
    coverageOfDays([kstDay(new Date(now.getTime() - 86_400_000)), kstDay(now)]),
  ]);
  return NextResponse.json(
    {
      at: now.toISOString(),
      heartbeatAt: heartbeat?.at.toISOString() ?? null,
      alerts,
      notices,
      coverage,
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
