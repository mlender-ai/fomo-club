/** 러너 · 운영 요청 인증 — `LAB_INGEST_TOKEN` 하나를 같이 쓴다(`/api/lab/market` 과 같은 비교). */
export function authorized(request: Request): boolean {
  const expected = process.env.LAB_INGEST_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const got = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
