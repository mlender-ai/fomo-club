import type { MetadataRoute } from "next";

/**
 * PWA 매니페스트 (2026-07-18) — Next App Router 네이티브 메타데이터 라우트.
 * `/manifest.webmanifest` 로 서빙된다. 설치형 앱(홈 화면 추가·standalone) 요건:
 * HTTPS + 이 매니페스트(192·512 아이콘 + maskable) + fetch 핸들러 있는 서비스워커(sw.js).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // layout.tsx 의 메타 문구와 **같이 움직인다**(LAUNCH-P1 §A-4). 한쪽만 고치면 설치 앱과
    // 웹이 다른 제품을 말하고, 앱스토어 심사에서 그게 불일치로 잡힌다.
    name: "FOMO Club — 오늘의 조용한 돈",
    short_name: "FOMO Club",
    description: "뉴스가 나기 전에 돈이 먼저 들어간 종목을 찾아 보여드려요. 기관·외국인·임원이 조용히 사고 있는 곳, 그때 무슨 공시가 있었는지까지 함께 봅니다.",
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
