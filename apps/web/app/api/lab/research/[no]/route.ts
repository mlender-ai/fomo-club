/**
 * `GET /api/lab/research/{no}` — 연구 상세 (UI-02 PART F).
 *
 * 가설 · 어떻게 확인하나 · 근거 · 결정을 전부 낸다. 근거에는 **출처가 붙어 있다** —
 * 출처 없는 수치는 다음 사람이 검증할 수 없다.
 */
import { NextResponse } from "next/server";

import { prisma } from "../../../../../lib/prisma";
import { envelope } from "../../_shared";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ no: string }> }
): Promise<NextResponse> {
  const { no } = await context.params;
  const item = await prisma.research.findUnique({ where: { no } });
  if (!item) return NextResponse.json({ error: "not_found", no }, { status: 404 });
  return envelope(async () => ({ item }));
}
