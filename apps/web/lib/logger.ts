/**
 * 구조화 로거 — 서비스명·타임스탬프·레벨이 포함된 JSON 로그.
 * console.{debug,warn,error}를 그대로 사용하되, context 필드를 강제해 로그 탐색성을 높인다.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  service: string;
  msg: string;
  [key: string]: unknown;
}

const SENSITIVE_KEY_RE = /(?:authorization|cookie|password|secret|token|api[-_]?key)/i;
const MAX_CONTEXT_DEPTH = 6;

function redactSensitive(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > MAX_CONTEXT_DEPTH) return "[TRUNCATED]";
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1, seen));
  }

  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SENSITIVE_KEY_RE.test(key) ? "[REDACTED]" : redactSensitive(child, depth + 1, seen),
    ])
  );
}

function emit(level: LogLevel, service: string, msg: string, ctx?: Record<string, unknown>) {
  // production debug 로그는 토큰·개인정보 노출면과 로그 비용만 늘리므로 출력하지 않는다.
  if (level === "debug" && process.env.NODE_ENV === "production") return;

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    service,
    msg,
    ...(ctx ? (redactSensitive(ctx) as Record<string, unknown>) : undefined),
  };
  const line = JSON.stringify(entry);
  if (level === "debug") console.debug(line);
  else if (level === "warn") console.warn(line);
  else if (level === "error") console.error(line);
  else console.log(line);
}

export function createLogger(service: string) {
  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", service, msg, ctx),
    info:  (msg: string, ctx?: Record<string, unknown>) => emit("info",  service, msg, ctx),
    warn:  (msg: string, ctx?: Record<string, unknown>) => emit("warn",  service, msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => emit("error", service, msg, ctx),
  };
}
