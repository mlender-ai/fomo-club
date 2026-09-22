/**
 * `GET /api/lab/status` — 헤더 동기화 상태 (UI-02 PART F · G).
 *
 * 화면 전체가 이걸 보고 띠를 띄운다. **가장 싸야 하는 요청**이라 업로드 기록
 * 두 줄만 읽는다.
 */
import { NextResponse } from "next/server";

import { readSyncStatus } from "../../../../lib/lab/sync";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  const sync = await readSyncStatus();
  return NextResponse.json({ sync, ms: Date.now() - started }, { headers: { "cache-control": "no-store" } });
}
