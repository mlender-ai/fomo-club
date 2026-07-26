import { getSessionId } from "@/lib/session";

/**
 * WO-SUB-00 §4-2 — 픽 화면 행동 계측(클라이언트).
 *
 * 이전까지 라이브 픽 화면의 행동 신호는 서버로 한 건도 나가지 않았다
 * (`recordTaste` 는 no-op 스텁, `discoveryMetrics` 는 sessionStorage 전용).
 * 기준선이 없으면 이후 페이즈의 A/B 를 판정할 수 없어서 여기서 심는다.
 *
 * 설계: 배치 + 이탈 시 flush. 실패는 삼킨다 — 계측이 제품 흐름을 막으면 안 된다.
 */

export type PickTelemetryEvent =
  | { event: "card_view"; position: number }
  | { event: "card_dwell"; durationMs: number; position: number }
  | { event: "card_detail_open"; entryPoint: "tap" | "button"; position: number }
  | { event: "detail_scroll_depth"; maxRatio: number }
  | { event: "card_watchlist_add"; position: number }
  | { event: "deck_complete"; cardsConsumed: number }
  | { event: "card_skip"; position: number };

const ENDPOINT = "/api/fomo/ux-metrics";
const FLUSH_AFTER = 8;
const FLUSH_DELAY_MS = 4_000;

let queue: PickTelemetryEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

function post(events: readonly PickTelemetryEvent[], useBeacon: boolean): void {
  if (events.length === 0) return;
  const body = JSON.stringify({ sessionId: getSessionId(), events });
  try {
    if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      // 탭을 닫는 중에도 마지막 배치가 도착하도록 beacon 을 쓴다.
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: events.length <= 20,
      body,
    }).catch(() => undefined);
  } catch {
    /* 계측 실패는 삼킨다 */
  }
}

export function flushPickTelemetry(useBeacon = false): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const batch = queue;
  queue = [];
  post(batch, useBeacon);
}

function bindLifecycle(): void {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  // pagehide 는 iOS Safari 에서 unload 보다 신뢰할 수 있다. visibilitychange 는 앱 전환 대응.
  window.addEventListener("pagehide", () => flushPickTelemetry(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPickTelemetry(true);
  });
}

export function recordPickTelemetry(event: PickTelemetryEvent): void {
  if (typeof window === "undefined") return;
  bindLifecycle();
  queue.push(event);
  if (queue.length >= FLUSH_AFTER) {
    flushPickTelemetry();
    return;
  }
  if (!timer) timer = setTimeout(() => flushPickTelemetry(), FLUSH_DELAY_MS);
}

/** 테스트용 — 큐 상태를 들여다본다. */
export function __pickTelemetryQueue(): readonly PickTelemetryEvent[] {
  return queue;
}

/** 테스트용 — 큐를 비운다(전송 없이). */
export function __resetPickTelemetry(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  queue = [];
}
