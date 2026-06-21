// 인증 토큰은 BFF의 HttpOnly 쿠키에만 보관한다.
// 브라우저 JavaScript는 토큰을 읽거나 쓰지 않고 세션 존재 여부만 같은 출처 API로 확인한다.
const LEGACY_TOKEN_KEY = "fomo_token";

export function clearLegacyBrowserToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export async function hasSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // 이전 버전의 JavaScript-readable JWT를 남기지 않는다. 보안을 위해 기존 사용자는 재로그인한다.
  clearLegacyBrowserToken();

  try {
    const response = await fetch("/api/fomo/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { authenticated?: boolean };
    return data.authenticated === true;
  } catch {
    return false;
  }
}
