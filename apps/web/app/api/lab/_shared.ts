/**
 * 화면용 API 공통 (UI-02 PART F).
 *
 * > **각 API 는 화면 하나에 필요한 걸 한 번에 준다.**
 *
 * ## 한 요청 = 쿼리 한 번
 *
 * 원격 DB 왕복이 ~900ms 다(실측: 쿼리 2개 1,793ms · 1개 904ms). 그래서 라우트는
 * **조립본 한 줄만 읽는다.** 조립은 업로드가 끝난 뒤 쓰기 경로에서 해둔다
 * (`lib/lab/snapshot.ts`).
 */
import { NextResponse } from "next/server";

import { readSnapshot, type SnapshotKey } from "../../../lib/lab/snapshot";
import { syncFromSeed, type SyncStatus } from "../../../lib/lab/sync";

export interface Envelope<T> {
  data: T;
  /** 모든 응답에 붙는다 — **어느 화면이든 끊김을 띄울 수 있어야 한다**(PART G). */
  sync: SyncStatus;
  /** 조립본을 만든 시각. 이게 오래면 화면이 과거를 보고 있는 것이다. */
  builtAt: string;
  ms: number;
}

export async function fromSnapshot(key: SnapshotKey): Promise<NextResponse> {
  const started = Date.now();
  const snap = await readSnapshot<unknown>(key);
  if (!snap) {
    // **빈 화면과 고장을 구분해준다.** 업로드가 한 번도 안 돌면 조립본이 없다.
    return NextResponse.json(
      {
        error: "not_built",
        key,
        hint: "FCE 업로드가 한 번도 돌지 않았다 — npm run lab:runner",
      },
      { status: 503 }
    );
  }
  const body: Envelope<unknown> = {
    data: snap.payload,
    sync: syncFromSeed(snap.sync),
    builtAt: snap.builtAt.toISOString(),
    ms: Date.now() - started,
  };
  return NextResponse.json(body, {
    headers: { "cache-control": "no-store", "server-timing": `build;dur=${body.ms}` },
  });
}
