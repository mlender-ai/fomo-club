/**
 * `POST /api/lab/heartbeat` — 러너 심장박동 (OPS-03 A). 1분마다.
 *
 * FCE 워커 잡의 마지막 실행 시각 · 주식 트랙 관측 시각을 받는다. 맥 밖 감시(`/api/lab/cron/watch`)가 이걸 본다.
 * 받은 시각(`at`)은 **서버 시각**이다 — 맥 시계가 틀려도 "언제 받았나" 는 틀리지 않는다.
 */
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { authorized } from "../../../../lib/lab/auth";
import { prisma } from "../../../../lib/prisma";
import type { HeartbeatPayload } from "../../../../lib/lab/watch";

export const dynamic = "force-dynamic";

function valid(body: unknown): body is HeartbeatPayload {
  const b = body as HeartbeatPayload;
  return !!b && typeof b.at === "string" && !!b.fce && typeof b.fce.reachable === "boolean" && typeof b.fce.jobs === "object" && Array.isArray(b.stock);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!valid(body)) return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  const at = new Date();
  const payload = body as unknown as Prisma.InputJsonValue;
  await prisma.labHeartbeat.upsert({ where: { key: "runner" }, create: { key: "runner", at, payload }, update: { at, payload } });
  return NextResponse.json({ ok: true, at: at.toISOString() });
}
