/** `/api/me/*` 응답 공통 — 캐시 금지 · 검색 금지. 몸통에 실계좌 값이 있어도 로그로는 내보내지 않는다. */
import { NextResponse } from "next/server";

import { requestAuthorized } from "./auth";

export const PRIVATE_HEADERS = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
} as const;

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

/** 쿠키가 없거나 틀리면 401 — **화면만 막고 API 를 열어두지 않는다**(TRADER-03 0-1). */
export function guard(request: Request): NextResponse | null {
  return requestAuthorized(request) ? null : json({ error: "unauthorized" }, 401);
}
