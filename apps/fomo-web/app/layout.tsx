import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: {
    default: "FOMO Club",
    template: "%s | FOMO Club",
  },
  description: "스와이프로 투자 취향을 학습해 오늘의 테마와 종목을 쉽게 매칭하는 피드.",
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
    title: "FOMO Club — 내 취향 투자 피드",
    description: "오늘 볼 만한 시장 테마와 종목을 넘겨 보고, 내 취향에 맞는 투자 정보를 쉽게 발견하세요.",
  },
  twitter: {
    card: "summary",
    title: "FOMO Club — 내 취향 투자 피드",
    description: "오늘 볼 만한 시장 테마와 종목을 넘겨 보고, 내 취향에 맞는 투자 정보를 쉽게 발견하세요.",
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
