import { apiFetch } from "./api";

type EventName =
  | "app_open"
  | "draw_start"
  | "draw_complete"
  | "draw_error"
  | "feedback_submit"
  | "report_submit"
  | "ad_loaded"
  | "ad_shown"
  | "ad_earned"
  | "ad_error"
  | "iap_start"
  | "iap_complete"
  | "iap_error"
  | "favorite_add"
  | "favorite_remove"
  | "share_result"
  | "share_reward";

interface AnalyticsEvent {
  event: EventName;
  properties?: Record<string, string | number | boolean>;
  timestamp: string;
}

const eventQueue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_INTERVAL = 30_000; // 30초마다 배치 전송
const MAX_QUEUE_SIZE = 20;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL);
}

async function flush() {
  if (eventQueue.length === 0) return;
  const batch = eventQueue.splice(0, MAX_QUEUE_SIZE);
  try {
    await apiFetch("/api/tarot/analytics", {
      method: "POST",
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // 실패 시 큐에 다시 넣기 (최대 1회 재시도)
    eventQueue.unshift(...batch);
  }
}

export function trackEvent(event: EventName, properties?: Record<string, string | number | boolean>) {
  eventQueue.push({
    event,
    properties,
    timestamp: new Date().toISOString(),
  });

  if (eventQueue.length >= MAX_QUEUE_SIZE) {
    flush();
  } else {
    scheduleFlush();
  }
}

export function flushAnalytics() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return flush();
}
