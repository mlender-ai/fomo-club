const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "DELETE"]);

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",", 1)[0]?.trim();
  return first || null;
}

function toOrigin(protocol: string, host: string): string | null {
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

export function isStateChangingMethod(method: string): boolean {
  return STATE_CHANGING_METHODS.has(method.toUpperCase());
}

export function isTrustedRequestOrigin(
  method: string,
  headers: Headers,
  requestUrl: URL
): boolean {
  if (!isStateChangingMethod(method)) return true;

  const originHeader = headers.get("origin");
  if (!originHeader || originHeader === "null") return false;

  let requestOrigin: string;
  try {
    requestOrigin = new URL(originHeader).origin;
  } catch {
    return false;
  }

  const trustedOrigins = new Set<string>([requestUrl.origin]);
  const forwardedProto = firstHeaderValue(headers.get("x-forwarded-proto"));
  const protocol = forwardedProto ?? requestUrl.protocol.replace(":", "");

  for (const hostHeader of [headers.get("x-forwarded-host"), headers.get("host")]) {
    const host = firstHeaderValue(hostHeader);
    if (!host) continue;

    const origin = toOrigin(protocol, host);
    if (origin) trustedOrigins.add(origin);
  }

  return trustedOrigins.has(requestOrigin);
}
