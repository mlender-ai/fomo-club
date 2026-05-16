import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { extractBearerToken, verifyToken } from "./jwt";

export function requireAuth(req: NextRequest): { userId: string } | NextResponse {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ error: "Unauthorized", code: "NO_TOKEN" }, { status: 401 });
  }
  const userId = verifyToken(token);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized", code: "INVALID_TOKEN" }, { status: 401 });
  }
  return { userId };
}
