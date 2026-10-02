/**
 * TRADER-03 0-1 — 로그인. 5회 틀리면 15분 잠금(IP 별, 서버가 센다).
 * 잠긴 동안은 **맞는 비밀번호도** 받지 않는다 — 잠금이 의미가 있으려면.
 */
import { NextResponse } from "next/server";

import {
  LOCK_MINUTES,
  MAX_FAILS,
  SESSION_COOKIE,
  SESSION_DAYS,
  UI_COOKIE,
  clientIp,
  configured,
  cookieOptions,
  isLocked,
  passwordMatches,
  recordAttempt,
  signSession,
} from "../../../../lib/me/auth";
import { PRIVATE_HEADERS, json } from "../../../../lib/me/http";
import { MeStoreMissing, readMany, readLocks, writeLocks } from "../../../../lib/me/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!configured()) return json({ error: "not_configured", hint: "ME_PASSWORD 환경변수가 없다" }, 503);
  try {
    await readMany(["auth"]);
  } catch (err) {
    if (err instanceof MeStoreMissing) return json({ error: "not_ready", hint: "비공개 표가 아직 없다(마이그레이션 전)" }, 503);
    throw err;
  }
  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const now = Date.now();
  const ip = clientIp(request);
  const book = await readLocks();
  const locked = isLocked(book, ip, now);
  if (locked) return json({ error: "locked", until: locked, minutes: LOCK_MINUTES }, 429);
  const ok = passwordMatches(password);
  const next = recordAttempt(book, ip, ok, now);
  await writeLocks(next);
  if (!ok) {
    const entry = next[ip];
    return json({ error: "wrong_password", left: Math.max(0, MAX_FAILS - (entry?.fails ?? 0)), locked: entry?.lockedUntil ?? null }, 401);
  }
  const token = signSession(now) as string;
  const res = NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
  const maxAge = SESSION_DAYS * 86_400;
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(maxAge, true));
  res.cookies.set(UI_COOKIE, "1", cookieOptions(maxAge, false));
  return res;
}
