"use client";

/**
 * Flicker Ripple Spinner — 7×7 점 격자가 중심에서 바깥으로 opacity 파동치는 로더.
 * (laurie.fyi/flicker 의 ripple 스피너를 우리 색으로 옮김 — 회전 아님, opacity ripple.)
 *
 * 색: 프라이머리 = 네온옐로우(text-neon, currentColor). off 상태는 같은 색 저(低)opacity.
 * 기본 크기 16×16(px). prefers-reduced-motion 존중.
 */

const COORDS = [3, 9, 15, 21, 27, 33, 39] as const; // 42 viewBox, 6칸 간격
const CENTER = 21;
const DURATION_S = 1.35;

// 각 점의 중심거리 → 링(파동 단계). 바깥일수록 늦게 켜져 중심→밖 ripple.
const DOTS = COORDS.flatMap((cy) =>
  COORDS.map((cx) => ({
    cx,
    cy,
    ring: Math.round(Math.hypot((cx - CENTER) / 6, (cy - CENTER) / 6)),
  }))
);
const MAX_RING = Math.max(...DOTS.map((d) => d.ring));

export function FlickerSpinner({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 42 42"
      role="img"
      aria-label="로딩 중"
      className={`text-neon ${className}`}
    >
      <title>로딩 중</title>
      <style>{`
        @keyframes flicker-ripple { 0%, 100% { opacity: 0.18; } 50% { opacity: 1; } }
        .flicker-dot { animation: flicker-ripple ${DURATION_S}s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .flicker-dot { animation: none; opacity: 0.5; }
        }
      `}</style>
      {DOTS.map((d, i) => (
        <circle
          key={i}
          cx={d.cx}
          cy={d.cy}
          r={2}
          fill="currentColor"
          className="flicker-dot"
          style={{ animationDelay: `${-(d.ring / MAX_RING) * DURATION_S}s` }}
        />
      ))}
    </svg>
  );
}
