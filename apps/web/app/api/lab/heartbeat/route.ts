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
import { WRITER_HEADER, writerRejection } from "../../../../lib/lab/writer";

export const dynamic = "force-dynamic";

function valid(body: unknown): body is HeartbeatPayload {
  const b = body as HeartbeatPayload;
  return !!b && typeof b.at === "string" && !!b.fce && typeof b.fce.reachable === "boolean" && typeof b.fce.jobs === "object" && Array.isArray(b.stock);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // OPS-04 — 쓰는 쪽은 하나다. 운영이 아닌 기계의 쓰기는 409.
  const notWriter = writerRejection(request);
  if (notWriter) return notWriter;
  const body = await request.json().catch(() => null);
  if (!valid(body)) return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  const at = new Date();
  // 누가 보냈는지 같이 둔다 — 서버 이전 뒤 "맥이 아직 도나" 를 한 줄로 본다(OPS-04).
  const payload = { ...body, writer: request.headers.get(WRITER_HEADER) } as unknown as Prisma.InputJsonValue;
  await prisma.labHeartbeat.upsert({ where: { key: "runner" }, create: { key: "runner", at, payload }, update: { at, payload } });
  return NextResponse.json({ ok: true, at: at.toISOString() });
}
