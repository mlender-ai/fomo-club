/**
 * useAuth — 소셜 로그인 훅
 *
 * 플랫폼 정책:
 *  iOS  → Apple(필수) / Google / Kakao / Naver
 *  Android → Google / Kakao / Naver (Apple 없음)
 *
 * 네이티브 모듈은 try-require 패턴으로 Expo Go 안전하게 로드.
 * 토큰은 expo-secure-store에 저장.
 */

import { Platform, Alert } from "react-native";
import { useUserStore } from "./store";
import { apiFetch } from "./api";

// ─── 모듈 lazy-load (네이티브) ────────────────────────────────────────────────

let SecureStore: {
  setItemAsync(key: string, value: string): Promise<void>;
  getItemAsync(key: string): Promise<string | null>;
  deleteItemAsync(key: string): Promise<void>;
} | null = null;

let AppleAuth: {
  performRequest(req: { requestedOperation: number; requestedScopes: number[] }): Promise<{
    identityToken: string | null;
    fullName?: { givenName?: string | null; familyName?: string | null } | null;
  }>;
  Operation: { LOGIN: number };
  Scope: { FULL_NAME: number; EMAIL: number };
} | null = null;

let Google: {
  useAuthRequest(
    config: object,
    discovery: object
  ): [
    object | null,
    { type: string; params?: { code?: string; access_token?: string } } | null,
    (opts?: object) => Promise<{ type: string }>,
  ];
} | null = null;

let KakaoLogin: {
  login(): Promise<{ accessToken: string }>;
} | null = null;

let NaverLogin: {
  login(config: {
    consumerKey: string;
    consumerSecret: string;
    appName: string;
    serviceUrlScheme: string;
  }): Promise<{ isSuccess: boolean; successResponse?: { accessToken: string }; failureResponse?: { message: string } }>;
} | null = null;

try { SecureStore = require("expo-secure-store"); } catch {}
try {
  if (Platform.OS === "ios") {
    // 변수에 담아 Metro 정적 분석 우회
    const modName = "@invertase/react-native-apple-authentication";
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    AppleAuth = require(modName).default;
  }
} catch {}
try { KakaoLogin = require("@react-native-seoul/kakao-login"); } catch {}
try { NaverLogin = require("@react-native-seoul/naver-login"); } catch {}

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const TOKEN_KEY = "tarot_jwt";
const USER_KEY = "tarot_user";

const KAKAO_APP_KEY = process.env["EXPO_PUBLIC_KAKAO_APP_KEY"] ?? "";
const NAVER_CLIENT_ID = process.env["EXPO_PUBLIC_NAVER_CLIENT_ID"] ?? "";
const NAVER_CLIENT_SECRET = process.env["EXPO_PUBLIC_NAVER_CLIENT_SECRET"] ?? "";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type SocialProvider = "apple" | "google" | "kakao" | "naver";

interface LoginResponse {
  token: string;
  user: {
    id: string;
    displayName: string | null;
    credits: number;
    isNew: boolean;
  };
}

// ─── 토큰 저장/조회 ───────────────────────────────────────────────────────────

export async function saveToken(token: string): Promise<void> {
  if (SecureStore) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export async function getToken(): Promise<string | null> {
  if (SecureStore) {
    return SecureStore.getItemAsync(TOKEN_KEY);
  }
  return null;
}

export async function clearToken(): Promise<void> {
  if (SecureStore) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  }
}

// ─── 서버 로그인 공통 ──────────────────────────────────────────────────────────

async function loginToServer(
  provider: string,
  identityToken: string,
  displayName?: string
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/api/tarot/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, identityToken, displayName }),
  });
}

// ─── useAuth 훅 ───────────────────────────────────────────────────────────────

export function useAuth() {
  const { setUser, logout: storeLogout } = useUserStore();

  /**
   * 저장된 토큰으로 자동 로그인 (앱 시작 시 호출)
   */
  async function restoreSession(): Promise<boolean> {
    const token = await getToken();
    if (!token) return false;
    try {
      const data = await apiFetch<{ userId: string; credits: number }>(
        "/api/tarot/credits",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUser(data.userId, token, data.credits);
      return true;
    } catch {
      await clearToken();
      return false;
    }
  }

  /**
   * Apple 로그인 — iOS 전용
   */
  async function loginWithApple(): Promise<void> {
    if (Platform.OS !== "ios") throw new Error("Apple login is iOS only");
    if (!AppleAuth) throw new Error("apple-auth module not available");

    const credential = await AppleAuth.performRequest({
      requestedOperation: AppleAuth.Operation.LOGIN,
      requestedScopes: [AppleAuth.Scope.FULL_NAME, AppleAuth.Scope.EMAIL],
    });

    if (!credential.identityToken) throw new Error("Apple identity token missing");

    const displayName = credential.fullName
      ? [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean)
          .join(" ") || undefined
      : undefined;

    const data = await loginToServer("APPLE", credential.identityToken, displayName);
    await saveToken(data.token);
    setUser(data.user.id, data.token, data.user.credits);
  }

  /**
   * Google 로그인 — iOS / Android 공통
   * expo-auth-session 사용 (웹 기반 OAuth flow)
   */
  async function loginWithGoogle(): Promise<void> {
    // Google OAuth는 expo-auth-session의 useAuthRequest가 필요해
    // 컴포넌트 레벨 훅이므로 여기서는 결과를 받아서 처리하는 함수만 제공
    // 실제 호출은 LoginScreen에서 useGoogleAuth()로 분리
    throw new Error("Google login must use useGoogleAuth() hook in component");
  }

  /**
   * Kakao 로그인 — iOS / Android 공통
   */
  async function loginWithKakao(): Promise<void> {
    if (!KakaoLogin) throw new Error("Kakao login module not available");

    const { accessToken } = await KakaoLogin.login();
    const data = await loginToServer("KAKAO", accessToken);
    await saveToken(data.token);
    setUser(data.user.id, data.token, data.user.credits);
  }

  /**
   * Naver 로그인 — iOS / Android 공통
   */
  async function loginWithNaver(): Promise<void> {
    if (!NaverLogin) throw new Error("Naver login module not available");
    if (!NAVER_CLIENT_ID) throw new Error("NAVER_CLIENT_ID not configured");

    const result = await NaverLogin.login({
      consumerKey: NAVER_CLIENT_ID,
      consumerSecret: NAVER_CLIENT_SECRET,
      appName: "타로 증권",
      serviceUrlScheme: "tarot",
    });

    if (!result.isSuccess || !result.successResponse?.accessToken) {
      throw new Error(result.failureResponse?.message ?? "Naver login failed");
    }

    const data = await loginToServer("NAVER", result.successResponse.accessToken);
    await saveToken(data.token);
    setUser(data.user.id, data.token, data.user.credits);
  }

  /**
   * 로그아웃
   */
  async function logout(): Promise<void> {
    await clearToken();
    storeLogout();
  }

  /**
   * 플랫폼에서 사용 가능한 로그인 제공자 목록
   */
  function getAvailableProviders(): SocialProvider[] {
    const providers: SocialProvider[] = ["google", "kakao", "naver"];
    if (Platform.OS === "ios") providers.unshift("apple");
    return providers;
  }

  return {
    restoreSession,
    loginWithApple,
    loginWithGoogle,
    loginWithKakao,
    loginWithNaver,
    logout,
    getAvailableProviders,
  };
}
