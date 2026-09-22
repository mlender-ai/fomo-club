/**
 * `GET /api/lab/whales` — UI-02 PART F.
 *
 * **조립본 한 줄만 읽는다.** 무엇이 들어 있는지와 왜 그렇게 담는지는
 * `lib/lab/snapshot.ts` 에 있다 — 규칙(순위 금지·뺄셈 금지·한계 문구)이 전부
 * 거기서 데이터에 박힌다.
 */
import type { NextResponse } from "next/server";

import { fromSnapshot } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return fromSnapshot("whales");
}
