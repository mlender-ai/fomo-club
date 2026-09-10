import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { backendApiFetch } from "../../lib/backend-api";

const MIN_OPERATION_PASSWORD_LENGTH = 16;

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authorizeLegacyOperation(request: NextRequest): NextResponse | null {
  // 페이퍼트레이딩 제어면. **LAB-00 부터 이것이 제품이다** — 옛 주석은
  // "FOMO Club 제품과 무관한 과거 제어면" 이라고 했지만 그 제품은 대체됐다.
  // 게이트는 그대로 닫아둔다: 여는 것은 LAB-07(페이퍼 실행기)의 일이고,
  // 그때 `apps/api` 의 체결 가정을 감사한 뒤에 연다(LAB-00 §5).
  if (process.env.ENABLE_LEGACY_TRADING_API !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const expected = process.env.API_PASSWORD ?? process.env.DASHBOARD_PASSWORD;
  if (!expected || expected.length < MIN_OPERATION_PASSWORD_LENGTH) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const supplied = request.headers.get("x-dashboard-password") ?? "";
  if (!secureEqual(supplied, expected)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  return null;
}

export async function proxyGet<T>(request: NextRequest, path: string) {
  const denied = authorizeLegacyOperation(request);
  if (denied) return denied;

  try {
    const data = await backendApiFetch<T>(path);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 502 }
    );
  }
}

export async function proxyPatch<T>(request: NextRequest, path: string, payload?: unknown) {
  const denied = authorizeLegacyOperation(request);
  if (denied) return denied;

  try {
    const body = payload === undefined ? await request.json() : payload;
    const data = await backendApiFetch<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    return NextResponse.json(data);
  } catch (error) {
    const invalidJson = error instanceof SyntaxError;
    return NextResponse.json(
      { error: invalidJson ? "Invalid JSON" : "Upstream unavailable" },
      { status: invalidJson ? 400 : 502 }
    );
  }
}
