const KEY = "fomo_discovery_metrics";

export type DiscoveryMetricEvent =
  | "deck_mount"
  | "first_card_display"
  | "card_hydrate"
  | "swipe"
  | "depth_open"
  | "interest_button";

export interface DiscoveryMetricState {
  sessionId: string;
  sessionStartedAt: number;
  firstCardMs?: number;
  firstSwipeMs?: number;
  swipes: number;
  rightSwipes: number;
  leftSwipes: number;
  depthOpens: number;
  interestButtonClicks: number;
  hydrateCompletions: number;
  swipesBeforeHydrate: number;
  reachedTenSwipes: boolean;
}

export interface DiscoveryMetricPayload {
  nowMs?: number;
  elapsedMs?: number;
  direction?: "left" | "right";
  hydrated?: boolean;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function createState(nowMs = now()): DiscoveryMetricState {
  return {
    sessionId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sessionStartedAt: nowMs,
    swipes: 0,
    rightSwipes: 0,
    leftSwipes: 0,
    depthOpens: 0,
    interestButtonClicks: 0,
    hydrateCompletions: 0,
    swipesBeforeHydrate: 0,
    reachedTenSwipes: false,
  };
}

function readState(): DiscoveryMetricState {
  if (typeof window === "undefined") return createState();
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DiscoveryMetricState) : createState();
  } catch {
    return createState();
  }
}

function writeState(state: DiscoveryMetricState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 계측 실패는 제품 흐름을 막지 않는다 */
  }
}

export function applyDiscoveryMetricEvent(
  state: DiscoveryMetricState,
  event: DiscoveryMetricEvent,
  payload: DiscoveryMetricPayload = {}
): DiscoveryMetricState {
  const next = { ...state };
  const elapsed = payload.elapsedMs ?? Math.max(0, (payload.nowMs ?? now()) - state.sessionStartedAt);
  if (event === "first_card_display" && next.firstCardMs === undefined) next.firstCardMs = elapsed;
  if (event === "card_hydrate") next.hydrateCompletions += 1;
  if (event === "depth_open") next.depthOpens += 1;
  if (event === "interest_button") next.interestButtonClicks += 1;
  if (event === "swipe") {
    next.swipes += 1;
    if (next.firstSwipeMs === undefined) next.firstSwipeMs = elapsed;
    if (payload.direction === "right") next.rightSwipes += 1;
    if (payload.direction === "left") next.leftSwipes += 1;
    if (payload.hydrated === false) next.swipesBeforeHydrate += 1;
    if (next.swipes >= 10) next.reachedTenSwipes = true;
  }
  return next;
}

export function recordDiscoveryEvent(event: DiscoveryMetricEvent, payload: DiscoveryMetricPayload = {}): void {
  const state = applyDiscoveryMetricEvent(readState(), event, payload);
  writeState(state);
  if (process.env.NODE_ENV !== "production") {
    console.debug("[discovery-metric]", event, payload, state);
  }
}

export function readDiscoveryMetrics(): DiscoveryMetricState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DiscoveryMetricState) : null;
  } catch {
    return null;
  }
}
