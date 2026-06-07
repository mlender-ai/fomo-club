"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BannerItem } from "@/lib/fomoApi";

/**
 * 롤링 배너 — 한 항목씩 멈췄다 교체(가독성). 항목 클릭 시 상세페이지로.
 * DESIGN_FOMO: surface 1줄, 픽셀 메타, 절제된 모션. prefers-reduced-motion 시 자동 정지.
 * 정체성: "혼자가 아님의 신호" — 코인·거시 시장도 같이 물려있음을 담담히 보여준다.
 */
const ROTATE_MS = 4000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function RollingBanner({ items }: { items: BannerItem[] }) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);

  // 항목 수가 바뀌면 인덱스 보정
  useEffect(() => {
    if (idx >= items.length) setIdx(0);
  }, [items.length, idx]);

  useEffect(() => {
    if (items.length <= 1 || prefersReducedMotion()) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % items.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [items.length]);

  if (items.length === 0) return null;
  const item = items[idx] ?? items[0]!;

  const go = () => router.push(`/insight/${encodeURIComponent(item.id)}`);

  return (
    <button
      type="button"
      onClick={go}
      aria-label={`${item.text} — 자세히 보기`}
      className="group flex w-full items-center gap-2 overflow-hidden rounded-xl border border-hairline bg-surface px-4 py-2.5 text-left transition-colors hover:border-muted"
    >
      <span aria-hidden className="shrink-0 text-sm">
        {item.emoji}
      </span>
      <span
        key={item.id}
        aria-live="polite"
        className="fomo-rise min-w-0 flex-1 truncate font-pixel text-xs text-muted group-hover:text-whiteout"
      >
        {item.text}
      </span>
      <span
        aria-hidden
        className="shrink-0 font-pixel text-xs text-hairline transition-colors group-hover:text-muted"
      >
        ›
      </span>
    </button>
  );
}
