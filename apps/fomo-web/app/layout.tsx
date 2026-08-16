import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: {
    default: "FOMO Club",
    template: "%s | FOMO Club",
  },
  // 문구는 PRODUCT_VISION §1(한 줄 정의)·§2.2(취향)·§2.4(💎 조기 발견)에 맞춘다.
  // "테마" 를 뺀 이유: §3.2 가 테마 카드를 발견 표면에서 **폐기**했다(발견 표면은 종목 카드만).
  // "취향" 은 그대로 둔다 — 폐기된 적 없는 v5 핵심 철학이다(§2.2·§7).
  // §5.1 예측 금지선: "곧 오른다/급등 임박" 류는 메타 문구에도 쓰지 않는다.
  description: "종목을 스와이프하며 내 취향의 종목을 발견하고, 수급이 먼저 들어오는 순간을 사실로 확인하는 종목 카드 피드.",
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
    title: "FOMO Club — 주식시장의 틴더",
    description: "종목을 넘겨 보며 내 취향의 종목을 발견하고, 수급이 먼저 들어오는 순간을 사실로 확인하세요.",
  },
  twitter: {
    card: "summary",
    title: "FOMO Club — 주식시장의 틴더",
    description: "종목을 넘겨 보며 내 취향의 종목을 발견하고, 수급이 먼저 들어오는 순간을 사실로 확인하세요.",
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
