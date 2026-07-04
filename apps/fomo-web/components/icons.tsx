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

/** 관심(LIKE) 스탬프 — 채워진 하트(틴더식). */
export function HeartIcon({ size = 48, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor" aria-hidden>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

/** 패스(NOPE) 스탬프 — 굵은 X(틴더식). */
export function XMarkIcon({ size = 48, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" />
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

/** 되돌리기 — 직전 스와이프 카드 복구. */
export function UndoIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 1 1-4.25 10.25" />
    </svg>
  );
}

/** 🔍 대체 — 검색(WO 검색). */
export function SearchIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.7-4.7" />
    </svg>
  );
}
