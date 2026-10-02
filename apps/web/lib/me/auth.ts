/**
 * TRADER-03 0-1 — `/me/*` 로그인. **단일 사용자 비밀번호 + httpOnly 쿠키 30일 · 5회 틀리면 15분 잠금.**
 *
 * | 환경변수 | 누가 | 뜻 |
 * |---|---|---|
 * | `ME_PASSWORD` | 🧑 광혁 | 비밀번호. **없으면 로그인 자체가 닫힌다**(모든 `/me` 401) |
 * | `ME_SESSION_SECRET` | 🧑 (선택) | 쿠키 서명 키. 없으면 비밀번호에서 만든다 — 비밀번호를 바꾸면 모든 세션이 끊긴다 |
 *
 * ## 쿠키에 비밀번호를 넣지 않는다
 *
 * 옛 `/login` 은 비밀번호를 쿠키 값으로 그대로 넣었다(그 화면은 이 기능과 무관 · 건드리지 않음).
 * 여기는 `만료시각.HMAC` 만 넣는다 — 쿠키가 새도 비밀번호는 안 샌다. 30일 뒤 서명이 맞아도 거부.
 *
 * ## 잠금은 서버가 센다
 *
 * 실패 횟수를 쿠키에 두면 쿠키를 지우고 다시 시도하면 그만이다. IP 별로 DB(`MeSnapshot` `auth`)에 센다.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "fomo_me";
/** 헤더에 '나' 탭을 띄우는 표시. **인증에 쓰지 않는다**(httpOnly 가 아니라 화면이 읽는다). */
export const UI_COOKIE = "fomo_me_ui";
export const SESSION_DAYS = 30;
export const MAX_FAILS = 5;
export const LOCK_MINUTES = 15;
const DAY_MS = 86_400_000;

export function configured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ME_PASSWORD && env.ME_PASSWORD.length >= 8);
}

function secret(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  if (!configured(env)) return null;
  const raw = env.ME_SESSION_SECRET || `fomo-me-session:${env.ME_PASSWORD}`;
  return createHash("sha256").update(raw).digest();
}

function equal(a: string, b: string): boolean {
  // 길이가 달라도 같은 시간 — 해시로 맞춘 뒤 비교한다.
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

export function passwordMatches(supplied: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!configured(env)) return false;
  return equal(supplied, env.ME_PASSWORD as string);
}

/** `v1.{만료ms}.{서명}` */
export function signSession(nowMs: number, env: NodeJS.ProcessEnv = process.env): string | null {
  const key = secret(env);
  if (!key) return null;
  const exp = nowMs + SESSION_DAYS * DAY_MS;
  const body = `v1.${exp}`;
  const mac = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySession(token: string | undefined | null, nowMs: number, env: NodeJS.ProcessEnv = process.env): boolean {
  const key = secret(env);
  if (!key || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp <= nowMs) return false;
  const mac = createHmac("sha256", key).update(`v1.${exp}`).digest("base64url");
  return equal(mac, parts[2] as string);
}

/** 요청의 쿠키 헤더에서 세션 값. */
export function sessionFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function requestAuthorized(request: Request, nowMs = Date.now()): boolean {
  return verifySession(sessionFromCookieHeader(request.headers.get("cookie")), nowMs);
}

// ── 잠금(순수) ──────────────────────────────────────────────────────────

export interface LockEntry {
  fails: number;
  lockedUntil: number | null;
  last: number;
}
export type LockBook = Record<string, LockEntry>;

export function isLocked(book: LockBook, ip: string, nowMs: number): number | null {
  const e = book[ip];
  return e?.lockedUntil && e.lockedUntil > nowMs ? e.lockedUntil : null;
}

/** 시도 하나를 반영한 새 장부. 성공이면 그 IP 를 지운다. 하루 지난 기록은 버린다. */
export function recordAttempt(book: LockBook, ip: string, ok: boolean, nowMs: number): LockBook {
  const next: LockBook = {};
  for (const [k, v] of Object.entries(book)) {
    if (nowMs - v.last < DAY_MS && k !== ip) next[k] = v;
  }
  if (ok) return next;
  const prev = book[ip];
  const expired = prev?.lockedUntil && prev.lockedUntil <= nowMs;
  const fails = (expired ? 0 : (prev?.fails ?? 0)) + 1;
  next[ip] = {
    fails,
    lockedUntil: fails >= MAX_FAILS ? nowMs + LOCK_MINUTES * 60_000 : null,
    last: nowMs,
  };
  return next;
}

/**
 * 잠금을 셀 IP. Vercel 은 `x-real-ip` 를 자기가 채운다 — 클라이언트가 앞에 덧붙일 수 있는
 * `x-forwarded-for` 첫 값보다 믿을 만하다. 그게 없을 때만 `x-forwarded-for` 를 본다.
 */
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? "unknown").trim() || "unknown";
}

export function cookieOptions(maxAgeSec: number, httpOnly: boolean) {
  return {
    httpOnly,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}
