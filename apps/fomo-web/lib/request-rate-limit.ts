type LimitWindow = {
  count: number;
  resetAt: number;
};

type RateLimitRule = {
  limit: number;
  windowMs: number;
  scope: "ip" | "ip-path";
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const bucketStore = new Map<string, LimitWindow>();

const DEFAULT_RULE: RateLimitRule = { limit: 90, windowMs: 60_000, scope: "ip-path" };

const RULES: Array<{ match: RegExp; rule: RateLimitRule }> = [
  { match: /^auth\/(login|register)$/, rule: { limit: 5, windowMs: 10 * 60_000, scope: "ip-path" } },
  { match: /^auth\/session$/, rule: { limit: 60, windowMs: 60_000, scope: "ip" } },
  { match: /^auth\/logout$/, rule: { limit: 20, windowMs: 60_000, scope: "ip" } },
  { match: /^(emotions\/vote|taste|taste\/link|emotions\/link|challenges|account)$/, rule: { limit: 30, windowMs: 60_000, scope: "ip-path" } },
];

function resolveRule(path: string): RateLimitRule {
  return RULES.find((entry) => entry.match.test(path))?.rule ?? DEFAULT_RULE;
}

export function getClientIp(forwardedFor: string | null): string {
  return (
    forwardedFor
      ?.split(",")[0]
      ?.trim()
      ?.slice(0, 128) || "unknown"
  );
}

export function consumeRateLimit(path: string, forwardedFor: string | null, now = Date.now()): RateLimitResult {
  const rule = resolveRule(path);
  const ip = getClientIp(forwardedFor);
  const bucketKey = rule.scope === "ip" ? ip : `${ip}:${path}`;
  const current = bucketStore.get(bucketKey);

  if (!current || current.resetAt <= now) {
    bucketStore.set(bucketKey, { count: 1, resetAt: now + rule.windowMs });
    return {
      allowed: true,
      remaining: Math.max(rule.limit - 1, 0),
      retryAfterSeconds: Math.ceil(rule.windowMs / 1000),
    };
  }

  if (current.count >= rule.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(rule.limit - current.count, 0),
    retryAfterSeconds: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
  };
}

export function resetRateLimitStore(): void {
  bucketStore.clear();
}
