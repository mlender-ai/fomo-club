/**
 * `GET /api/lab/status` — 헤더 상태 (UI-02 PART G · UI-03 PART B·C).
 *
 * 두 가지를 같이 낸다:
 *
 * | | |
 * |---|---|
 * | `sync` | FCE 스냅샷이 언제 올라왔나 |
 * | `collect` | 시세·봉·펀딩비·고래 수집이 살아 있나 — **`/data` 가 헤더로 왔다** |
 *
 * `/data` 를 없애면서 수집 상태를 보여줄 곳이 사라질 뻔했다. 처음 "끊김" 을 발견한 게
 * 바로 그 화면이었다. 이제 헤더가 말한다.
 *
 * 헤더가 1분마다 부르므로 **쿼리 두 번**(FCE 업로드 · 수집 상태)을 병렬로 한다.
 */
import { NextResponse } from "next/server";

import { readCollectStatus, readSyncStatus } from "../../../../lib/lab/sync";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  const [sync, collect] = await Promise.all([readSyncStatus(), readCollectStatus()]);
  return NextResponse.json(
    { sync, collect, ms: Date.now() - started },
    { headers: { "cache-control": "no-store" } }
  );
}
