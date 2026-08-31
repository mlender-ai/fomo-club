import { PrismaClient } from "@prisma/client";

/**
 * Prisma 커넥션 상한 — **서버리스에서는 람다 하나당 1개다.**
 *
 * ## 왜 이걸 코드에 박나 (2026-08-30)
 *
 * `EMAXCONNSESSION ... pool_size: 15` 가 아홉 번 났다. 원인을 Supabase 설정이라고 봤는데
 * 아니었다 — **우리가 커넥션을 몇 개 잡는지 아무도 정하지 않고 있었다.**
 *
 * ```
 * GitHub Actions 잡   PRISMA_CONNECTION_LIMIT=1   ← 걸려 있음
 * Vercel 런타임        (없음)                      ← 여기가 구멍이었다
 * ```
 *
 * 환경변수가 없으면 Prisma 는 **`물리 CPU × 2 + 1`** 을 쓴다. Vercel 람다에서 보통 5~9 다.
 * 람다 두셋만 동시에 떠도 15를 넘는다 — 그게 굽기 직후 되읽기가 늘 503 이던 이유다.
 *
 * ## 왜 1인가
 *
 * 서버리스 람다는 **한 번에 요청 하나**를 처리한다. 커넥션을 여러 개 들고 있어도 쓸 일이
 * 없고, 대신 풀에서 남의 자리를 뺏는다. 1로 두면 같은 `pool_size: 15` 로 **람다 15개**가
 * 동시에 돌 수 있다 — 종전에는 두셋이면 찼다.
 *
 * 굽기처럼 병렬 조회가 많은 경로는 한 커넥션으로 줄 서게 되는데, 그래서 `pool_timeout` 을
 * 넉넉히 준다. **줄 서서 기다리는 것이 즉시 실패하는 것보다 낫다** — 지금까지는 기다리지
 * 못하고 바로 죽었다.
 *
 * 환경변수로 덮을 수 있게 남겨둔다 — 배치 잡처럼 사정이 다른 곳이 있다.
 */
const DEFAULT_CONNECTION_LIMIT = "1";
/** 커넥션을 기다리는 시간(초). 기본 10초는 병렬 조회가 많은 굽기에서 짧다. */
const DEFAULT_POOL_TIMEOUT = "30";

function applyConnectionSettings(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  try {
    const url = new URL(databaseUrl);
    /**
     * **연결 문자열에 이미 적혀 있으면 손대지 않는다.** 운영자가 대시보드에서 받은 값을
     * 그대로 붙여 넣었을 수 있고, 그 의도를 코드가 덮으면 안 된다.
     */
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", process.env.PRISMA_CONNECTION_LIMIT || DEFAULT_CONNECTION_LIMIT);
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", process.env.PRISMA_POOL_TIMEOUT || DEFAULT_POOL_TIMEOUT);
    }
    process.env.DATABASE_URL = url.toString();
  } catch (err) {
    // 연결 문자열이 URL 로 안 읽히면 손대지 않는다 — 고치려다 못 쓰게 만들지 않는다.
    console.warn("[prisma] connection settings ignored", err instanceof Error ? err.message : String(err));
  }
}

applyConnectionSettings();

// 공유 Prisma 클라이언트(단일 인스턴스). dev HMR에서 커넥션 폭증 방지용 globalThis 캐시.
declare global {
  // eslint-disable-next-line no-var
  var __fomoPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__fomoPrisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") {
  globalThis.__fomoPrisma = prisma;
}
