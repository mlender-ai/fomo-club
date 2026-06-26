"use client";

/**
 * 스플래시 — 최초 진입 시 1회만 노출. 브랜드 정체성 각인.
 * leaving=true 면 fade-out 후 onDone() 호출.
 */
export function SplashScreen({ leaving = false, onDone }: { leaving?: boolean; onDone: () => void }) {
  return (
    <main
      className={`fixed inset-0 z-50 flex flex-col bg-canvas px-6 transition-opacity duration-500 ${
        leaving ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* 상단 여백 */}
      <div className="flex flex-1 flex-col justify-center">
        <p className="font-pixel text-xs font-bold tracking-widest text-neon">FOMO CLUB</p>
        <h1 className="mt-4 text-[2.5rem] font-bold leading-tight text-whiteout">
          당신을 위한<br />
          <span className="text-neon">취향투자</span> 클럽
        </h1>
        <p className="mt-4 text-[15px] leading-6 text-muted">
          멈춰 보게 되는 종목이<br />당신의 기준이다.
        </p>
      </div>

      {/* CTA */}
      <div className="pb-14">
        <button
          onClick={onDone}
          className="w-full rounded-full bg-neon py-4 text-[15px] font-bold text-black"
        >
          발견 시작
        </button>
      </div>
    </main>
  );
}
