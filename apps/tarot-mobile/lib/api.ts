import Constants from "expo-constants";
import { useUserStore } from "./store";

// 우선순위: app config extra(apiBaseUrl) → EXPO_PUBLIC_API_BASE_URL → 배포 기본값.
// 빈 문자열은 무시(과거 ""로 인해 localhost 폴백 → 실기기에서 차트 등 전 API 실패한 버그 방지).
const configured = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)?.trim();
const API_BASE =
  (configured && configured.length > 0 ? configured : undefined) ??
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://taro-stock-web.vercel.app";

interface ApiError {
  error: string;
  code: string;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = useUserStore.getState().token;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string> | undefined) },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ApiError>;
    throw new Error(body.error ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}
