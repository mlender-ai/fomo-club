/**
 * `GET /api/lab/research/{no}` — 연구 상세 (UI-02 PART F).
 *
 * 목록 조립본에는 요약만 있다. 상세는 가설·방법·근거·결정이 필요해서 **이 라우트만
 * 표를 직접 읽는다.** 연구 항목은 자주 안 열리므로 쿼리 하나를 더 쓸 값어치가 있다.
 *
 * 근거에는 출처가 붙어 있다 — 출처 없는 수치는 다음 사람이 검증할 수 없다.
 */
import { NextResponse } from "next/server";

import { prisma } from "../../../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ no: string }> }
): Promise<NextResponse> {
  const started = Date.now();
  const { no } = await context.params;
  const item = await prisma.research.findUnique({ where: { no } });
  if (!item) return NextResponse.json({ error: "not_found", no }, { status: 404 });
  return NextResponse.json(
    { data: { item }, ms: Date.now() - started },
    { headers: { "cache-control": "no-store" } }
  );
}
