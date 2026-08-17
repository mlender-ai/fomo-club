import { NextResponse } from "next/server";

/**
 * 프론트 배포 신원 라우트 (WO-RENDER-01 PART B) — 백엔드 쪽
 * `apps/web/app/api/fomo/ops/version/route.ts` 의 대응물이다. 이유는 그쪽 주석에 있다.
 *
 * 프론트는 `buildId` 도 HTML 에서 읽을 수 있지만(`\"b\":\"<buildId>\"`), **buildId 는 커밋이 아니다** —
 * 빌드 산출물이 같으면 커밋이 달라도 같을 수 있고, 커밋을 되돌려도 새 buildId 가 나온다.
 * 그래서 둘을 함께 낸다: buildId 는 *빌드 동일성*, 커밋은 *소스 동일성* 을 말한다.
 *
 * 의존성 없음 — 진단 라우트가 제품 번들을 끌어오면 콜드스타트가 나빠진다.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

const NO_STORE = { "Cache-Control": "no-store, must-revalidate" } as const;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return NextResponse.json(
    {
      ok: true,
      app: "fomo-web",
      commit,
      commitShort: commit ? commit.slice(0, 8) : null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      env: process.env.VERCEL_ENV ?? "local",
      region: process.env.VERCEL_REGION ?? null,
      /** 배포 시각이 아니다 — 이 인스턴스가 깨어난 시각. */
      servedAt: new Date().toISOString(),
    },
    { headers: { ...CORS, ...NO_STORE } }
  );
}
