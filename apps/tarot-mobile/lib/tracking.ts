// ATT (App Tracking Transparency) — iOS 14.5+
// expo-tracking-transparency는 네이티브 모듈이므로 try-require 패턴 사용 (Expo Go 안전)

type TrackingStatus = "authorized" | "denied" | "restricted" | "undetermined" | "unavailable";

interface TrackingModule {
  requestTrackingPermissionsAsync(): Promise<{ status: TrackingStatus }>;
  getTrackingPermissionsAsync(): Promise<{ status: TrackingStatus }>;
}

let Tracking: TrackingModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Tracking = require("expo-tracking-transparency");
} catch {
  // Expo Go 또는 Android — ATT 불필요
}

/**
 * iOS에서 ATT 팝업을 표시하고 권한을 요청합니다.
 * Android / Expo Go에서는 항상 "authorized"를 반환합니다.
 * 광고 SDK 초기화 전에 반드시 호출해야 합니다.
 */
export async function requestTrackingPermission(): Promise<TrackingStatus> {
  if (!Tracking) return "authorized"; // Android / Expo Go

  try {
    const { status } = await Tracking.requestTrackingPermissionsAsync();
    return status;
  } catch {
    return "unavailable";
  }
}

/**
 * 현재 ATT 권한 상태를 조회합니다 (팝업 없음).
 */
export async function getTrackingStatus(): Promise<TrackingStatus> {
  if (!Tracking) return "authorized";

  try {
    const { status } = await Tracking.getTrackingPermissionsAsync();
    return status;
  } catch {
    return "unavailable";
  }
}

/**
 * ATT가 허용됐는지 여부 (광고 타게팅 가능 여부).
 */
export async function isTrackingAllowed(): Promise<boolean> {
  const status = await getTrackingStatus();
  return status === "authorized";
}

// ─── 이벤트 트래킹 ───────────────────────────────────────────────

export type TarotEvent =
  | "draw_started"
  | "draw_completed"
  | "draw_failed"
  | "feedback_submitted"
  | "report_submitted"
  | "ad_rewarded"
  | "credit_purchased"
  | "collection_viewed"
  | "analytics_viewed"
  | "onboarding_completed"
  | "news_modal_opened"
  | "news_modal_closed";

let _apiBase: string | null = null;
let _getToken: (() => string | null) | null = null;

/**
 * 트래킹 초기화. 앱 진입 시 1회 호출.
 */
export function initTracking(apiBase: string, getToken: () => string | null): void {
  _apiBase = apiBase;
  _getToken = getToken;
}

/**
 * 이벤트를 서버로 전송. fire-and-forget (실패 무시).
 * 로그인 전이거나 초기화 전이면 조용히 스킵.
 */
export function trackEvent(event: TarotEvent, properties?: Record<string, unknown>): void {
  if (!_apiBase || !_getToken) return;
  const token = _getToken();
  if (!token) return;

  fetch(`${_apiBase}/api/tarot/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ event, properties: properties ?? {}, ts: Date.now() }),
  }).catch(() => { /* 네트워크 오류 무시 */ });
}
