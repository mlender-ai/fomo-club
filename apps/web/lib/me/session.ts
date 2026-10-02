/** 서버 화면용 — 쿠키가 맞지 않으면 로그인으로 보낸다. */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySession } from "./auth";

export async function requireMe(next: string): Promise<void> {
  const jar = await cookies();
  if (!verifySession(jar.get(SESSION_COOKIE)?.value, Date.now())) {
    redirect(`/me/login?next=${encodeURIComponent(next)}`);
  }
}
