/**
 * TRADER-03 F — 맥 업로더(`scripts/trader/me_upload.py`)가 실계좌 · 복제 · 매매법을 올리는 자리.
 *
 * 토큰은 `ME_INGEST_TOKEN`(🧑 Vercel · 맥 둘 다). 랩 업로드 토큰과 **따로** 둔다 — 랩 토큰이 새도
 * 실계좌 자리는 못 건드린다. 토큰이 없으면 아예 닫는다. **몸통을 로그에 찍지 않는다.**
 */
import { createHash, timingSafeEqual } from "node:crypto";

import { json } from "../../../../lib/me/http";
import { INGEST_KEYS, MeStoreMissing, writeOne } from "../../../../lib/me/store";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

function tokenOk(request: Request): boolean {
  const expected = process.env.ME_INGEST_TOKEN;
  if (!expected || expected.length < 16) return false;
  const got = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!process.env.ME_INGEST_TOKEN) return json({ error: "not_configured" }, 503);
  if (!tokenOk(request)) return json({ error: "unauthorized" }, 401);
  const text = await request.text();
  if (text.length > MAX_BYTES) return json({ error: "too_large" }, 413);
  let body: { key?: unknown; payload?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const key = body.key;
  if (typeof key !== "string" || !(INGEST_KEYS as readonly string[]).includes(key)) return json({ error: "bad_key" }, 400);
  const payload = body.payload as { v?: unknown } | undefined;
  if (!payload || typeof payload !== "object" || payload.v !== 1) return json({ error: "bad_payload" }, 400);
  try {
    await writeOne(key as (typeof INGEST_KEYS)[number], payload);
  } catch (err) {
    if (err instanceof MeStoreMissing) return json({ error: "not_ready" }, 503);
    throw err;
  }
  // 무엇을 받았는지만 돌려준다 — 값은 돌려주지 않는다.
  return json({ ok: true, key, bytes: text.length });
}
