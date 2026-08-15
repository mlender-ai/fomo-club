import type { MetadataRoute } from "next";

/**
 * PWA 매니페스트 (2026-07-18) — Next App Router 네이티브 메타데이터 라우트.
 * `/manifest.webmanifest` 로 서빙된다. 설치형 앱(홈 화면 추가·standalone) 요건:
 * HTTPS + 이 매니페스트(192·512 아이콘 + maskable) + fetch 핸들러 있는 서비스워커(sw.js).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // layout.tsx 의 메타 문구와 같은 근거(PRODUCT_VISION §1·§2.2·§2.4·§3.2). 둘은 같이 움직인다.
    name: "FOMO Club — 캐주얼 투자 발견",
    short_name: "FOMO Club",
    description: "종목을 스와이프하며 내 취향의 종목을 발견하고, 수급이 먼저 들어오는 순간을 사실로 확인하는 종목 카드 피드.",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    categories: ["finance", "news"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
