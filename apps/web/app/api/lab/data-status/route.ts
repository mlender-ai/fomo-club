import { NextResponse } from "next/server";

import { readDataStatus } from "../../../../lib/lab/data-status";

/** 데이터 상태. 화면과 페이퍼 실행기(LAB-07)가 읽는다. */
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await readDataStatus();
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
