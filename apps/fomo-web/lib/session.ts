// 무가입 익명 세션. 첫 방문 시 localStorage에 sessionId 발급/복원.
// docs/FOMO_CLUB.md 정직한 숫자 원칙 — 가입 없이 감정 선택이 곧 데이터.
const KEY = "fomo_session_id";
const SIG_KEY = "fomo_session_sig";

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

/** HMAC 서명 저장 (서버의 /api/fomo/session/sign 응답을 저장). */
export function setSessionSignature(sig: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIG_KEY, sig);
}

/** 저장된 HMAC 서명 반환 (없으면 undefined — 기존 클라이언트 호환). */
export function getSessionSignature(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(SIG_KEY) ?? undefined;
}
