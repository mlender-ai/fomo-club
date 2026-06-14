import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FOMO Club",
  description: "투자자들이 \"나만 그런 게 아니구나\"를 확인하는 공간. FOMO Index는 감정 체감 지표이며 투자 조언이 아닙니다.",
  /** @author 안티그래비티 — favicon + apple-touch-icon + manifest */
  icons: {
    icon: "/icon-512.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* @author 안티그래비티 — 모바일 브라우저 테마 컬러 (주소창 검정) */}
        <meta name="theme-color" content="#000000" />
      </head>
      <body>{children}</body>
    </html>
  );
}
