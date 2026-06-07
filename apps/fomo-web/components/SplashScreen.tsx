"use client";

import { FomoFace } from "@/components/FomoFace";

/**
 * 스플래시 — 진입 여정의 첫 호흡. 검정 배경에 포모가 떠오르고 로고/태그라인이 뜬다.
 * 타이밍은 오케스트레이터(app/page.tsx)가 관리. 여기는 표시만.
 * leaving=true면 부드럽게 사라진다(다음 phase로 양보).
 */
export function SplashScreen({ leaving = false }: { leaving?: boolean }) {
  return (
    <main
      className={`flex min-h-screen flex-col items-center justify-center bg-ink px-6 ${
        leaving ? "fomo-fade-out" : ""
      }`}
    >
      <div className="fomo-splash-in flex flex-col items-center">
        <FomoFace face="calm" size={108} />
        <p className="mt-7 font-pixel text-lg tracking-wide text-whiteout">FOMO CLUB</p>
        <p className="mt-2 text-sm text-muted">나만 그런 게 아니구나.</p>
      </div>
    </main>
  );
}
