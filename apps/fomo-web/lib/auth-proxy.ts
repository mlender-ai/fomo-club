export const AUTH_COOKIE_NAME = "fomo_access_token";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const ALLOWED_PROXY_REQUESTS = new Map<string, ReadonlySet<string>>([
  ["auth/login", new Set(["POST"])],
  ["auth/register", new Set(["POST"])],
  ["auth/logout", new Set(["POST"])],
  ["auth/session", new Set(["GET"])],
  ["index", new Set(["GET"])],
  ["discovery", new Set(["GET"])],
  ["feed", new Set(["GET"])],
  ["stock-front", new Set(["GET"])],
  ["emotions/calendar", new Set(["GET"])],
  ["emotions/link", new Set(["POST"])],
  ["emotions/vote", new Set(["POST"])],
  ["taste", new Set(["POST"])],
  ["taste/link", new Set(["POST"])],
  ["account", new Set(["DELETE"])],
  ["challenges", new Set(["GET", "POST"])],
]);

export function isAllowedProxyRequest(path: string, method: string): boolean {
  return ALLOWED_PROXY_REQUESTS.get(path)?.has(method.toUpperCase()) === true;
}

export function sanitizeAuthPayload(payload: unknown): {
  payload: unknown;
  token: string | null;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { payload, token: null };
  }

  const record = payload as Record<string, unknown>;
  const token = typeof record.token === "string" && record.token ? record.token : null;
  const { token: _removed, ...safePayload } = record;
  return { payload: safePayload, token };
}

/** UI 상태용 만료 검사. 실제 인증·서명 검증은 백엔드가 수행한다. */
export function isTokenUnexpired(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString()) as { exp?: unknown };
    return typeof payload.exp === "number" && payload.exp > now;
  } catch {
    return false;
  }
}
