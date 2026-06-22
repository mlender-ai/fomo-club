/**
 * FOMO Index 파이프라인 구조화 에러 로깅 (#415).
 * Heat 산출 실패 시 원인·폴백 여부·타임스탬프를 구조화해 남긴다.
 * console.warn 을 직접 호출하던 패턴 대신 이 유틸로 통일 — 운영 시 Slack/로그 수집기 연동 가능.
 */

export type HeatLogLevel = "ERROR" | "WARNING";

export interface HeatLogEntry {
  level: HeatLogLevel;
  heatKey: string;
  message: string;
  fallbackUsed: boolean;
  timestamp: string;
  error?: string;
}

const logBuffer: HeatLogEntry[] = [];

export function logHeatError(
  heatKey: string,
  message: string,
  err: unknown,
  fallbackUsed = true,
): void {
  const entry: HeatLogEntry = {
    level: "ERROR",
    heatKey,
    message,
    fallbackUsed,
    timestamp: new Date().toISOString(),
    error: err instanceof Error ? err.message : String(err),
  };
  logBuffer.push(entry);
  console.warn(`[fomo-core/${heatKey}] ${message}`, err);
}

export function logHeatWarning(heatKey: string, message: string): void {
  const entry: HeatLogEntry = {
    level: "WARNING",
    heatKey,
    message,
    fallbackUsed: false,
    timestamp: new Date().toISOString(),
  };
  logBuffer.push(entry);
  console.warn(`[fomo-core/${heatKey}] ${message}`);
}

export function drainLogBuffer(): HeatLogEntry[] {
  return logBuffer.splice(0, logBuffer.length);
}

export function peekLogBuffer(): readonly HeatLogEntry[] {
  return logBuffer;
}
