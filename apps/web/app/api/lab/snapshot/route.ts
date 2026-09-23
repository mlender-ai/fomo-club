/**
 * `POST /api/lab/snapshot` — 조립본을 **지금** 다시 만든다.
 *
 * 평소에는 업로드(`POST /api/lab/fce`)가 끝날 때 만들어진다. 이 경로가 따로 있는 이유:
 *
 * 1. **조립본은 배포보다 오래 산다.** 형식을 바꿔 배포하면 DB 에 옛 형식이 남는다
 *    (`SNAPSHOT_VERSION`). 다음 업로드를 기다리지 않고 바로 고칠 수 있어야 한다.
 * 2. **FCE 가 죽어도 랩 데이터는 바뀐다** — 연구 노트를 시드했을 때처럼. 그때도 화면이
 *    따라와야 한다.
 *
 * 읽는 것은 **랩 DB 뿐**이다. FCE 에 닿지 않는다.
 */
import { NextResponse } from "next/server";

import { SNAPSHOT_VERSION, buildSnapshots } from "../../../../lib/lab/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const expected = process.env.LAB_INGEST_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const got = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const keys = await buildSnapshots();
  return NextResponse.json({ ok: true, version: SNAPSHOT_VERSION, keys, ms: Date.now() - started });
}
