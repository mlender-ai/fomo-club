import { AsyncLocalStorage } from "node:async_hooks";

/**
 * 단계별 계측 (WO-OPS-504 PHASE 2) — **어느 단계가 시간을 먹는지 수치로 남긴다.**
 *
 * ## 왜 필요한가
 *
 * `docs/ops/INCIDENT_prewarm_20260814.md` 는 원인을 "콜드 빌드 비용이 `maxDuration` 을 넘었다"
 * 로 규명했지만, **무엇이 그 비용인지는 못 냈다.** PHASE 4(구조 수리)는 그 수치 없이 결정하지
 * 않기로 했다. 이 모듈이 그 수치를 만든다.
 *
 * ## 설계 — 시그니처를 오염시키지 않는다
 *
 * 빌드 경로는 함수 10여 개를 거친다. 타이머를 인자로 꿰면 그 전부를 고쳐야 하고, 계측이 끝나면
 * 그 전부를 되돌려야 한다. 그래서 `AsyncLocalStorage` 로 **요청 스코프**에 담고, 잎에서
 * `timeStage("이름", () => ...)` 로 감싼다. 컨텍스트가 없으면 그대로 통과한다(테스트·크론 경로
 * 무영향).
 *
 * ## 마감 초과 때가 가장 중요하다
 *
 * `report()` 는 **아직 끝나지 않은 단계**(`pending`)를 같이 낸다. 마감(`withDeadline`)에 걸려
 * 스테일을 줄 때 이걸 찍으면 **"어느 단계에서 안 돌아왔는가"** 가 남는다 — 504 로 죽을 때는
 * 아무 기록도 안 남았던 것이 이번 사고를 18일 끌었다.
 *
 * ## 캐시 히트 구분
 *
 * `unstable_cache` 히트면 잎이 아예 안 돌아 `measured=false` 로 나온다. 즉 이 보고는
 * "이번 요청이 실제로 빌드를 했는가" 도 같이 답한다.
 */

export interface StageRow {
  stage: string;
  ms: number;
  /** 같은 이름이 여러 번 돌면 합산하고 횟수를 남긴다(mapLimit 안쪽 등). */
  count: number;
}

export interface StageReport {
  /** 타이머 생성부터 `report()` 까지 벽시계 시간. */
  totalMs: number;
  /** 끝난 단계 — 오래 걸린 순. */
  stages: StageRow[];
  /** 상위 3개 병목. WO 가 요구한 산출물. */
  top: StageRow[];
  /** 아직 안 끝난 단계 — 마감 초과 때 범인이 여기 있다. */
  pending: StageRow[];
  /** 잎이 하나라도 돌았나. `false` 면 캐시 히트(또는 계측 밖 경로). */
  measured: boolean;
}

interface Store {
  started: number;
  done: Map<string, { ms: number; count: number }>;
  pending: Map<string, number>;
}

const storage = new AsyncLocalStorage<Store>();

/**
 * ALS 컨텍스트가 끊긴 경우의 보조 저장소.
 *
 * `unstable_cache` 는 콜백을 자체 스코프에서 돌리므로 컨텍스트가 전파되지 않을 수 있다. 그때
 * 계측이 전부 비면 진단 자체가 무의미해지므로 모듈 스코프에 하나를 더 둔다. 동시 요청이 겹치면
 * 수치가 섞일 수 있지만 **진단용이고, 비는 것보다 섞이는 것이 낫다.**
 */
let fallbackStore: Store | null = null;

const currentStore = (): Store | null => storage.getStore() ?? fallbackStore;

const emptyStore = (): Store => ({ started: Date.now(), done: new Map(), pending: new Map() });

const toRows = (entries: Iterable<[string, { ms: number; count: number }]>): StageRow[] =>
  [...entries].map(([stage, value]) => ({ stage, ms: Math.round(value.ms), count: value.count })).sort((a, b) => b.ms - a.ms);

function buildReport(store: Store): StageReport {
  const now = Date.now();
  const stages = toRows(store.done.entries());
  const pending = toRows([...store.pending.entries()].map(([stage, at]) => [stage, { ms: now - at, count: 1 }] as const));
  return {
    totalMs: now - store.started,
    stages,
    top: stages.slice(0, 3),
    pending,
    measured: stages.length > 0 || pending.length > 0,
  };
}

/**
 * 요청 스코프 타이머를 열고 작업을 돌린다.
 *
 * `report()` 는 **언제든** 부를 수 있다 — 작업이 끝나기 전에 불러도 되고, 그때는 `pending` 이
 * 채워져 나온다(마감 초과 진단).
 */
export function runWithStageTimer<T>(work: () => Promise<T>): { result: Promise<T>; report: () => StageReport } {
  const store = emptyStore();
  fallbackStore = store;
  const result = storage.run(store, work).finally(() => {
    if (fallbackStore === store) fallbackStore = null;
  });
  return { result, report: () => buildReport(store) };
}

/** 단계 하나를 잰다. 타이머 밖이면 그대로 통과(오버헤드 없음). */
export async function timeStage<T>(stage: string, work: () => Promise<T>): Promise<T> {
  const store = currentStore();
  if (!store) return work();
  const startedAt = Date.now();
  store.pending.set(stage, startedAt);
  try {
    return await work();
  } finally {
    store.pending.delete(stage);
    const elapsed = Date.now() - startedAt;
    const prev = store.done.get(stage);
    store.done.set(stage, { ms: (prev?.ms ?? 0) + elapsed, count: (prev?.count ?? 0) + 1 });
  }
}

/** 동기 구간을 잰다 — 순수 계산이 병목일 수도 있으므로 배제 근거가 필요하다. */
export function timeStageSync<T>(stage: string, work: () => T): T {
  const store = currentStore();
  if (!store) return work();
  const startedAt = Date.now();
  try {
    return work();
  } finally {
    const elapsed = Date.now() - startedAt;
    const prev = store.done.get(stage);
    store.done.set(stage, { ms: (prev?.ms ?? 0) + elapsed, count: (prev?.count ?? 0) + 1 });
  }
}

/**
 * 한 줄 로그. 런타임 로그를 못 볼 때도 있으므로 응답에도 실을 수 있게 보고를 그대로 돌려준다.
 */
export function logStageReport(label: string, report: StageReport): StageReport {
  console.log(
    `[timings] ${label} total=${report.totalMs}ms measured=${report.measured} ` +
      `top=${report.top.map((row) => `${row.stage}:${row.ms}ms${row.count > 1 ? `x${row.count}` : ""}`).join(",") || "-"}` +
      (report.pending.length > 0 ? ` pending=${report.pending.map((row) => `${row.stage}:${row.ms}ms`).join(",")}` : "")
  );
  return report;
}
