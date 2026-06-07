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

function emit(level: LogLevel, service: string, msg: string, ctx?: Record<string, unknown>) {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    service,
    msg,
    ...ctx,
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
