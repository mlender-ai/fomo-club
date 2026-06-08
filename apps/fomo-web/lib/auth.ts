// 로그인 토큰 보관. 타로 인증 백엔드가 발급한 JWT를 localStorage에 저장하고
// Authorization: Bearer 로 fomo API에 보낸다(크로스오리진이라 쿠키 대신 Bearer).
// docs/IDENTITY_AND_MILESTONES.md §M2 — 캘린더(기록) 영속화는 가입자만.
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
