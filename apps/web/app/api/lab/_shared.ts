/**
 * 화면용 API 공통 (UI-02 PART F).
 *
 * > **각 API 는 화면 하나에 필요한 걸 한 번에 준다.** 화면이 API 를 여러 번 부르지
 * > 않게.
 *
 * 그래서 이 파일은 응답 껍데기와 동기화 상태만 갖는다 — 계산은 `lib/lab/*` 이
 * 하고, 라우트는 조립만 한다.
 */
import { NextResponse } from "next/server";

import { readSyncStatus, type SyncStatus } from "../../../lib/lab/sync";

export interface Envelope<T> {
  data: T;
  /** 모든 응답에 붙는다 — **어느 화면이든 끊김을 띄울 수 있어야 한다**(PART G). */
  sync: SyncStatus;
  /** 서버가 이 응답을 만든 데 걸린 시간(ms). p95 500ms 를 지키는지 보려고 싣는다. */
  ms: number;
}

export async function envelope<T>(build: () => Promise<T>): Promise<NextResponse> {
  const started = Date.now();
  const [data, sync] = await Promise.all([build(), readSyncStatus()]);
  const body: Envelope<T> = { data, sync, ms: Date.now() - started };
  return NextResponse.json(body, {
    headers: {
      // 집계는 미리 해뒀다. 그래도 같은 초에 여러 번 부르면 캐시가 받아준다.
      "cache-control": "no-store",
      "server-timing": `build;dur=${body.ms}`,
    },
  });
}
