/** `POST /api/lab/experiments/applied` — 러너가 새 정책 버전 파일을 쓴 뒤(ENG-02 F). 버전 · 반영 시각을 남긴다. */
import { NextResponse } from "next/server";

import { authorized } from "../../../../../lib/lab/auth";
import { markApplied } from "../../../../../lib/lab/experiments-run";
import { writerRejection } from "../../../../../lib/lab/writer";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // OPS-04 — 쓰는 쪽은 하나다. 운영이 아닌 기계의 쓰기는 409.
  const notWriter = writerRejection(request);
  if (notWriter) return notWriter;
  const body = (await request.json().catch(() => null)) as { number?: number; version?: string; at?: string } | null;
  if (!body || typeof body.number !== "number" || typeof body.version !== "string") return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  return NextResponse.json(await markApplied(body.number, body.version, body.at ? new Date(body.at) : new Date()));
}
