import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `EMAXCONNSESSION ... pool_size: 15` 이 **아홉 번** 났다. Supabase 설정 문제라고 봤는데
 * 아니었다 — **우리가 커넥션을 몇 개 잡는지 아무도 정하지 않고 있었다.**
 *
 * ```
 * GitHub Actions 잡   PRISMA_CONNECTION_LIMIT=1   ← 걸려 있음
 * Vercel 런타임        (없음)                      ← 구멍
 * ```
 *
 * 환경변수가 없으면 Prisma 는 `물리 CPU × 2 + 1`(Vercel 에서 보통 5~9)을 쓴다.
 * 람다 두셋이면 15가 찬다 — 굽기 직후 되읽기가 늘 503 이던 이유다.
 */
const src = readFileSync(new URL("../../lib/prisma.ts", import.meta.url), "utf8");

/** `prisma.ts` 는 import 시점에 env 를 고치므로, 로직만 그대로 옮겨 검사한다. */
function applyLike(databaseUrl: string, env: Record<string, string | undefined> = {}): string {
  const url = new URL(databaseUrl);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", env.PRISMA_CONNECTION_LIMIT || "1");
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", env.PRISMA_POOL_TIMEOUT || "30");
  }
  return url.toString();
}

const BASE = "postgresql://u:p@db.example.supabase.co:5432/postgres";

describe("서버리스 커넥션 상한 — 람다 하나당 1개", () => {
  it("기본값이 코드에 박혀 있다 — 환경변수가 없어도 걸린다", () => {
    expect(src).toContain('const DEFAULT_CONNECTION_LIMIT = "1";');
    expect(src).toContain('const DEFAULT_POOL_TIMEOUT = "30";');
  });

  it("연결 문자열에 상한과 대기시간을 붙인다", () => {
    const out = applyLike(BASE);
    expect(out).toContain("connection_limit=1");
    expect(out).toContain("pool_timeout=30");
  });

  it("**이미 적혀 있으면 손대지 않는다** — 운영자가 넣은 값을 코드가 덮으면 안 된다", () => {
    const out = applyLike(`${BASE}?connection_limit=5&pool_timeout=9`);
    expect(out).toContain("connection_limit=5");
    expect(out).toContain("pool_timeout=9");
  });

  it("환경변수로 덮을 수 있다 — 배치 잡은 사정이 다르다", () => {
    expect(applyLike(BASE, { PRISMA_CONNECTION_LIMIT: "3" })).toContain("connection_limit=3");
  });

  it("기다리는 시간이 기본 10초보다 길다 — 줄 서는 게 즉시 실패보다 낫다", () => {
    const timeout = Number(/DEFAULT_POOL_TIMEOUT = "(\d+)"/.exec(src)![1]);
    expect(timeout).toBeGreaterThan(10);
  });

  it("연결 문자열이 URL 로 안 읽히면 손대지 않는다 — 고치려다 못 쓰게 만들지 않는다", () => {
    expect(src).toContain("connection settings ignored");
    expect(() => applyLike("not-a-url")).toThrow();
  });
});
