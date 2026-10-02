/**
 * `/me/*` — 광혁 전용(TRADER-03). **검색엔진에 싣지 않는다** · 공개 화면 어디서도 링크하지 않는다.
 * 잠금은 각 화면(서버)과 `/api/me/*` 가 직접 건다 — 화면만 막고 API 를 열어두지 않는다.
 */
import type { ReactNode } from "react";

import "./me.css";

export const metadata = {
  title: "나 — FOMO LAB",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function MeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
