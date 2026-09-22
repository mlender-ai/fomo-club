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

  return {
    level,
    lastAt,
    ageMs,
    lastError: failed && failed.error ? { at: failed.at, error: failed.error } : null,
    label,
  };
}
