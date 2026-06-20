// 로그인 토큰 보관. FOMO Club 인증(/api/fomo/auth/*)이 발급한 JWT를 localStorage에 저장하고
// Authorization: Bearer 로 fomo API에 보낸다(크로스오리진이라 쿠키 대신 Bearer).
// 트랙 B — 로그인하면 취향 신호가 유저별로 서버에 쌓인다(가입 전 익명 sessionId 도 로그인 시 연결).
const TOKEN_KEY = "fomo_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
