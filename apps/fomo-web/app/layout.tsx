import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: {
    default: "FOMO Club",
    template: "%s | FOMO Club",
  },
  /**
   * LAUNCH-P1 §A — **메타가 피봇 이전이었다.**
   *
   * 본문은 `오늘의 조용한 돈` 인데 공유 카드와 검색 결과에는 `주식시장의 틴더` 가 떴다
   * (2026-09-08 프로덕션 head 실측). 링크를 공유하면 첫인상이 전부 이 문구로 결정된다.
   *
   * `틴더` · `취향` · `스와이프` · `발견` 을 뺀다 — 넷 다 피봇 이전 포지셔닝의 말이다.
   * 본문 헤드(`오늘의 조용한 돈` / `뉴스 나오기 전에 돈이 먼저 들어간 곳`)와 같은 말을 쓴다:
   * 화면과 메타가 다른 제품을 말하면 어느 쪽이 거짓이다.
   *
   * §5.1 예측 금지선은 그대로다 — "곧 오른다/급등 임박" 류는 메타 문구에도 쓰지 않는다.
   * 여기 쓰인 것은 전부 **이미 일어난 사실**(돈이 먼저 들어갔다 · 조용히 사고 있다)이다.
   */
  description:
    "뉴스가 나기 전에 돈이 먼저 들어간 종목을 찾아 보여드려요. 기관·외국인·임원이 조용히 사고 있는 곳, 그때 무슨 공시가 있었는지까지 함께 봅니다.",
  applicationName: "FOMO Club",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "FOMO Club",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "FOMO Club",
    title: "FOMO Club — 오늘의 조용한 돈",
    description: "뉴스가 나기 전에 돈이 먼저 들어간 종목을 찾아 보여드려요.",
    /**
     * 공유 카드 그림(§A-5). 없으면 카카오톡·슬랙이 **아이콘만** 띄워서 무슨 앱인지 안 보인다.
     * `scripts/build-og-image.ts` 가 만든 정적 PNG 다 — 요청 시점에 그리지 않는다(느리고 깨진다).
     */
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "FOMO Club — 오늘의 조용한 돈" }],
  },
  twitter: {
    // 그림이 생겼으므로 큰 카드로 올린다 — `summary` 는 아이콘 크기로 줄여 버린다.
    card: "summary_large_image",
    title: "FOMO Club — 오늘의 조용한 돈",
    description: "뉴스가 나기 전에 돈이 먼저 들어간 종목을 찾아 보여드려요.",
    images: [{ url: "/og.png", alt: "FOMO Club — 오늘의 조용한 돈" }],
  },
};

// 다크 테마 앱 — 상태바·주소창 색을 배경과 일치시키고, PWA standalone 에서 노치 안전영역 대응.
export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
