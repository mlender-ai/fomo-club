import { NextResponse } from "next/server";
import { withCors } from "../../../../../lib/fomo";
import { discoverDartStructure } from "../../../../../lib/fundamentals/dart-discovery";

/**
 * DART 응답 구조 덤프 — WO-SUB-03.5 PART E-1 / WO-SUB-02R 착수 조건 1.
 *
 * `DART_API_KEY` 는 **Vercel 런타임에만** 있다. 그래서 크론 경로로 노출해 여기서 돌린다.
 * GET /api/fomo/cron/dart-discovery[?code=185750]
 *
 * **판정하지 않는다** — 구조만 덤프한다(WO-SUB-00 규칙: 확보율을 세기 전에 구조를 먼저 본다).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return !secret || request.headers.get("authorization") === `Bearer ${secret}`;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return withCors(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  const code = new URL(request.url).searchParams.get("code")?.trim() || "185750";
  try {
    const result = await discoverDartStructure(code);
    return withCors(NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } }));
  } catch (error) {
    return withCors(
      NextResponse.json({ ok: false, error: (error as Error)?.message ?? "dart discovery failed" }, { status: 500 })
    );
  }
}
