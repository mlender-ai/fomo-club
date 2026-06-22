// 인라인 SVG 아이콘 — 제품 전체 이모지 대체(이모지 금지 정책). currentColor 상속, size(px).
// Tabler/Lucide 류 outline·filled. 한 스트로크 일관.

type IconProps = { size?: number; className?: string; "aria-hidden"?: boolean };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24" });

/** 🔥 대체 — 주목 한복판(hot). */
export function FlameIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor" aria-hidden>
      <path d="M12 2c.4 3-1.6 4.3-2.8 5.7C8 9 7 10.4 7 12.5a5 5 0 0 0 10 0c0-2.2-1.2-3.8-2.3-5C13.4 6 12.8 4.2 12 2Zm0 17a2.4 2.4 0 0 1-2.4-2.4c0-1.4 1.2-2.2 1.7-3.2.6 1 2.4 1.8 2.4 3.3A2.2 2.2 0 0 1 12 19Z" />
    </svg>
  );
}

/** 💎 대체 — 오기 직전(incoming, 조기 발견). */
export function GemIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
      <path d="M6 3h12l3 6-9 12L3 9l3-6Z" />
      <path d="M3 9h18M9 3 7.5 9 12 21 16.5 9 15 3" />
    </svg>
  );
}

/** ⭐ 대체 — 대표 대장주(marquee). */
export function StarIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.5 14.9 8.4l6.5.95-4.7 4.58 1.1 6.47L12 17.9 6.2 20.4l1.1-6.47L2.6 9.35l6.5-.95L12 2.5Z" />
    </svg>
  );
}

/** ▲ 대체 — 상승(등락 데이터 전용, 봉인색). */
export function CaretUpIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor" aria-hidden>
      <path d="M12 7 19 17H5L12 7Z" />
    </svg>
  );
}

/** ▼ 대체 — 하락(등락 데이터 전용, 봉인색). */
export function CaretDownIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor" aria-hidden>
      <path d="M12 17 5 7h14l-7 10Z" />
    </svg>
  );
}
