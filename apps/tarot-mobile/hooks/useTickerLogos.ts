import { useEffect } from "react";
import Constants from "expo-constants";
import { setTickerLogoOverrides } from "../lib/tickerLogo";

const API_BASE =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  "http://localhost:3000";

let _fetched = false;

/** 앱 마운트 시 한 번만 로고 오버라이드를 서버에서 가져와 캐시에 저장 */
export function useTickerLogos() {
  useEffect(() => {
    if (_fetched) return;
    _fetched = true;

    fetch(`${API_BASE}/api/tarot/ticker-logos`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { overrides?: Record<string, string> }) => {
        if (data.overrides && typeof data.overrides === "object") {
          setTickerLogoOverrides(data.overrides);
        }
      })
      .catch(() => {
        // 실패 시 기본 매핑만 사용
      });
  }, []);
}
