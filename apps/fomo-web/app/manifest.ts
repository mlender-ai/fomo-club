import type { MetadataRoute } from "next";

/**
 * PWA 매니페스트 (2026-07-18) — Next App Router 네이티브 메타데이터 라우트.
 * `/manifest.webmanifest` 로 서빙된다. 설치형 앱(홈 화면 추가·standalone) 요건:
 * HTTPS + 이 매니페스트(192·512 아이콘 + maskable) + fetch 핸들러 있는 서비스워커(sw.js).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FOMO Club — 취향투자 발견",
    short_name: "FOMO Club",
    description: "스와이프로 투자 취향을 학습해 오늘의 테마와 종목을 쉽게 발견하는 피드.",
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
