import { readFeedContent, writeFeedContent } from "./feed-content-store";

/**
 * 스테일 서빙 (WO-OPS-504 PHASE 3) — **504 대신 오래된 데이터를 준다.**
 *
 * ## 왜 필요한가 (실측 근거)
 *
 * `/api/fomo/discovery` 는 `maxDuration = 60`, `/api/fomo/daily-30` 은 300 이다. 두 라우트는
 * 응답을 **요청 시점에 만든다**. 콜드 빌드가 그 제한을 넘으면 함수는 응답도 못 주고 잘리고
 * (504), **잘렸으므로 캐시도 못 쓴다.** 다음 요청도 콜드로 시작한다 —
 * **스스로 회복할 수 없는 상태**다. 2026-07-27T13:31 백엔드 재배포로 데이터 캐시가 비워진
 * 직후부터 프리웜이 실패해 온 것이 그 증거다(`docs/ops/INCIDENT_prewarm_20260814.md`).
 *
 * ## 이 모듈이 하는 일
 *
 * 1. 빌드에 **마감 시간**을 건다. 넘기면 기다리지 않고 마지막 성공분을 준다.
 * 2. 빌드가 성공하면 그 결과를 스냅샷으로 저장한다(다음 실패 때 줄 것).
 *
 * **빌드 로직은 건드리지 않는다.** 무엇을 얼마나 만드는지는 그대로고, 여기서는 "못 만들었을 때
 * 무엇을 주는가"만 정한다. 근본 수리(빌드 비용)는 PHASE 4 다.
 *
 * ## 정직성
 *
 * 스테일 응답에는 반드시 **언제 만든 것인지**가 실려 나간다(`stale.savedAt`). 화면이 그것을
 * 표시할 수 있어야 오래된 데이터를 최신인 척 보여주지 않는다.
 */

/** 스냅샷 저장 키 — `FeedContentCache` 를 그대로 쓴다(새 테이블 없음). */
export const snapshotId = (key: string): string => `snapshot:${key}`;

export interface StaleSnapshot<T> {
  row: T;
  /** 이 스냅샷을 만든 시각(ISO). 화면이 "언제 것인지"를 말할 수 있어야 한다. */
  savedAt: string;
}

/**
 * 마감 시간 안에 끝나면 결과, 아니면 `null`.
 *
 * **작업을 취소하지 않는다.** 취소할 방법이 없고(진행 중인 fetch/쿼리), 취소하지 않는 편이
 * 낫다 — 남은 시간 안에 끝나면 `unstable_cache` 가 채워져 다음 요청이 빨라진다.
 */
export async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 마지막 성공분. 없으면 `null` — 그때는 호출부가 기존 503 경로를 탄다(빈 200 금지). */
export async function readStaleSnapshot<T>(key: string): Promise<StaleSnapshot<T> | null> {
  const stored = await readFeedContent<StaleSnapshot<T>>(snapshotId(key)).catch(() => null);
  if (!stored || typeof stored !== "object" || !("row" in stored)) return null;
  return stored;
}

/**
 * 성공분 저장. **실패해도 응답을 막지 않는다** — 스냅샷은 보조 장치이고, 이것 때문에
 * 정상 응답이 늦어지거나 깨지면 배보다 배꼽이다.
 */
export async function writeStaleSnapshot<T>(key: string, row: T): Promise<void> {
  await writeFeedContent(snapshotId(key), { row, savedAt: new Date().toISOString() } satisfies StaleSnapshot<T>)
    .catch((err: unknown) => {
      console.warn("[stale-serve] snapshot write skipped", err instanceof Error ? err.message : err);
    });
}

/**
 * 스테일 응답에 붙는 표식 — 소비자가 "이건 오래된 것"을 알 수 있어야 한다.
 *
 * **`meta.staleServe` 로 감싼다.** `daily-30` 의 `meta.stale` 은 이미
 * `"committee-yesterday" | "engine-direct"`(비상 공급 경로) 라는 다른 뜻으로 쓰인다 —
 * 거기에 `true` 를 덮으면 원래 의미가 지워진다. 두 사실은 독립이므로 키를 분리한다.
 */
export interface StaleMark {
  staleServe: {
    stale: true;
    savedAt: string;
    reason: "build_deadline";
  };
}

export const staleMark = (savedAt: string): StaleMark => ({
  staleServe: { stale: true, savedAt, reason: "build_deadline" },
});
