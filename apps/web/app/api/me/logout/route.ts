import { NextResponse } from "next/server";

import { SESSION_COOKIE, UI_COOKIE, cookieOptions } from "../../../../lib/me/auth";
import { PRIVATE_HEADERS } from "../../../../lib/me/http";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0, true));
  res.cookies.set(UI_COOKIE, "", cookieOptions(0, false));
  return res;
}
