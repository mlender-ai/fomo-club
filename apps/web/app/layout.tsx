import type { ReactNode } from "react";

import "./globals.css";

/**
 * LAB-01 PART E — 메타데이터를 랩 기준으로 교체했다.
 * 옛 값은 "리서치 브리핑 허브" 였다(소비자 제품).
 *
 * 랩 골격(상단 내비)은 `(lab)/layout.tsx` 가 가진다. `/login` 은 그 바깥이라
 * 내비 없이 자기 화면을 꽉 채운다.
 */
export const metadata = {
  title: "STRATEGY LAB",
  description: "전략들이 각자 독립 자본으로 페이퍼 매매하고, 같은 기준으로 비교되는 랩",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
