import { NextResponse } from "next/server";

/**
 * 배포 신원 라우트 (WO-RENDER-01 PART B) — **정규 도메인이 지금 무슨 커밋을 서빙하는가.**
 *
 * ## 왜 필요한가
 *
 * 같은 사고가 반복됐다: 배포는 READY 인데 정규 도메인은 옛 빌드를 서빙한다(#1076 · #1075).
 * "최신 프로덕션 배포의 커밋" 은 Vercel API 로 알 수 있지만, 그것은 **배포 기록**이지
 * **별칭이 지금 무엇을 가리키는가**가 아니다. 둘이 어긋나는 것이 바로 그 사고였다.
 * 사용자가 받는 것을 재려면 **정규 도메인에 HTTP 로 물어야** 한다.
 *
 * `scripts/verify-production.ts` 가 이 라우트를 읽는다. Vercel 자격증명 없이도 동작해야 하므로
 * (`AGENTS.md` 세션 시작 체크리스트 2번을 **모든** 세션이 실행할 수 있어야 한다) 인증을 걸지 않는다.
 * 레포는 공개이고 커밋 SHA·배포 ID 는 비밀이 아니다. 그래도 노출을 최소로 묶는다 —
 * **환경변수를 통째로 내보내지 않고 아래 화이트리스트만** 낸다.
 *
 * ## 번들 격리 (`AGENTS.md` 번들 격리 규정)
 *
 * `lib/fomo` 의 `withCors`·`corsJson` 를 쓰지 않는다. 그 모듈은 `@prisma/client` 와 `@fomo/core` 를
 * 끌어오고, 이 라우트는 그것을 하나도 쓰지 않는다. 조회 경로 콜드스타트(실측 49.0s, 람다 10.15MB)를
 * 나쁘게 만들지 않으려면 **진단 라우트가 제품 의존성을 끌어오면 안 된다.** CORS 헤더는 여기서 직접 쓴다.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

/** 검증은 캐시를 절대 타면 안 된다 — 캐시된 신원은 지난 배포의 신원이다. */
const NO_STORE = { "Cache-Control": "no-store, must-revalidate" } as const;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return NextResponse.json(
    {
      ok: true,
      app: "fomo-club-backend",
      /** 배포된 커밋 전체 SHA. 로컬 `next dev` 에선 `null` — 없는 값을 만들지 않는다. */
      commit,
      commitShort: commit ? commit.slice(0, 8) : null,
      /** `lib/fomo.ts` 의 `cacheVersion()` 과 같은 값. 데이터 캐시 키에 들어가는 그 토큰이다. */
      cacheVersion: (commit ?? "dev").slice(0, 8),
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      env: process.env.VERCEL_ENV ?? "local",
      region: process.env.VERCEL_REGION ?? null,
      /** 배포 시각이 아니다 — 이 람다 인스턴스가 깨어난 시각(콜드스타트). 혼동 금지. */
      servedAt: new Date().toISOString(),
    },
    { headers: { ...CORS, ...NO_STORE } }
  );
}
