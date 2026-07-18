/* FOMO Club 서비스워커 (2026-07-18) — 설치형 PWA 요건(fetch 핸들러) + 가벼운 오프라인.
 *
 * 정책(정직·안전 우선):
 * - 내비게이션(HTML): 네트워크 우선 → 실패 시 마지막으로 캐시된 셸 → 그것도 없으면 오프라인 안내.
 *   시세·피드는 신선도가 생명이라 페이지를 캐시로 고정하지 않는다(항상 네트워크 먼저).
 * - 정적 자산(_next/static, 아이콘): 캐시 우선(불변 해시 파일).
 * - API(/api/*): 절대 캐시하지 않는다(no-store 원칙 — 스테일 시세 금지).
 * - 배포마다 CACHE 버전을 올려 구 캐시를 정리한다.
 */
const VERSION = "fomo-pwa-v1";
const STATIC_CACHE = `${VERSION}-static`;
const SHELL_CACHE = `${VERSION}-shell`;
const OFFLINE_URL = "/";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(["/icon-192.png", "/icon-512.png", "/manifest.webmanifest"]).catch(() => undefined)
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 크로스오리진(백엔드 API 등)은 손대지 않는다
  if (url.pathname.startsWith("/api/")) return; // API 는 no-store — 캐시 금지(스테일 시세 방지)

  // 내비게이션(문서): 네트워크 우선, 실패 시 캐시된 셸 폴백.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(OFFLINE_URL, copy)).catch(() => undefined);
          return res;
        })
        .catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error())
    );
    return;
  }

  // 정적 해시 자산: 캐시 우선(있으면 즉시, 없으면 받아서 캐시).
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon") || url.pathname === "/apple-touch-icon.png") {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
            return res;
          })
      )
    );
  }
});
