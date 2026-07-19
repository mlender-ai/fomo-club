"use client";

import { useEffect } from "react";

/**
 * 서비스워커 등록 (PWA, 2026-07-18) — 프로덕션에서만 /sw.js 등록.
 * 개발 중엔 SW 캐시가 HMR·시세 신선도를 흐리므로 건너뛴다. 실패는 조용히(설치 UX 는 없어도 앱은 정상).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    // 초기 렌더·시세 fetch 와 경쟁하지 않게 load 이후 등록.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
    return undefined;
  }, []);
  return null;
}
