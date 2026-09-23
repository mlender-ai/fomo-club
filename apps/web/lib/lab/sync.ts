/**
 * 동기화 상태 (UI-02 PART G).
 *
 * ```
 * ● 실시간 · 2분 전 동기화      5분 이내
 * ● 3시간 전 동기화              지연 · 주황
 * ○ 동기화 끊김 · 호스트 확인     1시간 초과 · 빨강
 * ```
 *
 * **끊기면 모든 화면 상단에 띠를 띄운다.** 옛 숫자를 지금 숫자로 읽으면 안 된다.
 *
 * 성공한 업로드만 센다 — 실패한 순간은 데이터가 갱신되지 않은 순간이고, 그걸
 * "최근 갱신" 으로 세면 화면이 거짓이 된다.
 */
import { prisma } from "../prisma";

export const FRESH_MS = 5 * 60 * 1000;
export const BROKEN_MS = 60 * 60 * 1000;

export type SyncLevel = "live" | "lagging" | "broken";

export interface SyncStatus {
  level: SyncLevel;
  lastAt: Date | null;
  ageMs: number | null;
  /** 마지막 실패. 있으면 화면이 사유를 그대로 옮긴다. */
  lastError: { at: Date; error: string } | null;
  /** 이 말이 그대로 헤더에 나간다. */
  label: string;
}

/**
 * 조립본에 실린 시각으로 상태를 만든다. **쿼리를 하지 않는다.**
 *
 * 경과 시간은 요청 시점에 센다 — 조립본에 굳혀두면 화면이 항상 "2분 전" 이라고
 * 말하게 된다.
 */
export function syncFromSeed(
  seed: { lastAt: string | null; lastError: { at: string; error: string } | null },
  now: Date = new Date()
): SyncStatus {
  const lastAt = seed.lastAt ? new Date(seed.lastAt) : null;
  const ageMs = lastAt ? now.getTime() - lastAt.getTime() : null;
  return {
    ...describe(ageMs, lastAt),
    lastAt,
    ageMs,
    lastError: seed.lastError ? { at: new Date(seed.lastError.at), error: seed.lastError.error } : null,
  };
}

/** 나이 → 단계와 문구. 두 경로(조립본·직접 조회)가 같은 말을 하게 한 곳에 둔다. */
function describe(ageMs: number | null, lastAt: Date | null): { level: SyncLevel; label: string } {
  const level: SyncLevel =
    ageMs === null || ageMs > BROKEN_MS ? "broken" : ageMs > FRESH_MS ? "lagging" : "live";
  const minutes = ageMs === null ? null : Math.floor(ageMs / 60_000);
  const label =
    level === "broken"
      ? lastAt
        ? "동기화 끊김 · 호스트 확인"
        : "동기화 없음 · 호스트 확인"
      : minutes !== null && minutes < 1
        ? "실시간 · 방금 동기화"
        : level === "live"
          ? `실시간 · ${minutes}분 전 동기화`
          : minutes !== null && minutes < 60
            ? `${minutes}분 전 동기화`
            : `${Math.floor((minutes ?? 0) / 60)}시간 전 동기화`;
  return { level, label };
}

export async function readSyncStatus(now: Date = new Date()): Promise<SyncStatus> {
  // **한 문장으로 받는다.** 원격 DB 왕복 한 번이 ~900ms 라서, 쿼리 수가 곧
  // 응답 시간이다. `Promise.all` 로 두 번 부르면 두 배가 된다 — 실측 1.8초였다.
  const rows = await prisma.$queryRaw<
    { last_ok: Date | null; fail_at: Date | null; fail_error: string | null }[]
  >`
    SELECT
      (SELECT "at" FROM "FceUpload" WHERE "ok" = true ORDER BY "at" DESC LIMIT 1) AS last_ok,
      (SELECT "at" FROM "FceUpload" WHERE "ok" = false ORDER BY "at" DESC LIMIT 1) AS fail_at,
      (SELECT "error" FROM "FceUpload" WHERE "ok" = false ORDER BY "at" DESC LIMIT 1) AS fail_error
  `;
  const row = rows[0];
  const ok = row?.last_ok ? { at: row.last_ok } : null;
  const failed = row?.fail_at ? { at: row.fail_at, error: row.fail_error } : null;

  const lastAt = ok?.at ?? null;
  const ageMs = lastAt ? now.getTime() - lastAt.getTime() : null;

  // 한 번도 안 올라온 것과 오래된 것은 다르지만, **둘 다 지금 숫자가 아니다.**
  return {
    ...describe(ageMs, lastAt),
    lastAt,
    ageMs,
    lastError: failed && failed.error ? { at: failed.at, error: failed.error } : null,
  };
}

// ── 데이터 수집 상태 (UI-03 PART B — `/data` 가 헤더로 왔다) ──────────────────

/**
 * 시세가 이보다 오래되면 끊긴 것으로 본다. 수집 쪽(`scripts/lab/collect/config.ts`)의
 * `STALE_AFTER_MS` 와 **같은 값**이어야 한다 — 다르면 헤더와 수집기가 서로 다른 말을 한다.
 */
export const FEED_STALE_MS = 3 * 60 * 1000;

export interface CollectStatus {
  /** 시세가 끊긴 종목. 비어 있으면 정상. */
  staleSymbols: string[];
  /** 가장 오래된 시세의 나이. 시세가 하나도 없으면 null. */
  feedAgeMs: number | null;
  /** 마지막 실행이 실패한 잡과 연속 실패 수. */
  failing: { job: string; since: Date; error: string | null }[];
}

/**
 * 시세·수집 잡 상태를 **한 문장**으로 읽는다. 헤더가 1분마다 부르는 경로라, 왕복을
 * 하나라도 늘리면 모든 화면의 머리가 그만큼 늦게 말한다.
 */
export async function readCollectStatus(now: Date = new Date()): Promise<CollectStatus> {
  const rows = await prisma.$queryRaw<
    { kind: string; name: string; at: Date | null; ok: boolean | null; error: string | null }[]
  >`
    SELECT 'price' AS kind, "symbol" AS name, "fetchedAt" AS at, NULL::boolean AS ok, NULL AS error
      FROM "LatestPrice"
    UNION ALL
    SELECT 'job' AS kind, j."job" AS name, j."finishedAt" AS at, j."ok" AS ok, j."error" AS error
      FROM (
        SELECT DISTINCT ON ("job") "job", "finishedAt", "ok", "error"
          FROM "CollectionRun"
         ORDER BY "job", "finishedAt" DESC
      ) j
  `;

  const prices = rows.filter((r) => r.kind === "price");
  const ages = prices.map((r) => (r.at ? now.getTime() - r.at.getTime() : Number.POSITIVE_INFINITY));
  return {
    staleSymbols: prices.filter((_, i) => (ages[i] ?? 0) > FEED_STALE_MS).map((r) => r.name),
    feedAgeMs: ages.length === 0 ? null : Math.max(...ages.filter(Number.isFinite), 0) || null,
    failing: rows
      .filter((r) => r.kind === "job" && r.ok === false && r.at)
      .map((r) => ({ job: r.name, since: r.at as Date, error: r.error })),
  };
}

