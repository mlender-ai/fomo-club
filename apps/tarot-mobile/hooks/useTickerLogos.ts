import { useEffect } from "react";
import Constants from "expo-constants";
import { useTickerLogoStore } from "../lib/tickerLogoStore";

const API_BASE =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  "http://localhost:3000";

/** 앱 마운트 시 한 번만 로고 오버라이드를 서버에서 가져와 Zustand 스토어에 저장 */
export function useTickerLogos() {
  const loadingState = useTickerLogoStore((s) => s.loadingState);
  const setLogos = useTickerLogoStore((s) => s._setLogos);
  const setLoadingState = useTickerLogoStore((s) => s._setLoadingState);

  useEffect(() => {
    if (loadingState !== "idle") return;
    setLoadingState("loading");

    fetch(`${API_BASE}/api/tarot/ticker-logos`)
      .then((r) => r.json())
      .then((data: { overrides?: Record<string, string> }) => {
        if (data.overrides && typeof data.overrides === "object") {
          setLogos(data.overrides);
        } else {
          setLoadingState("done");
        }
      })
      .catch(() => {
        setLoadingState("error");
      });
  }, [loadingState, setLogos, setLoadingState]);
}
